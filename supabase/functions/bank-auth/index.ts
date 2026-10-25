// ================================================================
// HORIZON — Edge Function « bank-auth »
// Ajout / renouvellement d'une connexion bancaire Enable Banking, fait par l'utilisateur lui-même.
//   { action: 'start', aspsp: 'Crédit Coopératif', source: 'coop' } -> { url } : page d'autorisation de la banque
//   { action: 'finish', code, state }  -> la banque redirige vers https://horizon-sigma-woad.vercel.app/?code=…&state=…,
//        l'app renvoie code+state ici : la session est créée et enregistrée dans fin_bank_connections
//        (comptes CACC rattachés automatiquement aux comptes Horizon de même n° ou, à défaut, à l'unique
//        compte courant de cette banque ; sinon « à rattacher »).
// JWT utilisateur obligatoire. Aucun secret ne transite par l'app : la clé privée reste dans les secrets Supabase.
// Secrets : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EB_APP_ID, EB_PRIVATE_KEY
// ================================================================
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { last4 } from '../_shared/bankSync.ts'
import * as eb from '../_shared/enableBanking.ts'

const REDIRECT = Deno.env.get('EB_REDIRECT_URL') ?? 'https://horizon-sigma-woad.vercel.app/'
const ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://horizon-sigma-woad.vercel.app,http://localhost:5173').split(',').map((s) => s.trim())
const cors = (req: Request) => {
  const o = req.headers.get('Origin') ?? ''
  return { 'Access-Control-Allow-Origin': ORIGINS.includes(o) || /^https:\/\/horizon-[a-z0-9-]+\.vercel\.app$/.test(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', Vary: 'Origin' }
}
const SOURCES: Record<string, string> = { 'Boursorama Banque': 'bourso', 'Crédit Coopératif': 'coop' }
const INSTITUTION: Record<string, string> = { bourso: 'bourso%', coop: 'cr%dit coop%' }

Deno.serve(async (req) => {
  const h = { ...cors(req), 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h })
  const reply = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: h })
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: u } = jwt ? await db.auth.getUser(jwt) : { data: { user: null } }
  if (!u.user) return reply({ error: 'non autorisé' }, 401)
  await eb.loadSecrets(db)
  const user = u.user.id
  const b = await req.json().catch(() => ({})) as { action?: string; aspsp?: string; code?: string; state?: string }
  try {
    if (b.action === 'start') {
      const aspsp = b.aspsp ?? ''
      const source = SOURCES[aspsp]
      if (!source) return reply({ error: 'banque non prise en charge' }, 400)
      const state = 'eb-' + crypto.randomUUID()
      const validUntil = new Date(Date.now() + 179 * 86400000).toISOString() // maximum autorisé : 180 j
      const r = await eb.startAuth({ access: { valid_until: validUntil }, aspsp: { name: aspsp, country: 'FR' }, state, redirect_url: REDIRECT, psu_type: 'personal' })
      const { error } = await db.from('fin_bank_auth_states').insert({ state, user_id: user, aspsp_name: aspsp, source })
      if (error) throw new Error(error.message)
      return reply({ url: r.url })
    }
    if (b.action === 'finish') {
      if (!b.code || !b.state) return reply({ error: 'code / state manquants' }, 400)
      const { data: st } = await db.from('fin_bank_auth_states').select('*').eq('state', b.state).eq('user_id', user)
        .gt('created_at', new Date(Date.now() - 3600000).toISOString()).maybeSingle()
      if (!st) return reply({ error: 'demande inconnue ou expirée' }, 400)
      const s = await eb.createSession(b.code)
      const { data: accs } = await db.from('fin_accounts').select('id,name,kind,institution,source').eq('user_id', user)
        .ilike('institution', INSTITUTION[st.source] ?? '%').eq('kind', 'courant').neq('source', 'virtuel')
      const { data: prev } = await db.from('fin_bank_connections').select('accounts').eq('user_id', user).eq('source', st.source).maybeSingle()
      const prevMap = new Map(((prev?.accounts ?? []) as { l4: string; account_id: string | null }[]).map((a) => [a.l4, a.account_id]))
      const cacc = s.accounts.filter((a) => (a.cash_account_type ?? 'CACC') === 'CACC')
      const accounts = s.accounts.map((a) => {
        const l4 = last4(a.account_id?.iban)
        let account_id = prevMap.get(l4) ?? null
        if (!account_id && (a.cash_account_type ?? 'CACC') === 'CACC' && cacc.length === 1 && accs?.length === 1) account_id = accs[0].id
        return { uid: a.uid, l4, name: a.name ?? null, type: a.cash_account_type ?? 'CACC', account_id }
      })
      const row = { user_id: user, source: st.source, aspsp_name: s.aspsp.name, session_id: s.session_id, valid_until: s.access.valid_until,
        accounts, status: 'active', last_error: null }
      const { error } = await db.from('fin_bank_connections').upsert(row, { onConflict: 'user_id,source' })
      if (error) throw new Error(error.message)
      await db.from('fin_bank_auth_states').delete().eq('state', b.state)
      return reply({ ok: true, banque: s.aspsp.name, valid_until: s.access.valid_until,
        comptes: accounts.map((a) => ({ l4: a.l4, type: a.type, rattache: !!a.account_id })) })
    }
    return reply({ error: 'action inconnue' }, 400)
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
