// ================================================================
// HORIZON — Edge Function « celeste » : l'agent de remplacement
//
// Céleste (celeste-app.fr) : les collègues y postent des demandes de
// remplacement de vacation. Cette fonction, appelée toutes les 2 min par
// pg_cron (migration 023) et par l'app, lit les demandes « remplaçables »
// (au sens du site : `type = substitution` et aucune limite réglementaire —
// repos insuffisant, déjà en poste…), les passe au crible des règles de
// l'utilisateur ET de son agenda Horizon (congé posé, déplacement, déjà en
// vacation), puis selon le mode :
//   - auto_premiere : accepte seule la PREMIÈRE compatible (test grandeur
//                     nature), puis passe en « confirmation » ;
//   - confirmation  : la propose dans l'app et sur le téléphone (ntfy) ;
//   - auto          : accepte toujours seule.
// Une vacation acceptée entre dans « Temps » (`tasks`, source:caps + source:celeste).
//
// Actions (corps JSON `{ action }`) :
//   scan      — cron (clé anon, sans utilisateur) ou bouton de l'app ;
//   accept    — bouton « Accepter » d'une proposition (JWT utilisateur requis) ;
//   unaccept  — retire une acceptation (JWT utilisateur requis).
//
// Mono-utilisateur par construction : les identifiants Céleste sont des
// secrets de la fonction, rattachés à l'utilisateur CELESTE_HORIZON_USER_ID.
// La service-role key ignore RLS : tout est filtré par cet id.
//
// Secrets requis : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   CELESTE_EMAIL, CELESTE_PASSWORD, CELESTE_HORIZON_USER_ID
// Optionnels : APP_URL (lien des notifications), ALLOWED_ORIGINS
// ================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const CELESTE = 'https://celeste-app.fr/api'
const TZ = 'Europe/Paris'
const JOURS_APRES = 180        // fenêtre de lecture des demandes
const DELAI_MAX_S = 60         // pause maximale avant une acceptation automatique
const APP_URL = Deno.env.get('APP_URL') ?? 'https://horizon-sigma-woad.vercel.app'

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS')
  ?? 'https://horizon-sigma-woad.vercel.app,http://localhost:5173')
  .split(',').map((o) => o.trim()).filter(Boolean)

function allowed(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true
  return /^https:\/\/horizon-[a-z0-9-]+\.vercel\.app$/.test(origin)
}

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': allowed(origin) ? origin : (ALLOWED_ORIGINS[0] ?? ''),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  }
}

async function callerId(req: Request, url: string, key: string): Promise<string | null> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return null
  const { data, error } = await createClient(url, key).auth.getUser(jwt)
  if (error || !data.user) return null
  return data.user.id
}

// ---- dates -----------------------------------------------------------------

const aujourdhui = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

const ajouterJours = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Jour ISO (1 = lundi … 7 = dimanche) d'une date « yyyy-mm-dd ». */
const jourIso = (iso: string): number => {
  const j = new Date(`${iso}T12:00:00Z`).getUTCDay()
  return j === 0 ? 7 : j
}

/** Lundi de la semaine ISO d'une date. */
const lundiDe = (iso: string): string => ajouterJours(iso, 1 - jourIso(iso))

const ecartJours = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

/** « vendredi 23 octobre » */
const dateLisible = (iso: string): string =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(`${iso}T12:00:00Z`))

/** « 15:00 » → « 15h », « 18:30 » → « 18h30 » (format des titres CAPS). */
const heureCourte = (hm: string): string => {
  const [h, m] = hm.split(':')
  return m && m !== '00' ? `${Number(h)}h${m}` : `${Number(h)}h`
}

const minutes = (hm: string): number => {
  const [h, m] = hm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

// ---- Céleste : session -----------------------------------------------------

interface SessionCeleste { cookie: string; accessToken: string; celesteUserId: string }

/** Fusionne les Set-Cookie d'une réponse dans le cookie courant (« a=1; b=2 »). */
function fusionnerCookies(courant: string, res: Response): string {
  const jar = new Map<string, string>()
  for (const c of courant.split(';')) {
    const [k, ...v] = c.trim().split('=')
    if (k) jar.set(k, v.join('='))
  }
  const nouveaux: string[] = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie') as string] : [])
  for (const sc of nouveaux) {
    const [k, ...v] = (sc.split(';')[0] ?? '').trim().split('=')
    if (k) jar.set(k, v.join('='))
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
}

interface ReponseAuth { userData?: { userId?: string }; accessToken?: string; message?: string }

async function authCeleste(chemin: string, cookie: string, corps: unknown): Promise<{ res: Response; data: ReponseAuth }> {
  const res = await fetch(`${CELESTE}${chemin}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(corps),
  })
  const data = await res.json().catch(() => ({})) as ReponseAuth
  return { res, data }
}

/** Session valide : rafraîchit avec le cookie conservé, sinon se reconnecte.
 *  Le cookie (et l'id Céleste) sont mémorisés pour la prochaine fois. */
async function ouvrirSession(db: SupabaseClient, uid: string): Promise<SessionCeleste> {
  const { data: row } = await db.from('celeste_session').select('cookie, celeste_user_id').eq('user_id', uid).maybeSingle()
  let cookie = (row?.cookie as string | undefined) ?? ''
  let auth: ReponseAuth | null = null

  if (cookie) {
    const { res, data } = await authCeleste('/auth/refresh', cookie, {})
    if (res.ok && data.accessToken) { cookie = fusionnerCookies(cookie, res); auth = data }
  }
  if (!auth) {
    const email = Deno.env.get('CELESTE_EMAIL'), password = Deno.env.get('CELESTE_PASSWORD')
    if (!email || !password) throw new Error('Secrets CELESTE_EMAIL / CELESTE_PASSWORD manquants')
    const { res, data } = await authCeleste('/auth/login', '', { email, password })
    if (!res.ok || !data.accessToken) throw new Error(`Connexion Céleste refusée : ${data.message ?? res.status}`)
    cookie = fusionnerCookies('', res)
    auth = data
  }
  const celesteUserId = auth.userData?.userId ?? (row?.celeste_user_id as string | undefined) ?? ''
  if (!celesteUserId) throw new Error('Identifiant Céleste introuvable dans la réponse de connexion')
  await db.from('celeste_session').upsert({ user_id: uid, cookie, celeste_user_id: celesteUserId, updated_at: new Date().toISOString() })
  return { cookie, accessToken: auth.accessToken as string, celesteUserId }
}

async function celeste<T>(s: SessionCeleste, chemin: string, method = 'GET', corps?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${CELESTE}${chemin}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.accessToken}` },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  const data = await res.json().catch(() => ({})) as T
  return { status: res.status, data }
}

// ---- Céleste : demandes ----------------------------------------------------

interface Demande {
  _id: string
  posterId: string | { _id: string; name?: string; lastName?: string }
  accepterId: string | null
  type: 'substitution' | 'switch' | 'hybrid'
  status: 'open' | 'accepted' | string
  comment?: string
  points?: number
  reservedForUserId?: string | null
  canSwitch?: boolean
  limit?: string[]
  posterShift: {
    date: string
    shift: { name: string; default: { startTime: string; endTime: string; points?: number; endsNextDay?: boolean } }
    teamId: string | { _id: string; name: string }
  }
}

const idDe = (x: string | { _id: string } | null | undefined): string | null =>
  x == null ? null : (typeof x === 'string' ? x : x._id)

const nomEquipe = (t: Demande['posterShift']['teamId']): string | null =>
  typeof t === 'object' && t ? t.name : null

/** « Remplaçable » exactement comme le site le calcule (store substitution). */
function remplacable(d: Demande, moi: string): boolean {
  if (d.status !== 'open' || idDe(d.posterId) === moi) return false
  if ((d.limit?.length ?? 0) > 0) return false
  return d.type === 'substitution' || (d.type === 'hybrid' && !d.canSwitch)
}

// ---- règles ----------------------------------------------------------------

interface Regles {
  user_id: string
  enabled: boolean
  mode: 'auto_premiere' | 'confirmation' | 'auto'
  delay_seconds: number
  no_weekdays: number[]
  /** Jour refuse mais ouvert a certaines vacations : { "4": ["N"] } = jeudi, sauf en nuit. */
  weekday_exceptions: Record<string, string[]>
  no_shifts: string[]
  no_teams: string[]
  refuse_reserved: boolean
  no_keywords: string[]
  min_notice_days: number
  max_per_week: number | null
  ntfy_topic: string | null
}

interface TacheAgenda { title: string; scheduled_date: string | null; end_date: string | null; is_task: boolean; location: string | null; notes: string | null }

const JOURS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

/** Raison du refus, ou null si la demande passe toutes les règles. */
function verifier(d: Demande, r: Regles, moi: string, taches: TacheAgenda[], accepteesSemaine: number): string | null {
  const date = d.posterShift.date.slice(0, 10)
  const code = d.posterShift.shift.name
  const equipe = nomEquipe(d.posterShift.teamId)
  const commentaire = d.comment ?? ''

  const iso = jourIso(date)
  const sauf = r.weekday_exceptions?.[String(iso)] ?? []
  if (r.no_weekdays.includes(iso) && !sauf.includes(code)) {
    return sauf.length ? `jamais le ${JOURS[iso]} (sauf ${sauf.join(', ')})` : `jamais le ${JOURS[iso]}`
  }
  if (r.no_shifts.includes(code)) return `vacation ${code} refusée`
  if (equipe && r.no_teams.includes(equipe)) return `équipe ${equipe} refusée`
  if (r.refuse_reserved) {
    if (d.reservedForUserId && d.reservedForUserId !== moi) return 'demande réservée à quelqu’un d’autre'
    // « Pour Marie », « pour M. Dupont » : la demande est fléchée.
    if (/\bpour\s+(?:m\.|mme|mr)?\s*[A-ZÀ-ÝÇ][\wà-ÿ'-]+/u.test(commentaire)) return 'demande fléchée vers quelqu’un (« Pour … »)'
  }
  const mot = r.no_keywords.find((k) => k && commentaire.toLowerCase().includes(k.toLowerCase()))
  if (mot) return `commentaire contient « ${mot} »`
  const delai = ecartJours(aujourdhui(), date)
  if (delai < r.min_notice_days) return `moins de ${r.min_notice_days} j de délai`

  // Agenda Horizon : congé posé, déplacement, déjà en vacation.
  for (const t of taches) {
    if (!t.scheduled_date) continue
    const caps = t.notes?.includes('source:caps') ?? false
    if (caps && t.scheduled_date === date) {
      return / - Vf?$/.test(t.title) ? 'en congé ce jour-là (Horizon)' : `déjà en vacation ce jour-là (${t.title})`
    }
    if (!t.is_task && t.location && t.scheduled_date <= date && date <= (t.end_date ?? t.scheduled_date)) {
      return `en déplacement (${t.location})`
    }
  }
  if (r.max_per_week != null && accepteesSemaine >= r.max_per_week) return `déjà ${accepteesSemaine} rempla(s) cette semaine`
  return null
}

// ---- notifications (ntfy) --------------------------------------------------

/** Push ntfy. Le clic ouvre Temps sur la semaine de la vacation concernee. */
async function notifier(topic: string | null, titre: string, message: string, tags: string[], date?: string): Promise<void> {
  if (!topic) return
  try {
    await fetch('https://ntfy.sh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic, title: titre, message, tags, priority: 4,
        click: date ? `${APP_URL}/temps?date=${date}` : `${APP_URL}/remplas`,
      }),
    })
  } catch (e) {
    console.error('ntfy :', e)
  }
}

// ---- propositions ----------------------------------------------------------

interface Proposition {
  id: string
  user_id: string
  celeste_id: string
  date: string
  shift_code: string
  start_time: string
  end_time: string
  ends_next_day: boolean
  team: string | null
  points: number | null
  comment: string | null
  poster: string | null
  status: string
  reason: string | null
  auto: boolean
  task_id: string | null
}

const resume = (p: Pick<Proposition, 'date' | 'shift_code' | 'start_time' | 'end_time' | 'team' | 'points'>): string =>
  `${dateLisible(p.date)} · ${p.shift_code} ${heureCourte(p.start_time)}–${heureCourte(p.end_time)}`
  + (p.team ? ` · équipe ${p.team}` : '') + (p.points != null ? ` · ${p.points} pts` : '')

function versProposition(d: Demande, uid: string): Omit<Proposition, 'id' | 'status' | 'reason' | 'auto' | 'task_id'> {
  const sh = d.posterShift.shift
  const poster = typeof d.posterId === 'object' && d.posterId
    ? `${d.posterId.name ?? ''} ${(d.posterId.lastName ?? '').split(' ').map((x) => x ? `${x[0]}.` : '').join('')}`.trim()
    : null
  return {
    user_id: uid, celeste_id: d._id, date: d.posterShift.date.slice(0, 10),
    shift_code: sh.name, start_time: sh.default.startTime, end_time: sh.default.endTime,
    ends_next_day: !!sh.default.endsNextDay, team: nomEquipe(d.posterShift.teamId),
    points: d.points ?? sh.default.points ?? null, comment: d.comment || null, poster,
  }
}

/** Crée l'évènement dans « Temps » : même forme que le planning CAPS (« 15h-23h S1 »). */
async function creerTache(db: SupabaseClient, p: Proposition): Promise<string | null> {
  const { data: ref } = await db.from('tasks').select('domain_id').eq('user_id', p.user_id)
    .like('notes', 'source:caps%').not('domain_id', 'is', null).order('scheduled_date', { ascending: false }).limit(1).maybeSingle()
  let duree = minutes(p.end_time) - minutes(p.start_time)
  if (duree <= 0) duree += 24 * 60
  const { data, error } = await db.from('tasks').insert({
    user_id: p.user_id, title: `${heureCourte(p.start_time)}-${heureCourte(p.end_time)} ${p.shift_code} - Rempla`,
    scheduled_date: p.date, duration_min: duree, is_task: false, status: 'a_faire',
    notes: `source:caps source:celeste:${p.celeste_id}`, domain_id: (ref?.domain_id as string | null) ?? null,
  }).select('id').single()
  if (error) { console.error('tasks :', error.message); return null }
  return data.id as string
}

interface ReponseAccept { request?: Demande; needsApproval?: boolean; message?: string; error?: string }

/** Accepte sur Céleste et met la proposition (et « Temps ») à jour. */
async function accepter(db: SupabaseClient, s: SessionCeleste, p: Proposition, auto: boolean): Promise<Proposition> {
  const { status, data } = await celeste<ReponseAccept>(s, `/substitution/${p.celeste_id}/accept`, 'POST')
  const maintenant = new Date().toISOString()
  if (status === 200 || status === 201 || data.needsApproval) {
    const task_id = await creerTache(db, p)
    const reason = data.needsApproval ? 'acceptée — en attente de validation côté Céleste' : null
    const { data: maj } = await db.from('celeste_proposals')
      .update({ status: 'acceptee', reason, auto, task_id, decided_at: maintenant }).eq('id', p.id).select('*').single()
    return maj as Proposition
  }
  const reason = data.message ?? data.error ?? `Céleste a répondu ${status}`
  const { data: maj } = await db.from('celeste_proposals')
    .update({ status: 'erreur', reason, auto, decided_at: maintenant }).eq('id', p.id).select('*').single()
  return maj as Proposition
}

async function retirer(db: SupabaseClient, s: SessionCeleste, p: Proposition): Promise<Proposition> {
  const { status, data } = await celeste<ReponseAccept>(s, `/substitution/${p.celeste_id}/unaccept`, 'POST')
  if (status !== 200) throw new Error(data.message ?? data.error ?? `Céleste a répondu ${status}`)
  if (p.task_id) await db.from('tasks').delete().eq('id', p.task_id).eq('user_id', p.user_id)
  const { data: maj } = await db.from('celeste_proposals')
    .update({ status: 'annulee', task_id: null, decided_at: new Date().toISOString() }).eq('id', p.id).select('*').single()
  return maj as Proposition
}

// ---- scan ------------------------------------------------------------------

const REGLES_DEFAUT = {
  enabled: true, mode: 'auto_premiere', delay_seconds: 10, no_weekdays: [4, 7], weekday_exceptions: { '4': ['N'] },
  no_shifts: [], no_teams: ['10'],
  refuse_reserved: true, no_keywords: [], min_notice_days: 0, max_per_week: null, ntfy_topic: null,
}

async function scan(db: SupabaseClient, uid: string): Promise<Record<string, unknown>> {
  let { data: regles } = await db.from('celeste_rules').select('*').eq('user_id', uid).maybeSingle()
  if (!regles) {
    const { data } = await db.from('celeste_rules').insert({ user_id: uid, ...REGLES_DEFAUT }).select('*').single()
    regles = data
  }
  const r = regles as Regles
  if (!r.enabled) return { ok: true, skipped: 'désactivé' }

  const compteRendu = { nouvelles: 0, proposees: 0, acceptees: 0, refusees: 0, expirees: 0 }
  try {
    const s = await ouvrirSession(db, uid)
    const debut = aujourdhui()
    const { status, data: demandes } = await celeste<Demande[]>(s, '/substitution/center', 'POST',
      { startDate: debut, endDate: ajouterJours(debut, JOURS_APRES) })
    if (status !== 200 || !Array.isArray(demandes)) throw new Error(`Lecture des demandes : Céleste a répondu ${status}`)

    const candidates = demandes.filter((d) => remplacable(d, s.celesteUserId))
    const { data: connues } = await db.from('celeste_proposals').select('*').eq('user_id', uid)
    const props = (connues ?? []) as Proposition[]
    const parId = new Map(props.map((p) => [p.celeste_id, p]))

    // Proposition en attente qui n'est plus remplaçable : prise par un autre, retirée…
    const encore = new Set(candidates.map((d) => d._id))
    for (const p of props) {
      if (p.status === 'proposee' && !encore.has(p.celeste_id)) {
        await db.from('celeste_proposals').update({ status: 'expiree', reason: 'plus disponible sur Céleste', decided_at: new Date().toISOString() }).eq('id', p.id)
        compteRendu.expirees++
      }
    }

    const nouvelles = candidates.filter((d) => !parId.has(d._id))
      .sort((a, b) => a.posterShift.date.localeCompare(b.posterShift.date))
    compteRendu.nouvelles = nouvelles.length
    if (nouvelles.length === 0) {
      await db.from('celeste_rules').update({ last_scan_at: new Date().toISOString(), last_error: null }).eq('user_id', uid)
      return { ok: true, ...compteRendu }
    }

    const { data: taches } = await db.from('tasks')
      .select('title, scheduled_date, end_date, is_task, location, notes').eq('user_id', uid).gte('scheduled_date', debut)
    const agenda = (taches ?? []) as TacheAgenda[]
    const acceptees = props.filter((p) => p.status === 'acceptee')
    const parSemaine = (date: string) => acceptees.filter((p) => lundiDe(p.date) === lundiDe(date)).length

    let mode = r.mode
    for (const d of nouvelles) {
      const base = versProposition(d, uid)
      const raison = verifier(d, r, s.celesteUserId, agenda, parSemaine(base.date))
      if (raison) {
        await db.from('celeste_proposals').insert({ ...base, status: 'refusee', reason: raison, decided_at: new Date().toISOString() })
        compteRendu.refusees++
        continue
      }
      const { data: inseree, error } = await db.from('celeste_proposals').insert({ ...base, status: 'proposee' }).select('*').single()
      if (error || !inseree) { console.error('proposal :', error?.message); continue }
      const p = inseree as Proposition

      if (mode === 'confirmation') {
        compteRendu.proposees++
        await notifier(r.ntfy_topic, 'Rempla disponible — à valider', resume(p) + (p.comment ? `\n« ${p.comment} »` : ''), ['calendar'], p.date)
        continue
      }

      // Acceptation automatique : petite pause (le site marque la demande comme
      // consultée, comme le ferait un humain), puis accept.
      await celeste(s, `/substitution/${p.celeste_id}/consult`, 'POST').catch(() => undefined)
      await new Promise((ok) => setTimeout(ok, Math.min(Math.max(r.delay_seconds, 0), DELAI_MAX_S) * 1000))
      const maj = await accepter(db, s, p, true)
      if (maj.status === 'acceptee') {
        compteRendu.acceptees++
        acceptees.push(maj)
        await notifier(r.ntfy_topic, 'Rempla accepté ✔', `${resume(maj)}\nAnnulable depuis Horizon.`, ['white_check_mark'], maj.date)
        if (mode === 'auto_premiere') {
          // Le test est fait : désormais on demande avant.
          mode = 'confirmation'
          await db.from('celeste_rules').update({ mode }).eq('user_id', uid)
        }
      } else {
        await notifier(r.ntfy_topic, 'Rempla non accepté', `${resume(maj)}\n${maj.reason ?? ''}`, ['warning'], maj.date)
      }
    }

    await db.from('celeste_rules').update({ last_scan_at: new Date().toISOString(), last_error: null }).eq('user_id', uid)
    return { ok: true, ...compteRendu, mode }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await db.from('celeste_rules').update({ last_scan_at: new Date().toISOString(), last_error: message }).eq('user_id', uid)
    return { ok: false, error: message, ...compteRendu }
  }
}

// ---- serveur ---------------------------------------------------------------

Deno.serve(async (req) => {
  const cors = corsFor(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const proprietaire = Deno.env.get('CELESTE_HORIZON_USER_ID')
    if (!url || !key) return json({ error: 'Config Supabase manquante' }, 500)
    if (!proprietaire) return json({ error: 'Secret CELESTE_HORIZON_USER_ID manquant' }, 500)

    let body: { action?: string; proposal_id?: string } = {}
    try { body = await req.json() } catch { /* corps vide */ }
    const action = body.action ?? 'scan'
    const uid = await callerId(req, url, key)   // null = cron (clé anon)
    const db = createClient(url, key)

    if (action === 'scan') {
      if (uid && uid !== proprietaire) return json({ error: 'L’agent Céleste n’est pas configuré pour ce compte' }, 403)
      return json(await scan(db, proprietaire))
    }

    if (uid !== proprietaire) return json({ error: 'Appel non authentifié' }, 401)
    if (!body.proposal_id) return json({ error: 'proposal_id manquant' }, 400)
    const { data: p } = await db.from('celeste_proposals').select('*').eq('id', body.proposal_id).eq('user_id', uid).maybeSingle()
    if (!p) return json({ error: 'Proposition introuvable' }, 404)
    const prop = p as Proposition

    // Proposition de demonstration (inseree a la main, pas issue de Celeste) : rien a accepter.
    if (prop.celeste_id.startsWith('test-')) return json({ error: 'Proposition de test : ignore-la, elle ne vient pas de Celeste' }, 409)
    if (action === 'accept') {
      if (prop.status !== 'proposee') return json({ error: `Proposition déjà ${prop.status}` }, 409)
      const s = await ouvrirSession(db, uid)
      const maj = await accepter(db, s, prop, false)
      return json({ ok: maj.status === 'acceptee', proposal: maj, error: maj.status === 'acceptee' ? undefined : maj.reason })
    }
    if (action === 'unaccept') {
      if (prop.status !== 'acceptee') return json({ error: `Proposition ${prop.status}, rien à retirer` }, 409)
      const s = await ouvrirSession(db, uid)
      const maj = await retirer(db, s, prop)
      return json({ ok: true, proposal: maj })
    }
    return json({ error: `Action inconnue : ${action}` }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
