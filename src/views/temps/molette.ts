import { useEffect, useRef } from 'react'
import { addDays, addWeeks, startOfMonth } from 'date-fns'

/** Nombre de semaines de la fenêtre glissante de la vue Mois. */
export const SEMAINES_FENETRE = 5

/** Les jours de la fenêtre glissante (lignes de 7 jours) qui commence au lundi `debut`. */
export function semainesFenetre(debut: Date): Date[][] {
  return Array.from({ length: SEMAINES_FENETRE }, (_, w) =>
    Array.from({ length: 7 }, (_, j) => addDays(addWeeks(debut, w), j)))
}

/** Le mois qui occupe le plus de jours de la fenêtre (sert de titre). */
export function moisMajoritaire(debut: Date): Date {
  const compte = new Map<number, { n: number; m: Date }>()
  for (let i = 0; i < SEMAINES_FENETRE * 7; i++) {
    const m = startOfMonth(addDays(debut, i))
    const c = compte.get(m.getTime()) ?? { n: 0, m }
    c.n++
    compte.set(m.getTime(), c)
  }
  let best: { n: number; m: Date } | null = null
  for (const c of compte.values()) if (!best || c.n > best.n) best = c
  return best!.m
}

/** Molette sur le calendrier : un cran = un pas (onPas(+1|-1)). Le défilement
 *  de la page est bloqué (écouteur non passif). Les deltas sont cumulés et un
 *  verrou évite qu'un geste de pavé tactile (avec son inertie) saute plusieurs
 *  pas : après un pas, rien pendant 300 ms ET tant que le geste continue. */
export function useMolette(ref: React.RefObject<HTMLElement | null>, onPas: (dir: 1 | -1) => void, actif = true) {
  const cb = useRef(onPas)
  cb.current = onPas
  useEffect(() => {
    const el = ref.current
    if (!el || !actif) return
    let cumul = 0
    let verrouJusqua = 0
    let dernier = 0
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return // zoom du navigateur
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      e.preventDefault()
      const now = performance.now()
      const ecart = now - dernier
      dernier = now
      if (now < verrouJusqua) {
        // Geste en cours (inertie du pavé tactile) : on prolonge le verrou sans avancer.
        if (ecart < 100) verrouJusqua = Math.max(verrouJusqua, now + 100)
        cumul = 0
        return
      }
      const delta = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * 800 : e.deltaY
      cumul += delta
      if (Math.abs(cumul) >= 30) {
        cb.current(cumul > 0 ? 1 : -1)
        cumul = 0
        verrouJusqua = now + 300
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref, actif])
}
