import { useHorizon } from './store'

/** Couleur d'Honorine dans Finances (pastilles d'attribution). Choisie par un code hexadécimal, mémorisée dans un
 *  layout (projection `couleur-honorine`, propre à chaque compte). */
export const PROJECTION_COULEUR_HONORINE = 'couleur-honorine'
export const COULEUR_HONORINE_DEFAUT = '#AC5AD6'

/** « ac5ad6 », « #AC5AD6 » ou « a5d » → « #AC5AD6 » ; null si ce n'est pas un code valide. */
export function normaliserCouleur(saisie: string): string | null {
  const c = saisie.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(c)) return `#${c.split('').map((x) => x + x).join('').toUpperCase()}`
  if (/^[0-9a-f]{6}$/i.test(c)) return `#${c.toUpperCase()}`
  return null
}

export function useCouleurHonorine(): string {
  return useHorizon((s) => {
    const c = s.layouts.find((l) => l.projection === PROJECTION_COULEUR_HONORINE)?.data?.couleur
    return typeof c === 'string' ? (normaliserCouleur(c) ?? COULEUR_HONORINE_DEFAUT) : COULEUR_HONORINE_DEFAUT
  })
}

export async function enregistrerCouleurHonorine(couleur: string) {
  const s = useHorizon.getState()
  const cur = s.layouts.find((l) => l.projection === PROJECTION_COULEUR_HONORINE)
  const data = { ...(cur?.data ?? {}), couleur }
  if (cur) await s.update('layouts', cur.id, { data, updated_at: new Date().toISOString() })
  else await s.insert('layouts', { name: 'Couleur d’Honorine', projection: PROJECTION_COULEUR_HONORINE, is_default: false, data })
}
