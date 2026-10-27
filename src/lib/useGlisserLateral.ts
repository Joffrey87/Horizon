import { useRef } from 'react'

/** Le toucher a-t-il commencé dans une zone qui défile elle-même de côté (tableau, rangée d'onglets, volets) ? Alors on laisse faire. */
function dansZoneDefilante(cible: EventTarget | null): boolean {
  for (let el = cible instanceof HTMLElement ? cible : null; el; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) return true
  }
  return false
}

/** La zone qui défile verticalement sous la molette est-elle déjà au bout dans ce sens (ou ne défile-t-elle pas) ? */
function auBout(cible: EventTarget | null, sens: number): boolean {
  let zone: Element | null = document.scrollingElement
  for (let el = cible instanceof HTMLElement ? cible : null; el; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) { zone = el; break }
  }
  if (!zone) return true
  const reste = sens > 0 ? zone.scrollHeight - zone.clientHeight - zone.scrollTop : zone.scrollTop
  return reste <= 2
}

/** Geste « glisser le doigt de côté » (téléphone) : à étaler sur un conteneur. `suivant` = glissé vers la gauche,
 *  `precedent` = vers la droite. Ignoré si le geste est vertical, trop court, ou démarre dans une zone qui défile de côté. */
export function useGlisserLateral(precedent: (() => void) | null, suivant: (() => void) | null) {
  const depart = useRef<{ x: number; y: number } | null>(null)
  const derniere = useRef(0)
  return {
    // PC : la molette fait le même effet. Une molette de côté (ou Maj + molette) change toujours ; une molette verticale
    // seulement quand la page est déjà au bout (sinon elle sert à lire), et un nouveau geste à la fois.
    onWheel: (e: React.WheelEvent) => {
      const maintenant = Date.now(), pause = maintenant - derniere.current
      derniere.current = maintenant
      if (pause < 250) return
      const lateral = Math.abs(e.deltaX) > Math.abs(e.deltaY)
      const sens = lateral ? e.deltaX : e.deltaY
      if (!sens || (!lateral && !auBout(e.target, sens))) return
      const action = sens > 0 ? suivant : precedent
      action?.()
    },
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0]
      depart.current = t && !dansZoneDefilante(e.target) ? { x: t.clientX, y: t.clientY } : null
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const d = depart.current, t = e.changedTouches[0]
      depart.current = null
      if (!d || !t) return
      const dx = t.clientX - d.x, dy = t.clientY - d.y
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
      const action = dx < 0 ? suivant : precedent
      action?.()
    },
  }
}
