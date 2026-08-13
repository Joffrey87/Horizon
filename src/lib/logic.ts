// ================================================================
// HORIZON — règles métier pures (aucun accès réseau)
// Philosophie : réduire la charge mentale, signaler sans culpabiliser
// ================================================================

import {
  addDays, addMonths, differenceInCalendarDays, eachDayOfInterval, format, getDate, getISODay,
  isSaturday, isSunday, parseISO, startOfWeek, subDays,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import type {
  Alert, Birthday, Check, Domain, Habit, HabitLog, HoursRules, OlafatcoJob, OlafatcoLine,
  Project, Review, Settings, Task,
} from './types'

/** Anniversaires tombant un jour donné (récurrence annuelle : jour + mois). */
export function birthdaysForDay(list: Birthday[], day: Date): Birthday[] {
  const d = day.getDate(), m = day.getMonth() + 1
  return list.filter((b) => b.day === d && b.month === m)
}

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
    if (t.status === 'fait') {
      // une tâche cochée reste à sa place (date planifiée / échéance) ;
      // à défaut de date, on la montre au jour où elle a été faite.
      if (t.scheduled_date === dayIso || t.due_date === dayIso) return true
      return !t.scheduled_date && !t.due_date && t.done_at?.slice(0, 10) === dayIso
    }
    if (t.scheduled_date === dayIso || t.due_date === dayIso) return true
    // évènement qui s'étend « jusqu'à une date » : présent chaque jour de la plage
    if (t.end_date && t.scheduled_date && t.scheduled_date <= dayIso && dayIso <= t.end_date) return true
    // une tâche en retard remonte sur le jour courant, pas sur tous les jours
    return dayIso === today && t.due_date !== null && t.due_date < today
      && (t.scheduled_date === null || t.scheduled_date <= today)
  })
}

/** Position d'un item multi-jours (end_date) sur un jour donné, pour un rendu continu. */
export function spanPart(t: Task, dayIso: string): 'single' | 'start' | 'middle' | 'end' {
  if (!t.end_date || !t.scheduled_date || t.end_date <= t.scheduled_date) return 'single'
  if (dayIso === t.scheduled_date) return 'start'
  if (dayIso === t.end_date) return 'end'
  return 'middle'
}

/** Bascule de journée « perso » à 4h du matin : renvoie le seuil courant.
 *  Une tâche faite avant ce seuil est considérée comme d'un jour révolu. */
export function dayCutoff(now = new Date()): Date {
  const c = new Date(now)
  c.setHours(4, 0, 0, 0)
  if (now.getHours() < 4) c.setDate(c.getDate() - 1)
  return c
}

/** Tâche faite « récemment » : cochée depuis le dernier seuil de 4h.
 *  On la garde affichée (rayée) jusqu'au lendemain 4h, puis elle disparaît. */
export function isRecentlyDone(t: Task, now = new Date()): boolean {
  if (t.status !== 'fait' || !t.done_at) return false
  return new Date(t.done_at) >= dayCutoff(now)
}

/** Le focus du jour : ~3 tâches maximum (cockpit, jamais exhaustif). */
export function focusOfDay(tasks: Task[], day: Date, weekFocusIds: string[]): Task[] {
  const due = tasksForDay(tasks, day).filter((t) => t.status !== 'fait' && t.is_task !== false)
  const score = (t: Task) => {
    let s = (t.importance ?? 2) * 3 + (t.urgence ?? 2) * 2
    if (weekFocusIds.includes(t.id)) s += 10
    if (t.due_date && t.due_date <= iso(day)) s += 6
    return s
  }
  return [...due].sort((a, b) => score(b) - score(a)).slice(0, 3)
}

/** Habitudes attendues un jour donné.
 *  - jours précis (weekdays) : uniquement ces jours ISO ;
 *  - sinon quotidienne ou hebdomadaire : candidate chaque jour. */
export function habitsForDay(habits: Habit[], day: Date): Habit[] {
  return habits
    .filter((h) => h.active)
    .filter((h) => parseISO(h.start_date) <= day)
    .filter((h) => {
      if (h.weekdays) return h.weekdays.split(',').map(Number).includes(getISODay(day))
      return true
    })
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

  // Projets bloqués
  for (const p of actifs) {
    if (p.blocked) {
      alerts.push({
        id: `blk-${p.id}`, kind: 'blocage', severity: 'warn',
        label: `« ${p.title} » est bloqué`,
        detail: p.blocked_reason ?? undefined, link: '/projets',
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

// ---- Grandes fêtes catholiques -------------------------------------------

export interface Feast {
  date: string       // ISO 'yyyy-MM-dd'
  name: string
  obligation: boolean // fête d'obligation / férié religieux en France
}

/** Date de Pâques (dimanche) pour une année, calendrier grégorien
 *  (algorithme de Meeus/Jones/Butcher). */
function computus(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) // 3 = mars, 4 = avril
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

const feastCache = new Map<number, Feast[]>()

/** Les 15 plus grandes fêtes catholiques d'une année (fixes + mobiles), triées par date. */
export function catholicFeasts(year: number): Feast[] {
  const cached = feastCache.get(year)
  if (cached) return cached
  const easter = computus(year)
  const mov = (offset: number) => iso(addDays(easter, offset))
  const fixed = (mth: number, d: number) => iso(new Date(year, mth - 1, d))
  const list: Feast[] = [
    { date: fixed(1, 1), name: 'Sainte Marie, Mère de Dieu', obligation: true },
    { date: fixed(1, 6), name: 'Épiphanie', obligation: false },
    { date: mov(-46), name: 'Mercredi des Cendres', obligation: false },
    { date: mov(-7), name: 'Dimanche des Rameaux', obligation: false },
    { date: mov(-3), name: 'Jeudi Saint', obligation: false },
    { date: mov(-2), name: 'Vendredi Saint', obligation: false },
    { date: mov(0), name: 'Pâques', obligation: true },
    { date: mov(39), name: 'Ascension', obligation: true },
    { date: mov(49), name: 'Pentecôte', obligation: false },
    { date: mov(56), name: 'Sainte Trinité', obligation: false },
    { date: mov(60), name: 'Fête-Dieu (Saint-Sacrement)', obligation: false },
    { date: fixed(8, 15), name: 'Assomption', obligation: true },
    { date: fixed(11, 1), name: 'Toussaint', obligation: true },
    { date: fixed(12, 8), name: 'Immaculée Conception', obligation: false },
    { date: fixed(12, 25), name: 'Noël', obligation: true },
  ].sort((a, b) => a.date.localeCompare(b.date))
  feastCache.set(year, list)
  return list
}

/** Nom de la grande fête catholique tombant ce jour-là, sinon null. */
export function feastOnDay(day: Date): string | null {
  const di = iso(day)
  return catholicFeasts(day.getFullYear()).find((f) => f.date === di)?.name ?? null
}

/** Fêtes indexées par date ISO, pour toutes les années couvrant [startYear, endYear]. */
export function feastMap(startYear: number, endYear: number): Record<string, Feast> {
  const map: Record<string, Feast> = {}
  for (let y = startYear; y <= endYear; y++) {
    for (const f of catholicFeasts(y)) map[f.date] = f
  }
  return map
}

// ---- Vérifications configurables -----------------------------------------

/** Jour d'obligation dominicale / dévotions : dimanche, 1er vendredi, 1er samedi du mois. */
export function isObligationDay(day: Date): boolean {
  const wd = getISODay(day) // 1 = lundi … 7 = dimanche
  if (wd === 7) return true
  const firstOfKind = getDate(day) <= 7 // 1er de ce jour dans le mois
  if (wd === 5 && firstOfKind) return true // 1er vendredi
  if (wd === 6 && firstOfKind) return true // 1er samedi
  return false
}

/** Motif du jour d'obligation, pour l'affichage. */
export function obligationLabel(day: Date): string {
  const wd = getISODay(day)
  if (wd === 7) return 'dimanche'
  if (wd === 5) return '1er vendredi'
  if (wd === 6) return '1er samedi'
  return ''
}

/** Est-ce que je travaille ce jour-là ? = un évènement importé du planning CAPS
 *  (notes « source:caps ») ce jour, qui n'est pas un congé posé (V / Vf). */
export function worksOn(tasks: Task[], day: Date): boolean {
  const d = iso(day)
  return tasks.some((t) =>
    (t.notes?.includes('source:caps') ?? false)
    && t.scheduled_date === d
    && !/ - Vf?$/.test(t.title))
}

/** URL de recherche messes.info pour une ville (accents retirés). */
export function citySlug(city: string): string {
  return city.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, '+')
}
export function massesInfoUrl(city: string): string {
  return `https://messes.info/horaires/${citySlug(city)}`
}
/** Ville d'une liste de messes maintenue en interne (déroulante horaire dispo). */
export function hasMaintainedMasses(city: string): boolean {
  return /reims/i.test(city)
}

/** Suis-je en déplacement/vacances ce jour-là ? = un évènement avec un lieu qui
 *  couvre ce jour (span [scheduled_date, end_date]). Renvoie le lieu, sinon null. */
export function tripLocationOn(tasks: Task[], dayIso: string): string | null {
  for (const t of tasks) {
    if (t.is_task === false && t.location && t.scheduled_date) {
      const end = t.end_date ?? t.scheduled_date
      if (t.scheduled_date <= dayIso && dayIso <= end) return t.location
    }
  }
  return null
}

export interface CheckStatus {
  due: boolean
  /** messe_travail : TOUS les jours d'obligation retenus de la fenêtre (dans l'ordre,
   *  réglés compris). `location` = où chercher la messe (domicile ou lieu de séjour).
   *  `feast` = nom de la grande fête catholique si le jour en est une. */
  dates: { date: string; label: string; location: string; feast?: string }[]
  /** Nb de points encore à traiter (messe : dates ni réglées ni choisies ; periodique : 0/1). */
  pending: number
  /** periodique : nb de jours écoulés au-delà de l'échéance (≥ 0) une fois due. */
  overdueDays: number | null
  /** periodique : dans combien de jours la prochaine échéance (si pas encore due). */
  nextDueInDays: number | null
}

/** État d'une vérification à l'instant présent. */
export function checkStatus(check: Check, tasks: Task[], opts: { now?: Date; homeCity?: string; feasts?: boolean } = {}): CheckStatus {
  const now = opts.now ?? new Date()
  const homeCity = opts.homeCity?.trim() || 'Reims'
  if (check.kind === 'messe_travail') {
    const resolved = new Set(check.resolved ?? [])
    const chosen = ((check.config?.chosen) ?? {}) as Record<string, string>
    const start = now
    const end = addMonths(now, check.window_months)
    // Grandes fêtes catholiques de la fenêtre (si l'affichage est activé) : elles
    // rejoignent les jours candidats, en plus des jours d'obligation habituels.
    const feasts: Record<string, Feast> = opts.feasts ? feastMap(start.getFullYear(), end.getFullYear()) : {}
    const days = eachDayOfInterval({ start, end })
    const dates = days.flatMap((d): CheckStatus['dates'] => {
      const di = iso(d)
      const feast: Feast | undefined = feasts[di]
      if (!isObligationDay(d) && !feast) return []
      // un jour candidat est retenu si je travaille CE jour OU si je suis en séjour
      const trip = tripLocationOn(tasks, di)
      if (!worksOn(tasks, d) && trip === null) return []
      const entry: CheckStatus['dates'][number] = {
        date: di,
        label: feast ? feast.name : obligationLabel(d),
        location: trip ?? homeCity,
      }
      if (feast) entry.feast = feast.name
      return [entry]
    })
    const pending = dates.filter((d) => !resolved.has(d.date) && !chosen[d.date]).length
    return { due: pending > 0, dates, pending, overdueDays: null, nextDueInDays: null }
  }
  // périodique
  const interval = check.interval_days ?? 30
  if (!check.last_done_at) return { due: true, dates: [], pending: 1, overdueDays: 0, nextDueInDays: null }
  const daysSince = differenceInCalendarDays(now, parseISO(check.last_done_at))
  if (daysSince >= interval) return { due: true, dates: [], pending: 1, overdueDays: daysSince - interval, nextDueInDays: null }
  return { due: false, dates: [], pending: 0, overdueDays: null, nextDueInDays: interval - daysSince }
}

/** Parse la garde CAPS depuis son titre (« 6h-14h M1 », « 15h-20h45 S2 - Ext »).
 *  Renvoie début/fin en minutes depuis minuit (fin + 24 h si la garde franchit minuit). */
export function parseShift(title: string): { start: number; end: number } | null {
  const m = title.match(/(\d{1,2})h(\d{2})?\s*[-–]\s*(\d{1,2})h(\d{2})?/)
  if (!m) return null
  const start = Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0)
  let end = Number(m[3]) * 60 + (m[4] ? Number(m[4]) : 0)
  if (end < start) end += 24 * 60
  return { start, end }
}

/** La garde travaillée (CAPS, hors congé V/Vf) d'un jour donné, si elle existe.
 *  `code` = le code de journée CAPS (M1, J, S1, N…) extrait du titre. */
export function workShiftOn(tasks: Task[], dayIso: string): { start: number; end: number; code: string } | null {
  const t = tasks.find((x) => (x.notes?.includes('source:caps') ?? false)
    && x.scheduled_date === dayIso && !/ - Vf?$/.test(x.title))
  if (!t) return null
  const shift = parseShift(t.title)
  if (!shift) return null
  const code = t.title.match(/\d{1,2}h\d{0,2}\s*[-–]\s*\d{1,2}h\d{0,2}\s+(\S+)/)
  return { ...shift, code: code ? code[1] : '' }
}

/** Dimanche travaillé avec un début strictement avant 15h (M1, M2, J, S1 ; pas N).
 *  Ces jours-là, marché dominical + stationnement compliqués → alerte « Marché / Parking ».
 *  Un début à 15h pile ne déclenche pas l'alerte (le marché est terminé). */
export function isMarketParkingDay(tasks: Task[], day: Date): boolean {
  if (getISODay(day) !== 7) return false
  const shift = workShiftOn(tasks, iso(day))
  return !!shift && shift.start < 15 * 60
}

/** Formate des minutes depuis minuit en « 6h » / « 20h45 ». */
export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60) % 24, m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

/** Une messe (heure « HH:MM ») est-elle compatible avec la garde ?
 *  Il faut une marge de `buffer` min avant/après le travail ; on suppose une
 *  messe de `massMin` min (par défaut 60). Compatible = finie avant le début
 *  (– marge) OU commencée après la fin (+ marge) de la garde. */
export function massFitsShift(time: string, shift: { start: number; end: number },
  buffer = 30, massMin = 60): boolean {
  const [h, mm] = time.split(':').map(Number)
  const massStart = h * 60 + mm
  const massEnd = massStart + massMin
  return massEnd <= shift.start - buffer || massStart >= shift.end + buffer
}

/** Nb total de points « à vérifier maintenant » sur toutes les vérifications actives. */
export function checksDueCount(checks: Check[], tasks: Task[], opts: { now?: Date; homeCity?: string; feasts?: boolean } = {}): number {
  return checks
    .filter((c) => c.active)
    .reduce((n, c) => n + checkStatus(c, tasks, opts).pending, 0)
}

// ---- Heures de contrôle (OLAFATCO) : proposition selon les règles ----------

/** Règles par défaut (été aéronautique) — celles calées avec l'utilisateur.
 *  Total standard + instructeur borné, ≥ 1,5 de chaque côté, pas de 0,25.
 *  Jours « hauts » (ven→lun) visent 4,5–4,75 ; jours bas (mar→jeu) 4,0–4,25. */
export const DEFAULT_HOURS_RULES: HoursRules = {
  totalMin: 4, totalMax: 5, minPerSide: 1.5, step: 0.25,
  highDaysISO: [5, 6, 7, 1], highTotals: [4.5, 4.75], lowTotals: [4, 4.25],
  urmn: 2, urme: 2,
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Choix stable dans un tableau (repli si vide / index hors bornes). */
function pick<T>(arr: T[], i: number, fallback: T): T {
  if (arr.length === 0) return fallback
  return arr[((i % arr.length) + arr.length) % arr.length] ?? fallback
}

/** Hash déterministe (FNV-1a) d'une chaîne → entier ≥ 0. Sert à tirer des heures
 *  « variées mais reproductibles » par jour, sans PRNG (même jour ⇒ mêmes heures). */
function strHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/** Somme standard + instructeur d'une ligne. */
export function lineTotal(line: { standard: number; instructeur: number }): number {
  return round2(line.standard + line.instructeur)
}

/** Une ligne respecte-t-elle les règles (total borné, ≥ min de chaque côté, pas) ? */
export function isLineValid(line: OlafatcoLine, rules: HoursRules = DEFAULT_HOURS_RULES): boolean {
  const total = lineTotal(line)
  const onStep = (v: number) => Math.abs(v / rules.step - Math.round(v / rules.step)) < 1e-6
  return total >= rules.totalMin - 1e-9 && total <= rules.totalMax + 1e-9
    && line.standard >= rules.minPerSide - 1e-9 && line.instructeur >= rules.minPerSide - 1e-9
    && onStep(line.standard) && onStep(line.instructeur)
}

/** Jours travaillés (vacations CAPS, hors congés) sur [from, to], triés, avec code. */
export function controlHoursWorkDays(tasks: Task[], from: Date, to: Date): { date: string; code: string }[] {
  if (from > to) return []
  return eachDayOfInterval({ start: from, end: to })
    .filter((d) => worksOn(tasks, d))
    .map((d) => ({ date: iso(d), code: workShiftOn(tasks, iso(d))?.code ?? '' }))
}

/** Propose les heures d'un jour selon les règles — déterministe par date. */
export function proposeControlHours(dateIso: string, shiftCode: string, rules: HoursRules = DEFAULT_HOURS_RULES): OlafatcoLine {
  const wd = getISODay(parseISO(dateIso))
  const totals = rules.highDaysISO.includes(wd) ? rules.highTotals : rules.lowTotals
  const total = pick(totals, strHash(dateIso), rules.totalMin)
  // valeurs possibles de « standard » : de minPerSide à total - minPerSide, par pas
  const opts: number[] = []
  for (let sVal = rules.minPerSide; sVal <= total - rules.minPerSide + 1e-9; sVal += rules.step) {
    opts.push(round2(sVal))
  }
  const standard = pick(opts, strHash(dateIso + '·s'), round2(total / 2))
  return {
    date: dateIso, shift_code: shiftCode,
    standard, instructeur: round2(total - standard),
    urmn: rules.urmn, urme: rules.urme,
  }
}

/** Construit les lignes proposées d'un job pour une période. */
export function buildControlHoursLines(tasks: Task[], from: Date, to: Date, rules: HoursRules = DEFAULT_HOURS_RULES): OlafatcoLine[] {
  return controlHoursWorkDays(tasks, from, to).map((d) => proposeControlHours(d.date, d.code, rules))
}

/** Fin de la dernière période saisie (period_end du dernier job validé), ou null. */
export function lastControlHoursPeriodEnd(jobs: OlafatcoJob[]): string | null {
  const ends = jobs.filter((j) => j.validated_at).map((j) => j.period_end).sort()
  return ends.length ? (ends[ends.length - 1] ?? null) : null
}

/** Jours écoulés depuis la dernière saisie validée, ou null si jamais. */
export function daysSinceLastControlHours(jobs: OlafatcoJob[], now = new Date()): number | null {
  const dates = jobs.filter((j) => j.validated_at).map((j) => j.validated_at as string).sort()
  const last = dates.length ? dates[dates.length - 1] : null
  return last ? differenceInCalendarDays(now, parseISO(last)) : null
}

/** Dates déjà engagées pour saisie (jobs validés / en cours / terminés).
 *  Elles ne doivent plus jamais être reproposées, quelle que soit la période choisie. */
export function enteredControlDates(jobs: OlafatcoJob[]): Set<string> {
  const done = new Set<string>()
  for (const j of jobs) {
    if (j.status === 'valide' || j.status === 'en_cours' || j.status === 'termine') {
      for (const l of j.lines) done.add(l.date)
    }
  }
  return done
}

/** Sécurité « jours oubliés » : jours travaillés (CAPS, hors congés) situés AVANT
 *  la fin de la dernière saisie validée — donc dans une période déjà clôturée —
 *  mais jamais engagés sur un job. Comparaison : vacations `tasks` (source:caps)
 *  vs dates déjà engagées (`enteredControlDates`). Scan borné à `lookbackDays`
 *  jours en arrière. Vide tant qu'aucune saisie n'a jamais été validée. */
export function forgottenControlDays(
  tasks: Task[], jobs: OlafatcoJob[], now = new Date(), lookbackDays = 120,
): OlafatcoLine[] {
  const lastEnd = lastControlHoursPeriodEnd(jobs)
  if (!lastEnd) return []
  const done = enteredControlDates(jobs)
  return buildControlHoursLines(tasks, subDays(now, lookbackDays), parseISO(lastEnd))
    .filter((l) => !done.has(l.date))
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

// ---- Écriture du jour -----------------------------------------------------
// Une seule source par jour, partagée entre la citation de l'accueil (verset
// court) et la page Écritures (passage complet). Alterne un jour sur deux
// entre Ancien et Nouveau Testament. Chaque entrée : passage, titre, verset
// clé (affiché tel quel, sans IA) et sa référence.
export type Testament = 'AT' | 'NT'
export interface DailyScripture {
  testament: Testament
  reference: string   // passage complet, ex. « Matthieu 6, 19-24 »
  title: string
  verse: string       // verset clé (Segond 1910), affiché sur l'accueil et en tête d'Écritures
  verseRef: string    // référence du verset clé, ex. « Mt 6,21 »
  book: number        // n° de livre getbible (1-66)
  chapter: number
  start: number       // 1er verset du passage
  end: number         // dernier verset du passage
}

// [reference, title, verse (Segond), verseRef, book, chapter, start, end]
type Entry = [string, string, string, string, number, number, number, number]

const OT_SCRIPTURES: Entry[] = [
  ['Psaume 23', 'L’Éternel est mon berger', 'L’Éternel est mon berger : je ne manquerai de rien.', 'Ps 23,1', 19, 23, 1, 6],
  ['Psaume 37, 3-7', 'Recommande ton sort à l’Éternel', 'Recommande ton sort à l’Éternel, mets en lui ta confiance, et il agira.', 'Ps 37,5', 19, 37, 3, 7],
  ['Psaume 119, 105-112', 'Ta parole, une lampe', 'Ta parole est une lampe à mes pieds, et une lumière sur mon sentier.', 'Ps 119,105', 19, 119, 105, 112],
  ['Proverbes 16, 1-9', 'Recommande tes œuvres à l’Éternel', 'Recommande à l’Éternel tes œuvres, et tes projets réussiront.', 'Pr 16,3', 20, 16, 1, 9],
  ['Proverbes 3, 5-8', 'Confie-toi en l’Éternel', 'Confie-toi en l’Éternel de tout ton cœur, et ne t’appuie pas sur ta sagesse.', 'Pr 3,5', 20, 3, 5, 8],
  ['Josué 1, 6-9', 'Fortifie-toi et prends courage', 'Ne t’effraie point et ne t’épouvante point, car l’Éternel, ton Dieu, est avec toi.', 'Jos 1,9', 6, 1, 6, 9],
  ['Ecclésiaste 3, 1-8', 'Un temps pour tout', 'Il y a un temps pour tout, un temps pour toute chose sous les cieux.', 'Qo 3,1', 21, 3, 1, 8],
  ['Ésaïe 40, 28-31', 'Ils renouvellent leur force', 'Ceux qui se confient en l’Éternel renouvellent leur force.', 'Is 40,31', 23, 40, 28, 31],
  ['Ésaïe 55, 6-9', 'Cherchez l’Éternel', 'Cherchez l’Éternel pendant qu’il se trouve.', 'Is 55,6', 23, 55, 6, 9],
  ['Jérémie 29, 11-13', 'Des projets de paix', 'Je connais les projets que j’ai formés sur vous, projets de paix et non de malheur.', 'Jr 29,11', 24, 29, 11, 13],
  ['Michée 6, 6-8', 'Ce que l’Éternel demande', 'Pratiquer la justice, aimer la miséricorde, et marcher humblement avec ton Dieu.', 'Mi 6,8', 33, 6, 6, 8],
  ['Deutéronome 6, 4-9', 'Écoute, Israël', 'Tu aimeras l’Éternel, ton Dieu, de tout ton cœur, de toute ton âme et de toute ta force.', 'Dt 6,5', 5, 6, 4, 9],
]

const NT_SCRIPTURES: Entry[] = [
  ['Matthieu 6, 19-24', 'Le trésor dans le ciel', 'Là où est ton trésor, là aussi sera ton cœur.', 'Mt 6,21', 40, 6, 19, 24],
  ['Matthieu 6, 31-34', 'Cherchez premièrement le royaume', 'Cherchez premièrement le royaume et la justice de Dieu.', 'Mt 6,33', 40, 6, 31, 34],
  ['Luc 16, 10-13', 'Fidèle dans les moindres choses', 'Celui qui est fidèle dans les moindres choses l’est aussi dans les grandes.', 'Lc 16,10', 42, 16, 10, 13],
  ['Philippiens 4, 10-13', 'Je puis tout', 'Je puis tout par celui qui me fortifie.', 'Ph 4,13', 50, 4, 10, 13],
  ['Colossiens 3, 17-24', 'Comme pour le Seigneur', 'Tout ce que vous faites, faites-le de bon cœur, comme pour le Seigneur.', 'Col 3,23', 51, 3, 17, 24],
  ['1 Corinthiens 16, 13-14', 'Tout avec charité', 'Que tout ce que vous faites se fasse avec charité.', '1 Co 16,14', 46, 16, 13, 14],
  ['Matthieu 26, 36-41', 'Veillez et priez', 'Veillez et priez, afin que vous ne tombiez pas dans la tentation.', 'Mt 26,41', 40, 26, 36, 41],
  ['Jean 3, 16-17', 'Dieu a tant aimé le monde', 'Dieu a tant aimé le monde qu’il a donné son Fils unique.', 'Jn 3,16', 43, 3, 16, 17],
  ['1 Corinthiens 13, 1-7', 'L’hymne à la charité', 'La charité est patiente, elle est pleine de bonté.', '1 Co 13,4', 46, 13, 1, 7],
  ['Galates 5, 22-25', 'Le fruit de l’Esprit', 'Le fruit de l’Esprit, c’est l’amour, la joie, la paix, la patience…', 'Ga 5,22', 48, 5, 22, 25],
  ['Matthieu 5, 3-10', 'Les Béatitudes', 'Heureux les pauvres en esprit, car le royaume des cieux est à eux !', 'Mt 5,3', 40, 5, 3, 10],
  ['Jean 15, 4-8', 'Demeurez en moi', 'Demeurez en moi, et je demeurerai en vous.', 'Jn 15,4', 43, 15, 4, 8],
]

export function scriptureOfDay(now = new Date()): DailyScripture {
  const dayIndex = Math.floor(now.getTime() / 86_400_000)
  const testament: Testament = dayIndex % 2 === 0 ? 'AT' : 'NT'
  const list = testament === 'AT' ? OT_SCRIPTURES : NT_SCRIPTURES
  const entry = list[Math.floor(dayIndex / 2) % list.length] ?? list[0]!
  const [reference, title, verse, verseRef, book, chapter, start, end] = entry
  return { testament, reference, title, verse, verseRef, book, chapter, start, end }
}

/** Citation de l'accueil = verset clé de l'Écriture du jour (même source que la page Écritures). */
export function quoteOfDay(now = new Date()): { text: string; source: string } {
  const s = scriptureOfDay(now)
  return { text: s.verse, source: s.verseRef }
}

/** Fond d'écran du jour : rotation quotidienne parmi les images de /public/fonds. */
const WALLPAPER_COUNT = 9
export function wallpaperOfDay(now = new Date()): string {
  const dayIndex = Math.floor(now.getTime() / 86_400_000)
  return `/fonds/${((dayIndex % WALLPAPER_COUNT) + WALLPAPER_COUNT) % WALLPAPER_COUNT + 1}.png`
}

/** Phrases inspirantes sur le temps (vue Temps) — en rotation quotidienne. */
const TIME_QUOTES: [string, string][] = [
  ['On a toujours le temps pour ce qui compte vraiment.', ''],
  ['Il y a un temps pour tout, un temps pour toute chose sous le ciel.', 'Qo 3,1'],
  ['Ce n’est pas que nous ayons peu de temps, c’est que nous en perdons beaucoup.', 'Sénèque'],
  ['Enseigne-nous à compter nos jours, que nous venions au cœur de la sagesse.', 'Ps 90,12'],
  ['Le temps bien employé ne se rattrape pas, il se savoure.', ''],
  ['Ordonne ta journée, ou elle t’ordonnera.', ''],
  ['Rachetez le temps présent, car les jours sont mauvais.', 'Ep 5,16'],
  ['Une chose à la fois, faite avec soin, vaut dix commencées.', ''],
]

export function timeQuoteOfDay(now = new Date()): { text: string; source: string } {
  const i = Math.floor(now.getTime() / 86_400_000) % TIME_QUOTES.length
  const [text, source] = TIME_QUOTES[i]
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

/** Extrait les emojis d'un titre (variantes, séquences ZWJ et drapeaux inclus).
 *  Renvoie la chaîne concaténée des emojis trouvés, sinon ''. Sert à « signer »
 *  visuellement un évènement multi-jours sur chaque case du calendrier. */
// ️ = sélecteur de variante emoji ; ‍ = ZWJ (séquences composées, ex. 👨‍👩‍👧) ; RI = drapeaux
const EMOJI_RE = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*|\p{Regional_Indicator}{2}/gu
export function extractEmojis(title: string): string {
  return (title.match(EMOJI_RE) ?? []).join('')
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
