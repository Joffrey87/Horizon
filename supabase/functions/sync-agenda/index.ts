// ================================================================
// HORIZON — Edge Function « sync-agenda »
// Importe les évènements des agendas externes (iCal) dans `tasks`, comme le
// planning CAPS. Chaque évènement porte `notes = source:gcal:<feed>:<clé>` :
// c'est ce marqueur qui rend la synchro idempotente — on met à jour au lieu de
// dupliquer, et on retire ce qui a disparu de l'agenda.
//
// Ne traite QUE les agendas de l'utilisateur appelant (déduit du JWT) : la
// service-role key ignore RLS, le filtre est donc à notre charge.
//
// Aucun modèle appelé : cette fonction ne coûte rien.
// Secrets requis : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import ICAL from 'npm:ical.js@2.2.0'

const TZ = 'Europe/Paris'
const JOURS_AVANT = 30      // on garde un peu de passé (relecture, heures de contrôle)
const JOURS_APRES = 400     // et l'année à venir
const MAX_OCCURRENCES = 400 // garde-fou par évènement récurrent
const MAX_ITERATIONS = 3000 // garde-fou d'expansion (récurrences très anciennes)

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

/** Date civile (yyyy-mm-dd) d'un instant, lue à Paris. */
const jourDe = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

/** Heure civile « 9h30 » d'un instant, lue à Paris ; « 9h » si pile. */
function heureDe(d: Date): string {
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d)
  const h = Number(p.find((x) => x.type === 'hour')?.value ?? 0)
  const m = Number(p.find((x) => x.type === 'minute')?.value ?? 0)
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

const ajouterJours = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// ---- lecture du flux -------------------------------------------------------

interface Occurrence {
  cle: string           // identifiant stable de l'occurrence
  titre: string
  debut: string         // yyyy-mm-dd
  fin: string | null    // yyyy-mm-dd si l'évènement s'étale, sinon null
  lieu: string | null
  duree: number | null  // minutes, pour la grille horaire de la semaine
}

/** Jour civil d'un ICAL.Time : pour un évènement « journée entière », les
 *  composants portent déjà la bonne date — passer par un instant la décalerait. */
function jourIcal(t: { isDate: boolean; year: number; month: number; day: number; toJSDate: () => Date }): string {
  // Un ICAL.Time « journée entière » n'a pas d'instant : ses composants font foi.
  if (t.isDate) {
    return `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`
  }
  return jourDe(t.toJSDate())
}

function lireFlux(ics: string, debutFenetre: string, finFenetre: string): Occurrence[] {
  const comp = new ICAL.Component(ICAL.parse(ics))
  // Les fuseaux du flux (VTIMEZONE) doivent être connus pour convertir les
  // heures locales de l'agenda en instants corrects.
  for (const vtz of comp.getAllSubcomponents('vtimezone')) {
    try {
      const tz = new ICAL.Timezone(vtz)
      if (!ICAL.TimezoneService.has(tz.tzid)) ICAL.TimezoneService.register(tz.tzid, tz)
    } catch { /* fuseau illisible : on continue */ }
  }

  const out: Occurrence[] = []
  const bornes = { debut: new Date(`${debutFenetre}T00:00:00Z`), fin: new Date(`${finFenetre}T23:59:59Z`) }

  for (const vevent of comp.getAllSubcomponents('vevent')) {
    const ev = (() => { try { return new ICAL.Event(vevent) } catch { return null } })()
    if (!ev) continue
    // Les exceptions (RECURRENCE-ID) sont portées par l'évènement maître,
    // qui les applique lui-même : les traiter à part créerait des doublons.
    if (ev.isRecurrenceException?.()) continue
    if (!ev.startDate) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const retenir = (debut: any, fin: any, suffixe = '') => {
      const jourDebut = jourIcal(debut)
      // En iCal, la fin d'un évènement « journée entière » est EXCLUSIVE.
      const jourFinBrut = fin ? jourIcal(fin) : jourDebut
      const jourFin = fin && fin.isDate ? ajouterJours(jourFinBrut, -1) : jourFinBrut
      const journeeEntiere = debut.isDate
      const titre = journeeEntiere
        ? (ev.summary ?? 'Sans titre')
        : `${heureDe(debut.toJSDate())} ${ev.summary ?? 'Sans titre'}`
      const duree = journeeEntiere || !fin ? null
        : Math.round((fin.toJSDate().getTime() - debut.toJSDate().getTime()) / 60000)
      out.push({
        cle: `${ev.uid ?? 'sans-uid'}${suffixe}`,
        titre: titre.slice(0, 200),
        debut: jourDebut,
        fin: jourFin > jourDebut ? jourFin : null,
        lieu: ev.location ? String(ev.location).slice(0, 200) : null,
        duree: duree && duree > 0 && duree < 24 * 60 ? duree : null,
      })
    }

    if (!ev.isRecurring()) {
      const fin = ev.endDate ?? ev.startDate
      if (fin.toJSDate() < bornes.debut || ev.startDate.toJSDate() > bornes.fin) continue
      retenir(ev.startDate, ev.endDate)
      continue
    }

    // Récurrence : on déroule jusqu'à sortir de la fenêtre.
    try {
      const it = ev.iterator()
      let gardees = 0
      for (let i = 0; i < MAX_ITERATIONS && gardees < MAX_OCCURRENCES; i++) {
        const t = it.next()
        if (!t) break
        if (t.toJSDate() > bornes.fin) break
        const d = ev.getOccurrenceDetails(t)
        if ((d.endDate ?? d.startDate).toJSDate() < bornes.debut) continue
        retenir(d.startDate, d.endDate, `:${jourIcal(d.startDate)}`)
        gardees++
      }
    } catch { /* récurrence illisible : l'évènement est ignoré, pas le flux */ }
  }
  return out
}

// ---- synchronisation -------------------------------------------------------

interface Feed { id: string; label: string; ical_url: string; domain_id: string | null }

async function syncFeed(
  supabase: ReturnType<typeof createClient>, userId: string, feed: Feed,
): Promise<{ label: string; importes: number; retires: number; erreur?: string }> {
  const debut = ajouterJours(new Date().toISOString().slice(0, 10), -JOURS_AVANT)
  const fin = ajouterJours(new Date().toISOString().slice(0, 10), JOURS_APRES)

  let occurrences: Occurrence[]
  try {
    const res = await fetch(feed.ical_url, { headers: { Accept: 'text/calendar' } })
    if (!res.ok) throw new Error(`agenda injoignable (${res.status})`)
    occurrences = lireFlux(await res.text(), debut, fin)
  } catch (e) {
    const erreur = e instanceof Error ? e.message : String(e)
    await supabase.from('calendar_feeds')
      .update({ last_error: erreur, last_sync_at: new Date().toISOString() }).eq('id', feed.id)
    return { label: feed.label, importes: 0, retires: 0, erreur }
  }

  const prefixe = `source:gcal:${feed.id}:`
  const { data: existants } = await supabase.from('tasks')
    .select('id, notes, title, scheduled_date, end_date, location, duration_min')
    .eq('user_id', userId).like('notes', `${prefixe}%`)

  const parNotes = new Map((existants ?? []).map((t) => [t.notes as string, t]))
  const vues = new Set<string>()
  let importes = 0

  for (const o of occurrences) {
    const notes = `${prefixe}${o.cle}`
    vues.add(notes)
    const ligne = {
      title: o.titre, scheduled_date: o.debut, end_date: o.fin,
      location: o.lieu, duration_min: o.duree,
    }
    const dejaLa = parNotes.get(notes)
    if (!dejaLa) {
      await supabase.from('tasks').insert({
        ...ligne, user_id: userId, notes, is_task: false,
        status: 'a_faire', domain_id: feed.domain_id,
      })
      importes++
      continue
    }
    // Mise à jour seulement si quelque chose a bougé, pour ne pas réécrire
    // inutilement (et ne pas faire remonter la tâche comme « activité »).
    const change = dejaLa.title !== ligne.title || dejaLa.scheduled_date !== ligne.scheduled_date
      || dejaLa.end_date !== ligne.end_date || dejaLa.location !== ligne.location
      || dejaLa.duration_min !== ligne.duration_min
    if (change) { await supabase.from('tasks').update(ligne).eq('id', dejaLa.id); importes++ }
  }

  // Disparu de l'agenda → disparaît d'Horizon, mais UNIQUEMENT dans la fenêtre
  // synchronisée : au-delà, on ne sait rien et on ne touche à rien.
  const aRetirer = (existants ?? []).filter((t) => {
    if (vues.has(t.notes as string)) return false
    const d = t.scheduled_date as string | null
    return !!d && d >= debut && d <= fin
  })
  if (aRetirer.length) {
    await supabase.from('tasks').delete().in('id', aRetirer.map((t) => t.id as string))
  }

  await supabase.from('calendar_feeds').update({
    last_sync_at: new Date().toISOString(), last_error: null, last_count: occurrences.length,
  }).eq('id', feed.id)

  return { label: feed.label, importes, retires: aRetirer.length }
}

Deno.serve(async (req) => {
  const cors = corsFor(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) return json({ error: 'Config Supabase manquante' }, 500)
    const uid = await callerId(req, url, key)
    if (!uid) return json({ error: 'Appel non authentifié' }, 401)

    const supabase = createClient(url, key)
    const { data: feeds, error } = await supabase.from('calendar_feeds')
      .select('id, label, ical_url, domain_id').eq('user_id', uid).eq('active', true)
    if (error) return json({ error: error.message }, 500)
    if (!feeds?.length) return json({ ok: true, agendas: [], message: 'Aucun agenda configuré.' })

    const agendas = []
    for (const f of feeds) agendas.push(await syncFeed(supabase, uid, f as unknown as Feed))
    return json({ ok: true, agendas })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
