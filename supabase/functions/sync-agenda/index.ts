// ================================================================
// HORIZON — Edge Function « sync-agenda »
// RIEN n'est importé automatiquement : la synchro PROPOSE les évènements à
// venir, et l'utilisateur choisit lesquels rejoignent « Temps ». Aucun
// historique n'est lu — la fenêtre part du jour même.
//
// Les évènements déjà acceptés portent `notes = source:gcal:<feed>:<clé>` :
// ce marqueur les tient à jour d'une synchro à l'autre (et les retire s'ils
// disparaissent de l'agenda), et évite de les reproposer.
// `calendar_feeds.ignored` retient les séries écartées (UID iCal).
//
// Ne traite QUE les agendas de l'utilisateur appelant (déduit du JWT) : la
// service-role key ignore RLS, le filtre est donc à notre charge.
//
// ⚠️ CONTRAINTE DE CALCUL. Une fonction Edge a un temps CPU très limité, et un
// agenda personnel contient des récurrences vieilles de plusieurs années : les
// dérouler depuis leur origine dépassait le quota (« CPU Time exceeded »).
// D'où les garde-fous : on n'analyse en détail que les occurrences DANS la
// fenêtre, les séries écartées ne sont pas déroulées du tout, et un budget de
// temps interrompt proprement en signalant une synchro partielle.
//
// Aucun modèle appelé : cette fonction ne coûte rien.
// Secrets requis : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import ICAL from 'npm:ical.js@2.2.0'

const TZ = 'Europe/Paris'
const JOURS_APRES = 180      // six mois à venir ; aucun historique n'est lu
const MAX_PROPOSITIONS = 150 // au-delà, la liste de choix devient inutilisable
const MAX_OCCURRENCES = 60   // par série récurrente
const MAX_ITERATIONS = 1200  // expansion d'une récurrence ancienne
const BUDGET_MS = 1500       // au-delà, on s'arrête et on le dit

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
  uid: string           // la SÉRIE : écarter, c'est écarter tout l'uid
  cle: string           // l'occurrence précise (uid + jour pour un récurrent)
  titre: string
  debut: string
  fin: string | null
  lieu: string | null
  duree: number | null
  recurrent: boolean
}

interface Resultat { occurrences: Occurrence[]; tronque: boolean; msExpansion: number }

/** Jour civil d'un ICAL.Time : pour une « journée entière », les composants
 *  portent déjà la bonne date — passer par un instant la décalerait. */
// deno-lint-ignore no-explicit-any
function jourIcal(t: any): string {
  if (t.isDate) {
    return `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`
  }
  return jourDe(t.toJSDate())
}

function lireFlux(ics: string, debutFenetre: string, finFenetre: string, ignores: string[], jusqua: number): Resultat {
  const comp = new ICAL.Component(ICAL.parse(ics))
  for (const vtz of comp.getAllSubcomponents('vtimezone')) {
    try {
      const tz = new ICAL.Timezone(vtz)
      if (!ICAL.TimezoneService.has(tz.tzid)) ICAL.TimezoneService.register(tz.tzid, tz)
    } catch { /* fuseau illisible : on continue */ }
  }

  const ecartes = new Set(ignores)
  const out: Occurrence[] = []
  const bornes = { debut: +new Date(`${debutFenetre}T00:00:00Z`), fin: +new Date(`${finFenetre}T23:59:59Z`) }
  const t0 = Date.now()
  let tronque = false

  for (const vevent of comp.getAllSubcomponents('vevent')) {
    if (Date.now() > jusqua) { tronque = true; break }
    const ev = (() => { try { return new ICAL.Event(vevent) } catch { return null } })()
    if (!ev) continue
    // Les exceptions (RECURRENCE-ID) sont portées par l'évènement maître.
    if (ev.isRecurrenceException?.()) continue
    if (!ev.startDate) continue

    const uid = ev.uid ?? 'sans-uid'
    // Série écartée : on ne la déroule même pas. C'est le principal gain de
    // calcul sur un agenda chargé.
    if (ecartes.has(uid)) continue

    const resume = ev.summary ?? 'Sans titre'
    const recurrent = ev.isRecurring()

    // deno-lint-ignore no-explicit-any
    const retenir = (debut: any, fin: any, suffixe = '') => {
      const jourDebut = jourIcal(debut)
      // En iCal, la fin d'un évènement « journée entière » est EXCLUSIVE.
      const jourFinBrut = fin ? jourIcal(fin) : jourDebut
      const jourFin = fin && fin.isDate ? ajouterJours(jourFinBrut, -1) : jourFinBrut
      const journeeEntiere = debut.isDate
      const duree = journeeEntiere || !fin ? null
        : Math.round((fin.toJSDate().getTime() - debut.toJSDate().getTime()) / 60000)
      out.push({
        uid,
        cle: `${uid}${suffixe}`,
        titre: (journeeEntiere ? resume : `${heureDe(debut.toJSDate())} ${resume}`).slice(0, 200),
        debut: jourDebut,
        fin: jourFin > jourDebut ? jourFin : null,
        lieu: ev.location ? String(ev.location).slice(0, 200) : null,
        duree: duree && duree > 0 && duree < 24 * 60 ? duree : null,
        recurrent,
      })
    }

    if (!recurrent) {
      const fin = ev.endDate ?? ev.startDate
      if (+fin.toJSDate() < bornes.debut || +ev.startDate.toJSDate() > bornes.fin) continue
      retenir(ev.startDate, ev.endDate)
      continue
    }

    try {
      const it = ev.iterator()
      let gardees = 0
      for (let i = 0; i < MAX_ITERATIONS && gardees < MAX_OCCURRENCES; i++) {
        const t = it.next()
        if (!t) break
        const instant = +t.toJSDate()
        if (instant > bornes.fin) break
        // Hors fenêtre : on NE calcule PAS le détail (c'est l'appel coûteux).
        if (instant < bornes.debut) continue
        const d = ev.getOccurrenceDetails(t)
        retenir(d.startDate, d.endDate, `:${jourIcal(d.startDate)}`)
        gardees++
        if (Date.now() > jusqua) { tronque = true; break }
      }
    } catch { /* récurrence illisible : l'évènement est ignoré, pas le flux */ }
  }
  return { occurrences: out, tronque, msExpansion: Date.now() - t0 }
}

// ---- synchronisation -------------------------------------------------------

interface Feed { id: string; label: string; ical_url: string; domain_id: string | null; ignored: string[] | null }
interface Proposition extends Occurrence { feed_id: string; feed_label: string }
interface Compte {
  label: string; propositions: Proposition[]
  suivis: number; majs: number; retires: number; tronque: boolean; erreur?: string
}

async function syncFeed(
  // deno-lint-ignore no-explicit-any
  supabase: any, userId: string, feed: Feed, jusqua: number,
): Promise<Compte> {
  const debut = new Date().toISOString().slice(0, 10) // pas d'historique
  const fin = ajouterJours(debut, JOURS_APRES)
  const vide = { label: feed.label, propositions: [], suivis: 0, majs: 0, retires: 0, tronque: false }

  let lu: Resultat
  try {
    const t0 = Date.now()
    const res = await fetch(feed.ical_url, { headers: { Accept: 'text/calendar' } })
    if (!res.ok) throw new Error(`agenda injoignable (${res.status})`)
    const ics = await res.text()
    const msFetch = Date.now() - t0
    lu = lireFlux(ics, debut, fin, feed.ignored ?? [], jusqua)
    // Repères de diagnostic, sans jamais journaliser le contenu de l'agenda.
    console.log(JSON.stringify({
      agenda: feed.label, octets: ics.length, msFetch,
      msExpansion: lu.msExpansion, occurrences: lu.occurrences.length, tronque: lu.tronque,
    }))
  } catch (e) {
    const erreur = e instanceof Error ? e.message : String(e)
    await supabase.from('calendar_feeds')
      .update({ last_error: erreur, last_sync_at: new Date().toISOString() }).eq('id', feed.id)
    return { ...vide, erreur }
  }

  const prefixe = `source:gcal:${feed.id}:`
  const { data: existants } = await supabase.from('tasks')
    .select('id, notes, title, scheduled_date, end_date, location, duration_min')
    .eq('user_id', userId).like('notes', `${prefixe}%`)

  // deno-lint-ignore no-explicit-any
  const parNotes = new Map<string, any>((existants ?? []).map((t: any) => [t.notes as string, t]))
  const vues = new Set<string>()
  const propositions: Proposition[] = []
  let majs = 0

  for (const o of lu.occurrences) {
    const notes = `${prefixe}${o.cle}`
    if (vues.has(notes)) continue
    vues.add(notes)
    const dejaLa = parNotes.get(notes)
    if (!dejaLa) {
      // Jamais accepté : c'est une proposition, on ne crée rien.
      if (propositions.length < MAX_PROPOSITIONS) {
        propositions.push({ ...o, feed_id: feed.id, feed_label: feed.label })
      }
      continue
    }
    // Déjà suivi : on le tient à jour.
    const ligne = {
      title: o.titre, scheduled_date: o.debut, end_date: o.fin,
      location: o.lieu, duration_min: o.duree,
    }
    const change = dejaLa.title !== ligne.title || dejaLa.scheduled_date !== ligne.scheduled_date
      || dejaLa.end_date !== ligne.end_date || dejaLa.location !== ligne.location
      || dejaLa.duration_min !== ligne.duration_min
    if (change) { await supabase.from('tasks').update(ligne).eq('id', dejaLa.id); majs++ }
  }

  // Un évènement suivi qui a disparu de l'agenda disparaît d'Horizon — mais
  // seulement dans la fenêtre lue, et jamais après une synchro tronquée : on
  // ne sait pas ce qu'on n'a pas eu le temps de lire.
  // deno-lint-ignore no-explicit-any
  const aRetirer = lu.tronque ? [] : (existants ?? []).filter((t: any) => {
    if (vues.has(t.notes as string)) return false
    const d = t.scheduled_date as string | null
    return !!d && d >= debut && d <= fin
  })
  if (aRetirer.length) {
    // deno-lint-ignore no-explicit-any
    await supabase.from('tasks').delete().in('id', aRetirer.map((t: any) => t.id as string))
  }

  await supabase.from('calendar_feeds').update({
    last_sync_at: new Date().toISOString(),
    last_error: lu.tronque ? 'Agenda volumineux : lecture partielle, relance pour voir la suite.' : null,
    last_count: lu.occurrences.length,
  }).eq('id', feed.id)

  return {
    label: feed.label, propositions,
    suivis: (existants ?? []).length, majs, retires: aRetirer.length, tronque: lu.tronque,
  }
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
      .select('id, label, ical_url, domain_id, ignored').eq('user_id', uid).eq('active', true)
    if (error) return json({ error: error.message }, 500)
    if (!feeds?.length) return json({ ok: true, agendas: [], propositions: [] })

    // Budget partagé : chaque agenda reçoit ce qu'il reste.
    const jusqua = Date.now() + BUDGET_MS
    const agendas: Compte[] = []
    for (const f of feeds) agendas.push(await syncFeed(supabase, uid, f as unknown as Feed, jusqua))

    const propositions = agendas.flatMap((a) => a.propositions)
      .sort((a, b) => a.debut.localeCompare(b.debut) || a.titre.localeCompare(b.titre))
    return json({
      ok: true,
      agendas: agendas.map(({ propositions: _p, ...reste }) => reste),
      propositions,
    })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
