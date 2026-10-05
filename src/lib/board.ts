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

// ---- Anti-chevauchement ------------------------------------------------------

export type Taille = { w: number; h: number }
export type Rect = Pos & Taille
/** Écart minimal laissé entre deux tuiles (px). */
export const ECART = 12

/** Deux rectangles se gênent-ils ? `ecart` est la marge à respecter entre eux :
 *  deux tuiles qui se touchent presque comptent comme superposées. */
export function chevauche(a: Rect, b: Rect, ecart = 0): boolean {
  return a.x < b.x + b.w + ecart && b.x < a.x + a.w + ecart
    && a.y < b.y + b.h + ecart && b.y < a.y + a.h + ecart
}

/** La place libre la PLUS PROCHE de `r` : on teste sa position d'origine puis
 *  les positions collées aux bords des autres tuiles (à droite, en dessous,
 *  alignées…). `null` s'il n'y en a aucune dans le cadre — l'appelant garde
 *  alors la position qu'il avait. */
export function placeLibre(r: Rect, autres: Rect[], box?: { width: number; height: number }, ecart = ECART): Pos | null {
  const xs = new Set<number>([r.x, 0])
  const ys = new Set<number>([r.y, 0])
  for (const o of autres) {
    xs.add(o.x + o.w + ecart); xs.add(o.x); xs.add(o.x - r.w - ecart)
    ys.add(o.y + o.h + ecart); ys.add(o.y); ys.add(o.y - r.h - ecart)
  }
  let best: Pos | null = null
  let bestD = Infinity
  for (const cx of xs) for (const cy of ys) {
    const p = borner(cx, cy, r.w, r.h, box)
    const cand = { ...p, w: r.w, h: r.h }
    if (autres.some((o) => chevauche(cand, o, ecart))) continue
    const d = (p.x - r.x) ** 2 + (p.y - r.y) ** 2
    if (d < bestD) { bestD = d; best = p }
  }
  return best
}

/** Écarte les tuiles qui se superposent. L'ordre de `items` fait la priorité :
 *  une tuile déjà posée ne bouge pas, c'est la suivante qui se range. Rend les
 *  positions corrigées (`null` si rien ne change). */
export function degager(
  items: Array<Rect & { id: string }>,
  box?: { width: number; height: number },
  ecart = ECART,
): Record<string, Pos> | null {
  const poses: Rect[] = []
  const out: Record<string, Pos> = {}
  let change = false
  for (const it of items) {
    let r: Rect = it
    if (poses.some((o) => chevauche(r, o, ecart))) {
      const p = placeLibre(it, poses, box, ecart)
      if (p && (p.x !== it.x || p.y !== it.y)) { r = { ...it, ...p }; change = true }
    }
    poses.push(r)
    out[it.id] = { x: r.x, y: r.y }
  }
  return change ? out : null
}
