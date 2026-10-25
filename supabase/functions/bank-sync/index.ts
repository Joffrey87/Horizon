// ================================================================
// HORIZON — Edge Function « bank-sync »
// Synchro automatique Enable Banking -> Finances (soldes + opérations, y compris en attente),
// sans le bot. Appelée par pg_cron à 6,7,12,13,18,19 h UTC : seule l'exécution qui tombe à
// 8 h, 14 h ou 20 h heure de Paris synchronise (heure d'été / d'hiver gérée ici).
//
// Appels acceptés :
//   * cron   : en-tête x-cron-secret = secret BANK_SYNC_CRON_SECRET ; respecte le créneau.
//   * l'app  : JWT de l'utilisateur ; { force: true } synchronise tout de suite, { dry_run: true } n'écrit rien.
// Règles de catégorisation / dédoublonnage : _shared/bankSync.ts (port de import_bourso.py).
// Secrets : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EB_APP_ID, EB_PRIVATE_KEY, BANK_SYNC_CRON_SECRET
// Déploiement : verify_jwt = false (le cron n'a pas de JWT ; l'authentification est faite ici).
// ================================================================
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { analyse, isSyncSlot, payload, type AccountInput, type Snapshot } from '../_shared/bankSync.ts'
import * as eb from '../_shared/enableBanking.ts'

type Conn = { id: string; user_id: string; source: string; aspsp_name: string; valid_until: string; last_sync_at: string | null
  accounts: { uid: string; l4: string; name?: string; type?: string; account_id: string | null }[] }

const ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://horizon-sigma-woad.vercel.app,http://localhost:5173').split(',').map((s) => s.trim())
const cors = (req: Request) => {
  const o = req.headers.get('Origin') ?? ''
  return { 'Access-Control-Allow-Origin': ORIGINS.includes(o) || /^https:\/\/horizon-[a-z0-9-]+\.vercel\.app$/.test(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret', Vary: 'Origin' }
}
const jourParis = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(d)
const timingSafeEq = (a: string, b: string) => a.length === b.length && [...a].reduce((x, c, i) => x | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0

Deno.serve(async (req) => {
  const h = { ...cors(req), 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h })
  const url = Deno.env.get('SUPABASE_URL')!, svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(url, svc, { auth: { persistSession: false } })
  const body = await req.json().catch(() => ({})) as { force?: boolean; dry_run?: boolean }
  const now = new Date()

  // --- qui appelle ?
  let userFilter: string | null = null
  await eb.loadSecrets(db)
  const cronSecret = eb.secret('BANK_SYNC_CRON_SECRET')
  const given = req.headers.get('x-cron-secret') ?? ''
  const fromCron = !!cronSecret && !!given && timingSafeEq(given, cronSecret)
  if (!fromCron) {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data } = jwt ? await db.auth.getUser(jwt) : { data: { user: null } }
    if (!data.user) return new Response(JSON.stringify({ error: 'non autorisé' }), { status: 401, headers: h })
    userFilter = data.user.id
  }
  if (fromCron && !body.force && !isSyncSlot(now)) return new Response(JSON.stringify({ skipped: 'hors créneau 8h/14h/20h Paris' }), { headers: h })

  let q = db.from('fin_bank_connections').select('id,user_id,source,aspsp_name,valid_until,last_sync_at,accounts').eq('status', 'active')
  if (userFilter) q = q.eq('user_id', userFilter)
  const { data: conns, error } = await q
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: h })

  const results = []
  for (const c of (conns ?? []) as Conn[]) {
    const started = new Date()
    try {
      if (Date.parse(c.valid_until) <= now.getTime()) throw new Error('consentement expiré : à renouveler')
      // Fenêtre : depuis la dernière synchro − 10 j (rattrape les comptabilisations tardives), au plus 35 j.
      const from = new Date(Math.max(now.getTime() - 35 * 86400000, c.last_sync_at ? Date.parse(c.last_sync_at) - 10 * 86400000 : 0))
      const mapped = c.accounts.filter((a) => a.account_id && (a.type ?? 'CACC') === 'CACC') // CARD = miroirs
      const unmapped = c.accounts.filter((a) => !a.account_id && (a.type ?? 'CACC') === 'CACC').map((a) => a.l4)
      const inputs: AccountInput[] = []
      for (const a of mapped) {
        const [txs, bals] = await Promise.all([eb.transactions(a.uid, jourParis(from)), eb.balances(a.uid)])
        inputs.push({ accountId: a.account_id!, l4: a.l4, txs, balances: bals })
      }
      const ids = inputs.map((i) => i.accountId)
      const { data: snap, error: e1 } = await db.rpc('fin_sync_snapshot', { p_user: c.user_id, p_accounts: ids })
      if (e1) throw new Error(e1.message)
      const r = await analyse(c.source, inputs, snap as Snapshot, jourParis(now))
      const p = payload(c.source, r, ids)
      let applied: unknown = null
      if (!body.dry_run) {
        const { data, error: e2 } = await db.rpc('fin_sync_apply', { p_user: c.user_id, p_payload: p })
        if (e2) throw new Error(e2.message)
        applied = data
      }
      const res = { connection: c.id, banque: c.aspsp_name, comptes: r.reports, non_mappes: unmapped, applique: applied, dry_run: !!body.dry_run }
      results.push(res)
      if (!body.dry_run) await db.from('fin_bank_connections').update({ last_sync_at: now.toISOString(), last_result: res, last_error: null }).eq('id', c.id)
      await db.from('fin_sync_runs').insert({ connection_id: c.id, user_id: c.user_id, started_at: started.toISOString(), ok: true, dry_run: !!body.dry_run, result: res })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      results.push({ connection: c.id, banque: c.aspsp_name, erreur: msg })
      await db.from('fin_bank_connections').update({ last_error: msg, last_error_at: now.toISOString() }).eq('id', c.id)
      await db.from('fin_sync_runs').insert({ connection_id: c.id, user_id: c.user_id, started_at: started.toISOString(), ok: false, dry_run: !!body.dry_run, result: { erreur: msg } })
    }
  }
  return new Response(JSON.stringify({ at: now.toISOString(), results }), { headers: h })
})
