import { createContext, useEffect, useRef, useState } from 'react'
import { useHorizon } from '../../lib/store'

/** Position libre d'une brique dans la colonne de son jour (vue Semaine, ordinateur) : purement visuelle, l'heure de
 *  l'évènement ne change pas. Par défaut les briques s'empilent de haut en bas ; une brique déplacée se pose, magnétisée
 *  sur un cran de demi-heure, à l'endroit choisi — sans décaler les autres. Mémorisé dans un layout (projection
 *  `temps-briques`), donc retrouvé d'un appareil à l'autre ; les positions de plus de 60 jours sont oubliées. */
const PROJECTION = 'temps-briques'
const GARDER_JOURS = 60

/** Hauteur d'un cran de demi-heure (px) : l'échelle des briques est de 18 px par heure. */
export const PX_DEMI_HEURE = 9

/** Clé d'une brique : la tâche et le jour où elle s'affiche (une récurrente revient chaque jour). */
export const cleBrique = (tacheId: string, jour: string) => `${tacheId}|${jour}`

export type Positions = Record<string, number>

/** Brique en cours de glissement : son décalage entre le pointeur et son bord haut, pour qu'elle se pose où on la lâche. */
export const briqueEnCours: { courant: { id: string; jour: string; decalageY: number } | null } = { courant: null }

interface Ctx { positions: Positions; placer: (cle: string, demiHeures: number | null) => void }
export const PositionsCtx = createContext<Ctx>({ positions: {}, placer: () => {} })

const lire = (data: unknown): Positions => {
  const p = (data as { positions?: Positions } | undefined)?.positions
  return p && typeof p === 'object' ? p : {}
}

export function usePositionsBriques(): Ctx {
  const layout = useHorizon((s) => s.layouts.find((l) => l.projection === PROJECTION))
  const [positions, setPositions] = useState<Positions>(() => lire(layout?.data))
  const modifie = useRef(false)
  const file = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => { if (!modifie.current) setPositions(lire(layout?.data)) }, [layout])

  const ecrire = (suivant: Positions) => {
    file.current = file.current.then(async () => {
      const s = useHorizon.getState()
      const cur = s.layouts.find((l) => l.projection === PROJECTION)
      const limite = new Date(Date.now() - GARDER_JOURS * 864e5).toISOString().slice(0, 10)
      const propres = Object.fromEntries(Object.entries(suivant).filter(([k]) => (k.split('|')[1] ?? '') >= limite))
      const data = { ...(cur?.data ?? {}), positions: propres }
      if (cur) await s.update('layouts', cur.id, { data, updated_at: new Date().toISOString() })
      else await s.insert('layouts', { name: 'Briques de la semaine', projection: PROJECTION, is_default: false, data })
    })
  }
  const placer = (cle: string, demiHeures: number | null) => {
    modifie.current = true
    const suivant = { ...positions }
    if (demiHeures === null) delete suivant[cle]
    else suivant[cle] = demiHeures
    setPositions(suivant)
    ecrire(suivant)
  }
  return { positions, placer }
}
