// ================================================================
// HORIZON — règles métier pures (aucun accès réseau)
// Philosophie : réduire la charge mentale, signaler sans culpabiliser
// ================================================================

import {
  differenceInCalendarDays, format, getDate, getISODay, isSaturday, isSunday,
  parseISO, startOfWeek, subDays,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Alert, Domain, Habit, HabitLog, Project, Review, Settings, Task } from './types'

export const fmtDay = (d: Date) => format(d, 'EEEE d MMMM yyyy', { locale: fr })
export const fmtShort = (d: Date) => format(d, 'd MMM', { locale: fr })
export const iso = (d: Date) => format(d, 'yyyy-MM-dd')
export const todayIso = () => iso(new Date())

/** Une tâche récurrente est-elle attendue ce jour-là ?
 *  Règles volontairement simples : 'daily' | 'weekly:1,3,5' (jours ISO) | 'monthly:15' */
export function recurrenceDueOn(rule: string | null, day: Date): boolean {
  if (!rule) return false
  if (rule === 'daily') return true
  const [kind, arg] = rule.split(':')
  if (kind === 'weekly' && arg) {
    return arg.split(',').map(Number).includes(getISODay(day))
  }
  if (kind === 'monthly' && arg) {
    return getDate(day) === Number(arg)
  }
  return false
}

export function recurrenceLabel(rule: string | null): string {
  if (!rule) return ''
  if (rule === 'daily') return 'Chaque jour'
  const [kind, arg] = rule.split(':')
  if (kind === 'weekly' && arg) {
    const names = ['', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim']
    return 'Chaque ' + arg.split(',').map((n) => names[Number(n)] ?? '?').join(', ')
  }
  if (kind === 'monthly' && arg) return `Le ${arg} du mois`
  return rule
}

/** Tâches attendues un jour donné : planifiées ce jour, échues ce jour,
 *  en retard (seulement sur le jour courant), ou récurrentes du jour. */
export function tasksForDay(tasks: Task[], day: Date): Task[] {
  const dayIso = iso(day)
  const today = todayIso()
  return tasks.filter((t) => {
    if (t.status === 'annule') return false
    if (t.is_recurring) return recurrenceDueOn(t.recurrence_rule, day)
    if (t.status === 'fait') return t.done_at?.slice(0, 10) === dayIso
    if (t.scheduled_date === dayIso || t.due_date === dayIso) return true
    // une tâche en retard remonte sur le jour courant, pas sur tous les jours
    return dayIso === today && t.due_date !== null && t.due_date < today
      && (t.scheduled_date === null || t.scheduled_date <= today)
  })
}

/** Le focus du jour : ~3 tâches maximum (cockpit, jamais exhaustif). */
export function focusOfDay(tasks: Task[], day: Date, weekFocusIds: string[]): Task[] {
  const due = tasksForDay(tasks, day).filter((t) => t.status !== 'fait')
  const score = (t: Task) => {
    let s = (t.importance ?? 2) * 3 + (t.urgence ?? 2) * 2
    if (weekFocusIds.includes(t.id)) s += 10
    if (t.due_date && t.due_date <= iso(day)) s += 6
    return s
  }
  return [...due].sort((a, b) => score(b) - score(a)).slice(0, 3)
}

/** Habitudes attendues aujourd'hui. */
export function habitsForDay(habits: Habit[], day: Date): Habit[] {
  return habits.filter((h) => h.active && (h.frequency_type === 'daily' || h.weekly_target > 0))
    .filter((h) => (h.frequency_type === 'daily' ? true : true))
    .filter((h) => parseISO(h.start_date) <= day)
}

export interface HabitStats {
  doneThisWeek: number
  target: number
  trend4w: number[] // % de réussite sur les 4 dernières semaines (0..1)
  ageDays: number
}

export function habitStats(habit: Habit, logs: HabitLog[], now = new Date()): HabitStats {
  const mine = logs.filter((l) => l.habit_id === habit.id && l.done)
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const target = habit.frequency_type === 'daily' ? 7 : habit.weekly_target
  const doneThisWeek = mine.filter((l) => parseISO(l.log_date) >= weekStart).length
  const trend4w: number[] = []
  for (let w = 3; w >= 0; w--) {
    const start = subDays(weekStart, w * 7)
    const end = subDays(weekStart, w * 7 - 7)
    const count = mine.filter((l) => {
      const d = parseISO(l.log_date)
      return d >= start && d < end
    }).length
    trend4w.push(Math.min(1, count / Math.max(1, target)))
  }
  return { doneThisWeek, target, trend4w, ageDays: differenceInCalendarDays(now, parseISO(habit.start_date)) }
}

/** Position Eisenhower d'un élément priorisable. */
export function quadrant(importance: number | null, urgence: number | null): 1 | 2 | 3 | 4 {
  const imp = (importance ?? 2) >= 2
  const urg = (urgence ?? 2) >= 2
  if (imp && urg) return 1 // Faire
  if (imp && !urg) return 2 // Planifier
  if (!imp && urg) return 3 // Déléguer / vite fait
  return 4 // Abandonner / plus tard
}

const STAGNATION_DAYS = 10

/** Alertes du cockpit : utiles, jamais culpabilisantes. */
export function computeAlerts(opts: {
  projects: Project[]
  habits: Habit[]
  logs: HabitLog[]
  reviews: Review[]
  settings: Settings | null
  now?: Date
}): Alert[] {
  const { projects, habits, logs, reviews, settings } = opts
  const now = opts.now ?? new Date()
  const alerts: Alert[] = []
  const actifs = projects.filter((p) => p.status === 'actif')

  // Surcharge WIP (seuil souple, réglable — décision : 5 par défaut)
  const wip = settings?.wip_limit ?? 5
  if (actifs.length > wip) {
    alerts.push({
      id: 'wip', kind: 'surcharge', severity: 'warn',
      label: `${actifs.length} projets actifs (seuil : ${wip})`,
      detail: 'Peut-être en mettre un en pause ? « Bonne idée, mais ce sera pour dans 6 mois. »',
      link: '/projets',
    })
  }

  // Projets sans activité
  for (const p of actifs) {
    const days = differenceInCalendarDays(now, parseISO(p.last_activity_at))
    if (days >= STAGNATION_DAYS) {
      alerts.push({
        id: `stag-${p.id}`, kind: 'stagnation', severity: 'info',
        label: `« ${p.title} » est calme depuis ${days} j`,
        detail: 'Toujours d’actualité ? Une prochaine action suffit à le relancer.',
        link: '/projets',
      })
    }
  }

  // Projets bloqués ou sans prochaine action
  for (const p of actifs) {
    if (p.blocked) {
      alerts.push({
        id: `blk-${p.id}`, kind: 'blocage', severity: 'warn',
        label: `« ${p.title} » est bloqué`,
        detail: p.blocked_reason ?? undefined, link: '/projets',
      })
    } else if (!p.next_action) {
      alerts.push({
        id: `na-${p.id}`, kind: 'sans_action', severity: 'info',
        label: `« ${p.title} » n'a pas de prochaine action`,
        link: '/projets',
      })
    }
  }

  // Revue hebdo manquée (fenêtre : samedi passé)
  const lastSat = subDays(now, ((getISODay(now) + 1) % 7))
  const satIso = iso(lastSat)
  const hasHebdo = reviews.some((r) => r.kind === 'hebdo' && r.review_date >= satIso && r.completed)
  if (!isSaturday(now) && !hasHebdo && reviews.length > 0) {
    alerts.push({
      id: 'revue', kind: 'revue', severity: 'info',
      label: 'La revue du samedi n’a pas encore été faite cette semaine',
      link: '/revues',
    })
  }

  // Habitude qui se dégrade (moins de la moitié de l'objectif 2 semaines de suite)
  for (const h of habits.filter((x) => x.active)) {
    const s = habitStats(h, logs, now)
    const [w2, w3] = [s.trend4w[2], s.trend4w[3]]
    if (h.anchor_state !== 'nouvelle' && w2 < 0.5 && w3 < 0.5) {
      alerts.push({
        id: `hab-${h.id}`, kind: 'habitude', severity: 'info',
        label: `« ${h.title} » se fragilise`,
        detail: 'À regarder pendant la revue mensuelle : simplifier, maintenir ou remplacer ?',
        link: '/habitudes',
      })
    }
  }

  return alerts.slice(0, 6) // le cockpit n'est jamais exhaustif
}

/** Équilibre des domaines : part de l'activité récente (tâches faites 14 j) par domaine. */
export function domainBalance(domains: Domain[], projects: Project[], tasks: Task[], now = new Date()) {
  const since = subDays(now, 14)
  const byDomain = new Map<string, number>(domains.map((d) => [d.id, 0]))
  for (const t of tasks) {
    if (t.status !== 'fait' || !t.done_at || parseISO(t.done_at) < since) continue
    const dom = t.domain_id ?? projects.find((p) => p.id === t.project_id)?.domain_id
    if (dom && byDomain.has(dom)) byDomain.set(dom, (byDomain.get(dom) ?? 0) + 1)
  }
  const max = Math.max(1, ...byDomain.values())
  return domains.map((d) => ({ domain: d, value: (byDomain.get(d.id) ?? 0) / max }))
}

/** Quel type de revue proposer aujourd'hui ? */
export function suggestedReview(now = new Date()): { kind: 'hebdo' | 'confirmation' | 'mensuelle' | null; label: string } {
  if (isSaturday(now)) return { kind: 'hebdo', label: 'Samedi : je conçois ma semaine' }
  if (isSunday(now)) return { kind: 'confirmation', label: 'Dimanche : je confirme ma semaine' }
  if (getDate(now) <= 2) return { kind: 'mensuelle', label: 'Début de mois : vérifier l’ancrage des habitudes' }
  return { kind: null, label: '' }
}

/** Citations du jour — inspiration sobre (option 5). */
const QUOTES: [string, string][] = [
  ['Là où se trouve ton trésor, là aussi sera ton cœur.', 'Mt 6,21'],
  ['La discipline d’aujourd’hui construit la liberté de demain.', ''],
  ['Ce qui compte le plus ne doit jamais être à la merci de ce qui compte le moins.', 'Goethe'],
  ['Un peu chaque jour finit par faire beaucoup.', ''],
  ['Qui est fidèle en peu de choses le sera aussi en beaucoup.', 'Lc 16,10'],
  ['Simplifier, c’est déjà avancer.', ''],
  ['Bonne idée — mais ce sera pour dans 6 mois.', 'Horizon'],
]

export function quoteOfDay(now = new Date()): { text: string; source: string } {
  const dayIndex = Math.floor(now.getTime() / 86_400_000) % QUOTES.length
  const [text, source] = QUOTES[dayIndex]
  return { text, source }
}

// ---- Salutations contextuelles (matin / journée / soir) ----------

const DAY_PHRASES = [
  'Quel est ton cap aujourd’hui ?',
  'Où porter ton attention aujourd’hui ?',
  'Un pas suffit à ouvrir la voie.',
  'Choisis ta première action.',
  'Fais peu, fais bien.',
  'Sur quoi vaut-il la peine d’insister ?',
  'Quelle est la ligne d’horizon du jour ?',
  'Quel geste t’approche de ton cap ?',
  'Reste simple. Reste net.',
  'Une chose à la fois.',
  'Où se joue l’essentiel aujourd’hui ?',
  'Choisis ce qui pèse, laisse ce qui traîne.',
  'Ce que tu commences aujourd’hui compte.',
  'Que veux-tu vraiment avancer ?',
]

const EVENING_PHRASES = [
  'Ferme la journée. Ouvre l’espace pour ce qui vient.',
  'Ce qui a été fait aujourd’hui, laisse-le partir. Demain a sa propre lumière.',
  'Ralentis. Le jour a suffi. Demain saura attendre.',
  'Prends note de ce qui compte. Puis laisse la nuit faire son travail.',
  'Un cap se garde aussi dans le silence du soir.',
  'Regarde en arrière avec calme. Regarde en avant avec confiance.',
  'Ce que tu prépares ce soir, tu le trouves demain.',
  'Repose l’esprit. Demain se prépare ici.',
]

/** Phrase du jour — change chaque jour, stable au sein de la journée. */
export function dayPhraseOfDay(now = new Date()): string {
  const idx = Math.floor(now.getTime() / 86_400_000) % DAY_PHRASES.length
  return DAY_PHRASES[idx]
}

/** Phrase du soir — change moins souvent (rotation hebdomadaire). */
export function eveningPhraseOfWeek(now = new Date()): string {
  const weekIndex = Math.floor(now.getTime() / (7 * 86_400_000))
  return EVENING_PHRASES[weekIndex % EVENING_PHRASES.length]
}

/** Extrait la première heure trouvée dans un titre : "9h30 dentiste", "14h", "9:00 call…". */
export function extractHourMinute(title: string): { hour: number; minute: number } | null {
  const m = title.match(/(?<!\d)(\d{1,2})[h:](\d{0,2})(?!\d)/i)
  if (!m) return null
  const hour = parseInt(m[1], 10)
  const minute = m[2] ? parseInt(m[2], 10) : 0
  if (hour > 23 || minute > 59) return null
  return { hour, minute }
}

/** Comparateur : tâches avec heure en tête (chronologique), puis les autres dans l'ordre existant. */
export function compareTasksByTitleTime(a: { title: string }, b: { title: string }): number {
  const ta = extractHourMinute(a.title)
  const tb = extractHourMinute(b.title)
  if (ta && tb) return (ta.hour * 60 + ta.minute) - (tb.hour * 60 + tb.minute)
  if (ta) return -1
  if (tb) return 1
  return 0
}

/** Segment de la journée à afficher en tête d'accueil. */
export type GreetingKind = 'morning' | 'day' | 'evening'

export function greetingKind(now = new Date(), morningGreetedAlready = false): GreetingKind {
  const h = now.getHours()
  if (h >= 22) return 'evening'
  if (h < 10 && !morningGreetedAlready) return 'morning'
  return 'day'
}
