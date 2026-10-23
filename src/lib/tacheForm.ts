// Logique pure du formulaire de tâche / évènement (testable sans navigateur).

export type UniteDuree = 'min' | 'heure' | 'jour'

const FACTEUR: Record<UniteDuree, number> = { min: 1, heure: 60, jour: 1440 }

/** Préréglages de durée du popover (½ j = 12 h). */
export const PRESETS_DUREE: { label: string; value: string; unit: UniteDuree }[] = [
  { label: '15 min', value: '15', unit: 'min' },
  { label: '30 min', value: '30', unit: 'min' },
  { label: '1 h', value: '1', unit: 'heure' },
  { label: '2 h', value: '2', unit: 'heure' },
  { label: '½ j', value: '12', unit: 'heure' },
]

/** Décompose une durée en minutes vers la plus grande unité exacte. */
export function decomposerDuree(min: number | null | undefined): { value: string; unit: UniteDuree } {
  if (!min) return { value: '', unit: 'min' }
  if (min % 1440 === 0) return { value: String(min / 1440), unit: 'jour' }
  if (min % 60 === 0) return { value: String(min / 60), unit: 'heure' }
  return { value: String(min), unit: 'min' }
}

/** Durée en minutes (null si vide ou si « jusqu'au » est rempli : il remplace la durée). */
export function dureeEnMinutes(value: string, unit: string, endDate: string): number | null {
  if (endDate || !value) return null
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return n * (FACTEUR[unit as UniteDuree] ?? 1)
}

/** Libellé court d'une durée : « 15 min », « 1 h », « 2 j ». */
export function libelleDuree(value: string, unit: string): string {
  if (!value) return '—'
  return `${value} ${unit === 'jour' ? 'j' : unit === 'heure' ? 'h' : 'min'}`
}

/** Pas du −/+ : 5 min pour les minutes, 1 sinon. Ne descend jamais sous 1. */
export function ajusterDuree(value: string, unit: string, sens: 1 | -1): string {
  const pas = unit === 'min' ? 5 : 1
  const n = Number(value) || 0
  if (!value && sens === -1) return ''
  return String(Math.max(1, n + sens * pas))
}

/** Cycle d'un niveau : vide → Basse → Moyenne → Haute → vide. */
export function niveauSuivant(v: number | null): number | null {
  return v === null || v === 0 ? 1 : v >= 3 ? null : v + 1
}

export const NOMS_NIVEAU = ['Non définie', 'Basse', 'Moyenne', 'Haute'] as const

export type FormTache = {
  title: string; anchor: string; scheduled_date: string; end_date: string
  dur_value: string; dur_unit: string
  is_task: boolean; importance: number | null; urgence: number | null
  is_recurring: boolean; recur_kind: string; recur_days: string; recur_dom: string
  notable: boolean; location: string; notes: string
}

/** Valeurs envoyées à la base. `due_date` est volontairement absent : le
 *  formulaire ne le gère plus, une échéance déjà posée n'est donc jamais écrasée. */
export function valeursTache(f: FormTache) {
  const rule = f.is_recurring
    ? (f.recur_kind === 'daily' ? 'daily'
      : f.recur_kind === 'weekly' ? `weekly:${f.recur_days || '1'}`
        : `monthly:${f.recur_dom || '1'}`)
    : null
  return {
    title: f.title.trim(),
    project_id: f.anchor.startsWith('p:') ? f.anchor.slice(2) : null,
    domain_id: f.anchor.startsWith('d:') ? f.anchor.slice(2) : null,
    scheduled_date: f.scheduled_date || null,
    end_date: f.end_date || null,
    duration_min: dureeEnMinutes(f.dur_value, f.dur_unit, f.end_date),
    is_task: f.is_task,
    importance: f.importance, urgence: f.urgence,
    is_recurring: f.is_recurring, recurrence_rule: rule,
    notable: f.notable,
    location: f.location.trim() || null,
    notes: f.notes.trim() || null,
  }
}

/** Au-delà de ce nombre de projets, ceux qui ne sont pas choisis passent en pastilles courtes. */
export const PROJETS_PLEINS_MAX = 3
export function projetsEnPastilles(nb: number, unChoisi: boolean): boolean {
  return unChoisi && nb > PROJETS_PLEINS_MAX
}

/** Clic « dans le vide » : sur la zone elle-même, pas sur un de ses enfants. */
export function clicDansLeVide(target: unknown, currentTarget: unknown): boolean {
  return target === currentTarget
}

/** Un balayage (déplacement horizontal marqué) ne doit pas compter comme un clic. */
export function estBalayage(dx: number, dy: number): boolean {
  return Math.abs(dx) > 10 || Math.abs(dy) > 10
}
