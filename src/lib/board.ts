// ================================================================
// Géométrie de l'espace visuel de l'accueil.
// Fonctions pures, sans React : elles sont testables telles quelles.
// ================================================================

export type Pos = { x: number; y: number }

/** Garde une carte entièrement dans le cadre : aucun bord ne doit dépasser.
 *  Si la carte est plus grande que le cadre, elle se colle en haut à gauche —
 *  mieux vaut le coin visible que le hors-champ. Sans cadre connu, on se
 *  contente d'interdire les positions négatives. */
export function borner(x: number, y: number, w: number, h: number, box?: { width: number; height: number }): Pos {
  const maxX = box ? Math.max(0, box.width - w) : Number.MAX_SAFE_INTEGER
  const maxY = box ? Math.max(0, box.height - h) : Number.MAX_SAFE_INTEGER
  return { x: Math.max(0, Math.min(maxX, x)), y: Math.max(0, Math.min(maxY, y)) }
}
