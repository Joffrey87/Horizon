import { createLucideIcon } from 'lucide-react'

/** Croix latine : branche du bas plus longue (même trait que les icônes lucide). */
export const CroixLatine = createLucideIcon('croix-latine', [
  ['path', { d: 'M12 2v20', key: 'v' }],
  ['path', { d: 'M6 8h12', key: 'h' }],
])

/** Bible vue en perspective (couverture de biais, tranche des pages) avec une croix latine sur la couverture. */
export const LivreCroix = createLucideIcon('livre-croix', [
  ['path', { d: 'M4 6l11-3v16L4 22z', key: 'couv' }],
  ['path', { d: 'M15 3l4 2v16l-4-2', key: 'tranche' }],
  ['path', { d: 'M4 22l4 1.5 11-2.5', key: 'dos' }],
  ['path', { d: 'M9.5 8.2v8', key: 'croix-v' }],
  ['path', { d: 'M7.5 11l4-1', key: 'croix-h' }],
])

/** Mains jointes en prière (même trait et même couleur que les autres icônes). */
export const MainsJointes = createLucideIcon('mains-jointes', [
  ['path', { d: 'M12 17V5.5a1.5 1.5 0 0 1 3 0V10l2.6 3.6a3 3 0 0 1 .4 1.5V18l2 2.5', key: 'droite' }],
  ['path', { d: 'M12 17V5.5a1.5 1.5 0 0 0-3 0V10l-2.6 3.6a3 3 0 0 0-.4 1.5V18l-2 2.5', key: 'gauche' }],
])

/** Pages de Charité : sous-menu de la barre latérale et boutons du haut sur téléphone. */
export const PAGES_CHARITE = [
  { to: '/charite/ecritures', label: 'Écritures', icon: LivreCroix },
  { to: '/charite/prieres', label: 'Prières', icon: MainsJointes },
]
