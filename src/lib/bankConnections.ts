// Connexions bancaires (Enable Banking) : expiration du consentement et retour d'autorisation.
// La synchro elle-même tourne côté Supabase (Edge Function « bank-sync », 8 h / 14 h / 20 h Paris).
import { supabase } from './supabase'
import type { BankConnection } from './bankConsent'
export { consentAlerts, type BankConnection } from './bankConsent'

export async function fetchBankConnections(): Promise<BankConnection[]> {
  const { data, error } = await supabase.from('fin_bank_connections')
    .select('id,source,aspsp_name,valid_until,status,last_sync_at,last_error').eq('status', 'active')
  if (error) return []
  return data as BankConnection[]
}

/** Lance l'autorisation (ajout ou renouvellement) : renvoie l'URL de la banque. */
export async function startBankAuth(aspsp: 'Boursorama Banque' | 'Crédit Coopératif'): Promise<string> {
  const { data, error } = await supabase.functions.invoke('bank-auth', { body: { action: 'start', aspsp } })
  if (error || !data?.url) throw new Error(error?.message ?? 'autorisation impossible')
  return data.url as string
}

/** Au retour de la banque (?code=…&state=eb-…) : enregistre la connexion puis nettoie l'URL. */
export async function finishBankAuthFromUrl(loc: Location = window.location): Promise<{ ok: boolean; message: string } | null> {
  const p = new URLSearchParams(loc.search)
  const code = p.get('code'), state = p.get('state')
  if (!code || !state?.startsWith('eb-')) return null
  window.history.replaceState(null, '', loc.pathname + loc.hash)
  const { data, error } = await supabase.functions.invoke('bank-auth', { body: { action: 'finish', code, state } })
  if (error || !data?.ok) return { ok: false, message: error?.message ?? data?.error ?? 'échec' }
  return { ok: true, message: `${data.banque} connectée jusqu'au ${new Date(data.valid_until).toLocaleDateString('fr-FR')}` }
}
