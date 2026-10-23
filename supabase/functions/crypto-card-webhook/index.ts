// ================================================================
// HORIZON — Edge Function « crypto-card-webhook »  (verify_jwt = false)
// Reçoit les notifications de paiement de la carte Visa Crypto.com (MacroDroid,
// Android) et enregistre chaque dépense dans fin_transactions (compte
// « Crypto.com Carte », source 'crypto', external_id 'notif-<sha256>').
//
// Appel : POST  Authorization: Bearer <mot de passe>   (ou champ `token` du body)
//   body JSON : { "title": "...", "text": "...", "timestamp"?: epoch ms (MacroDroid {not_timestamp}),
//                 "date"?: "ISO | yyyy-MM-dd | dd/MM/yyyy" }  — JSON mal formé (guillemets non échappés) toléré.
// Réponses : 200 {ok, inserted|duplicate|ignored, ...} · 400 · 401 · 405 · 413 · 500
//
// Sécurité : seule l'empreinte SHA-256 du mot de passe est stockée (fin_webhook_tokens,
// RLS sans politique ; lue ici via la clé service role). Comparaison en temps constant.
// Le mot de passe n'est jamais journalisé.
//
// Règles :
//  - « <montant> EUR spent at <commerçant> » -> dépense (montant négatif). Date = body.date
//    (si fournie et plausible) sinon heure de réception, jour calendaire Europe/Paris.
//  - Autre devise que EUR : IGNORÉ (journalisé, reason 'devise-non-eur') — on ne devine pas
//    un taux ; le rapprochement avec l'export CSV de l'appli corrigera.
//  - « refund » / remboursement : IGNORÉ (journalisé) : le format n'est pas connu avec certitude.
//  - Autre notification : IGNORÉE (journalisée).
//  - Rejeu : external_id déterministe (titre + texte + minute) + garde SQL anti-rejeu à 2 min.
//  - Rapprochement futur avec le CSV : les lignes 'notif-' sont reconnaissables
//    (source 'crypto', external_id préfixé 'notif-').
// Secrets : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (fournis par la plateforme)
// ================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const TZ = 'Europe/Paris'
const MAX_BODY = 10_000

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } })

const enc = new TextEncoder()
async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
// Comparaison en temps constant de deux empreintes hexadécimales de même longueur.
function ctEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

const parisFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const parisDay = (d: Date) => parisFmt.format(d) // yyyy-MM-dd

/** Date de réception : body.date | body.received_at | body.time | maintenant. -> {day, minute (ISO, minute tronquée)} */
function receivedAt(body: Record<string, unknown>): { day: string; minute: string; fromBody: boolean } {
  const raw = [body.date, body.received_at, body.time, body.timestamp].map((v) => (typeof v === 'number' ? String(v) : v))
    .find((v) => typeof v === 'string' && v.trim()) as string | undefined
  const now = new Date()
  let d: Date | null = null
  if (raw) {
    const s = raw.trim()
    let m: RegExpMatchArray | null
    if (/^\d{10,13}$/.test(s)) {
      // {not_timestamp} de MacroDroid : epoch en millisecondes (10 chiffres = secondes)
      d = new Date(s.length <= 10 ? Number(s) * 1000 : Number(s))
    } else if ((m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?/))) {
      d = new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4] ?? '12'}:${m[5] ?? '00'}:00Z`) // jour calendaire ; l'heure n'a plus d'importance
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      d = new Date(`${s}T12:00:00Z`)
    } else {
      const t = new Date(s)
      if (!isNaN(t.getTime())) d = t
    }
  }
  // plausible : de -60 jours à +1 jour ; sinon heure de réception
  if (d && (d.getTime() > now.getTime() + 86_400_000 || d.getTime() < now.getTime() - 60 * 86_400_000)) d = null
  const use = d ?? now
  const dateOnly = raw && /^\d{4}-\d{2}-\d{2}$|^\d{2}\/\d{2}\/\d{4}/.test(raw.trim()) && d
  const day = dateOnly ? d!.toISOString().slice(0, 10) : parisDay(use)
  const minute = new Date(Math.floor(use.getTime() / 60_000) * 60_000).toISOString()
  return { day, minute, fromBody: !!d }
}

/** "1,234.56" · "1.234,56" · "4,38" · "4.38" · "1 234,50" -> nombre. */
function parseAmount(raw: string): number | null {
  let s = raw.replace(/\s/g, '')
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.')
  if (lc >= 0 && ld >= 0) {
    const dec = lc > ld ? ',' : '.'
    s = dec === ',' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lc >= 0 || ld >= 0) {
    const sep = lc >= 0 ? ',' : '.'
    const parts = s.split(sep)
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) s = parts.join('') // milliers
    else s = parts.join('.')
  }
  const n = Number(s)
  return isFinite(n) && n > 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : null
}

const SPENT_RE = /([€$£])?\s*(\d[\d.,\s]*?)\s*([A-Za-z]{3})?\s+spent\s+at\s+(.+)/i
const CUR_SYMBOL: Record<string, string> = { '€': 'EUR', '$': 'USD', '£': 'GBP' }

function cleanMerchant(raw: string): string {
  return raw
    .replace(/\s+(?:with|using|on)\s+your\s+.*$/i, '')
    .replace(/[…]+$|\.{2,}$/g, '')
    .replace(/[\s.!,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function ignore(db: ReturnType<typeof createClient>, userId: string, reason: string, title: string, text: string) {
  try {
    await db.from('fin_webhook_log').insert({ user_id: userId, reason, title: title.slice(0, 300), body: text.slice(0, 600) })
    await db.from('fin_webhook_log').delete().eq('user_id', userId).lt('received_at', new Date(Date.now() - 90 * 86_400_000).toISOString())
  } catch (_) { /* la journalisation ne doit jamais faire échouer la requête */ }
  return json(200, { ok: true, ignored: true, reason })
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'POST requis' })
  const raw = await req.text()
  if (raw.length > MAX_BODY) return json(413, { ok: false, error: 'corps trop gros' })

  let body: Record<string, unknown>
  try {
    const p = JSON.parse(raw)
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('objet attendu')
    body = p as Record<string, unknown>
  } catch (_) {
    // MacroDroid n'échappe pas les guillemets / retours à la ligne des notifications : extraction tolérante.
    const lt = /"title"\s*:\s*"([\s\S]*?)"\s*,\s*"text"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"timestamp"\s*:\s*"?([\d]*)"?\s*)?\}\s*$/.exec(raw)
    if (!lt) return json(400, { ok: false, error: 'JSON invalide' })
    body = { title: lt[1], text: lt[2], ...(lt[3] ? { timestamp: lt[3] } : {}) }
  }

  // --- authentification : Bearer ou body.token, empreinte comparée en temps constant ---
  const auth = req.headers.get('authorization') ?? ''
  const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim()
  const token = bearer || (typeof body.token === 'string' ? body.token : '')
  delete body.token
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const given = await sha256Hex(token)
  const { data: rows, error: tokErr } = await db.from('fin_webhook_tokens').select('user_id, token_hash')
  if (tokErr) return json(500, { ok: false, error: 'erreur interne' })
  let userId: string | null = null
  for (const r of rows ?? []) if (ctEqual(String(r.token_hash), given) && token) userId = r.user_id as string // pas de break : durée constante
  if (!userId) return json(401, { ok: false, error: 'non autorisé' })

  // --- analyse de la notification ---
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!title && !text) return json(400, { ok: false, error: 'title ou text requis' })

  const m = SPENT_RE.exec(title) ?? SPENT_RE.exec(text)
  if (!m) {
    const reason = /refund|rembours/i.test(`${title} ${text}`) ? 'remboursement-ignore' : 'notification-non-paiement'
    return await ignore(db, userId, reason, title, text)
  }
  const cur = (m[3] ?? CUR_SYMBOL[m[1] ?? ''] ?? '').toUpperCase()
  if (/refund|rembours/i.test(title)) return await ignore(db, userId, 'remboursement-ignore', title, text)
  if (cur !== 'EUR') return await ignore(db, userId, cur ? 'devise-non-eur' : 'devise-inconnue', title, text)
  const amount = parseAmount(m[2])
  const merchant = cleanMerchant(m[4])
  if (amount == null || !merchant) return await ignore(db, userId, 'format-non-reconnu', title, text)

  // récompenses dans le texte (« You earned €0.11 EUR of rewards ») -> note
  const rw = /earned\s+[€$£]?\s*([\d.,]+)\s*([A-Za-z]{3})?\s+of\s+rewards/i.exec(`${text} ${title}`)
  const note = rw ? `Récompenses Crypto.com : ${rw[1]} ${(rw[2] ?? 'EUR').toUpperCase()}` : ''

  const when = receivedAt(body)
  const externalId = 'notif-' + (await sha256Hex(`${title}\n${text}\n${when.minute}`)).slice(0, 40)

  const { data, error } = await db.rpc('fin_card_notif_record', {
    p_user: userId,
    p_payload: { external_id: externalId, date: when.day, amount, label: merchant, note },
  })
  if (error) {
    console.error('fin_card_notif_record', error.message)
    return json(500, { ok: false, error: 'enregistrement impossible' })
  }
  return json(200, { ok: true, ...data, amount: -amount, label: merchant, date: when.day })
})
