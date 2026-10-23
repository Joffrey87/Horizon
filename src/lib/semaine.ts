// Vue Semaine : calculs purs des briques (hauteur, libellés), testés à part.
import { extractHourMinute } from './logic'
import type { Task } from './types'

export type ModeSemaine = 'bureau' | 'telephone'

/** Hauteur d'une brique (px), proportionnelle à la durée.
 *  Bureau : 18 px/h + 40, bornée de 58 à 150. Téléphone : 22 px/h, bornée de 52 à 200.
 *  Sans durée connue : la hauteur minimale. */
export function hauteurBrique(dureeMin: number | null | undefined, mode: ModeSemaine): number {
  const [min, max] = mode === 'bureau' ? [58, 150] : [52, 200]
  if (!dureeMin || dureeMin <= 0) return min
  const h = mode === 'bureau' ? (dureeMin / 60) * 18 + 40 : (dureeMin / 60) * 22
  return Math.round(Math.max(min, Math.min(max, h)))
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
