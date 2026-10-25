// Contexte et petits utilitaires de l'onglet Finances (séparés des composants
// pour que le rechargement à chaud reste fiable).
import { useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useHorizon, vueCourante } from '../../lib/store'
import { appliquerRemboursements, creerReconnaissance, indexer, type FiltreTitulaire, type IndexFinances } from '../../lib/finances'
import type { FinCategory } from '../../lib/types'
import { todayIso } from '../../lib/logic'
import { moisBudget } from '../../lib/moisPaie'

export interface FinContexte {
  mois: string
  setMois: (m: string) => void
  filtre: FiltreTitulaire
  setFiltre: (f: FiltreTitulaire) => void
  /** Téléphone / tablette : mois et titulaire sont dans la barre du haut (Shell), les pages n'affichent plus leurs propres choix. */
  barreHaute: boolean
}
export const useFin = () => useOutletContext<FinContexte>()

export const moisCourant = () => moisBudget(todayIso())

/** Vue partagée en cours (compte invité ou aperçu), sinon null. */
export const useVue = () => useHorizon((s) => vueCourante(s))

/** Index comptes / catégories / lignes, recalculé seulement quand ils changent. */
export function useIndex(): IndexFinances {
  const accounts = useHorizon((s) => s.finAccounts)
  const categories = useHorizon((s) => s.finCategories)
  const lines = useHorizon((s) => s.finLines)
  return useMemo(() => indexer(accounts, categories, lines), [accounts, categories, lines])
}

/** Opérations pour les calculs de budget : un remboursement rattaché compte dans le mois et la catégorie de sa dépense. */
export function useTransactionsBudget() {
  const transactions = useHorizon((s) => s.finTransactions)
  return useMemo(() => appliquerRemboursements(transactions), [transactions])
}

/** Reconnaissance des intitulés locaux, recalculée quand les règles changent. */
export function useReconnaissance() {
  const regles = useHorizon((s) => s.finLabels)
  const alias = useHorizon((s) => s.finMerchantAlias)
  return useMemo(() => creerReconnaissance(regles, alias), [regles, alias])
}

/** Catégories en groupes : chaque catégorie principale, puis ses sous-catégories.
 *  Les catégories masquées sont écartées, sauf `garder` (la catégorie en cours d'une opération). */
export function useArbreCategories(garder: string | null = null) {
  const toutes = useHorizon((s) => s.finCategories)
  return useMemo(() => {
    const categories = toutes.filter((c) => !c.hidden || c.id === garder
      || toutes.some((e) => e.parent_id === c.id && e.id === garder))
    const enfants = new Map<string, FinCategory[]>()
    for (const c of categories) {
      if (!c.parent_id) continue
      enfants.set(c.parent_id, [...(enfants.get(c.parent_id) ?? []), c])
    }
    return categories.filter((c) => !c.parent_id)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      .map((p) => ({ parent: p, enfants: (enfants.get(p.id) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'fr')) }))
  }, [toutes, garder])
}

export const dateCourte = (d: string) => format(parseISO(d), 'd MMM', { locale: fr })
export const dateLongue = (d: string) => format(parseISO(d), 'd MMM yy', { locale: fr })
