import { createLucideIcon } from 'lucide-react'

/** Croix latine : branche du bas plus longue (même trait que les icônes lucide). */
export const CroixLatine = createLucideIcon('croix-latine', [
  ['path', { d: 'M12 2v20', key: 'v' }],
  ['path', { d: 'M6 8h12', key: 'h' }],
])

/** Bible vue de face, symétrique : couverture, tranche des pages, croix au centre et signet. */
export const LivreCroix = createLucideIcon('livre-croix', [
  ['rect', { x: '5', y: '2.5', width: '14', height: '17', rx: '2', key: 'couv' }],
  ['path', { d: 'M5 16.5h14', key: 'pages' }],
  ['path', { d: 'M12 6v7.5M9.5 8.5h5', key: 'croix' }],
  ['path', { d: 'M10.5 19.5v3l1.5-1.2 1.5 1.2v-3', key: 'signet' }],
])

/** Mains jointes en prière (même trait et même couleur que les autres icônes). */
export const MainsJointes = createLucideIcon('mains-jointes', [
  ['path', { d: 'M12 18V4.5c1.4 0 2.2 1 2.6 2.4L17 14v3.5l2.5 3.5', key: 'droite' }],
  ['path', { d: 'M12 18V4.5c-1.4 0-2.2 1-2.6 2.4L7 14v3.5L4.5 21', key: 'gauche' }],
  ['path', { d: 'M14.2 9.5l1 3.5M9.8 9.5l-1 3.5', key: 'doigts' }],
  ['path', { d: 'M14.5 21l2.5-3.5M9.5 21 7 17.5', key: 'manchettes' }],
])

/** Pages de Charité : sous-menu de la barre latérale et boutons du haut sur téléphone. */
export const PAGES_CHARITE = [
  { to: '/charite/ecritures', label: 'Écritures', icon: LivreCroix },
  { to: '/charite/prieres', label: 'Prières', icon: MainsJointes },
]
