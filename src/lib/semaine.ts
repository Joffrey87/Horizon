// Vue Semaine : calculs purs des briques (hauteur, libellés), testés à part.
import { extractHourMinute, fmtMinutes, parseShift } from './logic'
import type { Task } from './types'

export type ModeSemaine = 'bureau' | 'telephone'

/** Téléphone : échelle durée → hauteur d'une brique (px), de `min` (1 h ou moins) à `max` (8 h, la journée
 *  ou la soirée), linéaire entre les deux ; au-delà de 8 h, la hauteur reste `max`. `max` est la moitié de
 *  l'ancienne hauteur d'une brique J / S1 (176 → 88) pour que 2 rangées de 3 jours tiennent sans défilement. */
export const ECHELLE_TELEPHONE = { min: 36, max: 88 } as const   // ≈ 7,4 px/h entre 1 h et 8 h

/** Hauteur d'une brique (px), proportionnelle à la durée. Sans durée connue : la hauteur minimale.
 *  Bureau : 18 px/h + 40, bornée de 58 à 150 (inchangé). Téléphone : voir ECHELLE_TELEPHONE. */
export function hauteurBrique(dureeMin: number | null | undefined, mode: ModeSemaine): number {
  if (mode === 'bureau') {
    if (!dureeMin || dureeMin <= 0) return 58
    return Math.round(Math.max(58, Math.min(150, (dureeMin / 60) * 18 + 40)))
  }
  const { min, max } = ECHELLE_TELEPHONE
  if (!dureeMin || dureeMin <= 0) return min
  const d = Math.max(60, Math.min(480, dureeMin))
  return Math.round(min + ((max - min) * (d - 60)) / 420)
}

const hm = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

/** « 10:30 – 18:30 » (ou « 7:30 » sans durée) ; null si le titre n'a pas d'heure. */
export function libelleHeures(t: Pick<Task, 'title' | 'duration_min'>): string | null {
  const h = extractHourMinute(t.title)
  if (!h) return null
  const debut = h.hour * 60 + h.minute
  return t.duration_min ? `${hm(debut)} – ${hm(debut + t.duration_min)}` : hm(debut)
}

/** Heure courte (téléphone) : 480 → { h: '8h', m: null } ; 510 → { h: '8h', m: '30' } (minutes en exposant). */
export function heureCourte(min: number): { h: string; m: string | null } {
  const x = ((Math.round(min) % 1440) + 1440) % 1440
  const m = x % 60
  return { h: `${Math.floor(x / 60)}h`, m: m === 0 ? null : String(m).padStart(2, '0') }
}

/** « 45 min », « 8 h », « 2 h 30 » ; '' sans durée. */
export function libelleDuree(dureeMin: number | null | undefined): string {
  if (!dureeMin || dureeMin <= 0) return ''
  const h = Math.floor(dureeMin / 60), m = dureeMin % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

/** Première ligne de note lisible : les marqueurs techniques (`source:…`) sont ignorés. */
export function notePropre(notes: string | null | undefined): string | null {
  const l = (notes ?? '').split('\n').map((x) => x.trim()).find((x) => x && !/^source:/i.test(x))
  return l ?? null
}

/** Ordre dans la journée : évènements multi-jours, puis « toute la journée », puis ceux à heure (chronologique). */
export function ordreSemaine(a: Task, b: Task, spanA: boolean, spanB: boolean): number {
  const rang = (t: Task, span: boolean) => (span ? 0 : extractHourMinute(t.title) ? 2 : 1)
  const ra = rang(a, spanA), rb = rang(b, spanB)
  if (ra !== rb) return ra - rb
  if (ra === 2) {
    const ha = extractHourMinute(a.title)!, hb = extractHourMinute(b.title)!
    return (ha.hour * 60 + ha.minute) - (hb.hour * 60 + hb.minute)
  }
  if (ra === 0) return (a.scheduled_date ?? '').localeCompare(b.scheduled_date ?? '') || a.id.localeCompare(b.id)
  return 0
}

// ---- Bande de service (téléphone) -----------------------------------------------------------------
// Les gardes importées de CAPS (notes « source:caps », hors congés « - V » / « - Vf ») deviennent une bande
// pleine en tête de la journée, au lieu d'une brique.

/** Couleurs des codes de service (fond, texte) : ambre, orange vif/clair, rouille ; aucun bleu. */
const COULEURS_SERVICE: Record<string, { fond: string; texte: string }> = {
  M1: { fond: '#fcd34d', texte: '#1c1500' },
  M2: { fond: '#fde68a', texte: '#1c1500' },
  J: { fond: '#f59e0b', texte: '#1c1100' },
  S1: { fond: '#ea580c', texte: '#1c0a02' },
  S2: { fond: '#fb923c', texte: '#1c0d03' },
  N: { fond: '#9a3412', texte: '#fff4e8' },
}
const SERVICE_AUTRE = { fond: '#d6a15c', texte: '#1c1100' }

export type BandeService = { id: string; code: string; libelle: string; fond: string; texte: string }

/** La garde CAPS d'un jour (« J 10h30–18h30 », « Nuit 19h45–6h »), ou null (jour sans service, congé inclus). */
export function bandeService(tasks: Pick<Task, 'id' | 'title' | 'notes' | 'scheduled_date'>[], dayIso: string): BandeService | null {
  const t = tasks.find((x) => (x.notes?.includes('source:caps') ?? false) && x.scheduled_date === dayIso && !/ - Vf?$/.test(x.title))
  if (!t) return null
  const g = parseShift(t.title)
  if (!g) return null
  const code = t.title.match(/\d{1,2}h\d{0,2}\s*[-–]\s*\d{1,2}h\d{0,2}\s+(\S+)/)?.[1] ?? ''
  const c = COULEURS_SERVICE[code] ?? SERVICE_AUTRE
  const nom = code === 'N' ? 'Nuit' : code
  return { id: t.id, code, libelle: `${nom ? `${nom} ` : ''}${fmtMinutes(g.start)}–${fmtMinutes(g.end)}`, ...c }
}
