// Contexte et petits utilitaires de l'onglet Finances (séparés des composants
// pour que le rechargement à chaud reste fiable).
import { useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useHorizon } from '../../lib/store'
import { indexer, moisDe, type FiltreTitulaire, type IndexFinances } from '../../lib/finances'
import type { FinCategory } from '../../lib/types'
import { todayIso } from '../../lib/logic'

export interface FinContexte {
  mois: string
  setMois: (m: string) => void
  filtre: FiltreTitulaire
  setFiltre: (f: FiltreTitulaire) => void
}
export const useFin = () => useOutletContext<FinContexte>()

export const moisCourant = () => moisDe(todayIso())

/** Index comptes / catégories / lignes, recalculé seulement quand ils changent. */
export function useIndex(): IndexFinances {
  const accounts = useHorizon((s) => s.finAccounts)
  const categories = useHorizon((s) => s.finCategories)
  const lines = useHorizon((s) => s.finLines)
  return useMemo(() => indexer(accounts, categories, lines), [accounts, categories, lines])
}

/** Catégories en groupes : chaque catégorie principale, puis ses sous-catégories. */
export function useArbreCategories() {
  const categories = useHorizon((s) => s.finCategories)
  return useMemo(() => {
    const enfants = new Map<string, FinCategory[]>()
    for (const c of categories) {
      if (!c.parent_id) continue
      enfants.set(c.parent_id, [...(enfants.get(c.parent_id) ?? []), c])
    }
    return categories.filter((c) => !c.parent_id)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      .map((p) => ({ parent: p, enfants: (enfants.get(p.id) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'fr')) }))
  }, [categories])
}

export const dateCourte = (d: string) => format(parseISO(d), 'd MMM', { locale: fr })
