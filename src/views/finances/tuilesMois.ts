// Reste et Épargné du mois : un seul calcul, partagé par le Budget et le Résumé (les chiffres sont donc identiques).
import { useMemo } from 'react'
import { useHorizon } from '../../lib/store'
import {
  agregerHorsCapital, depensesAVenir, epargnesPrevues, listeEpargnes, syntheseMois, type LigneBudget,
} from '../../lib/finances'
import { moisCourant, useFin, useIndex } from './contexte'

export const somme = (ls: LigneBudget[], f: (l: LigneBudget) => number | null) => ls.reduce((t, l) => t + (f(l) ?? 0), 0)

/**
 * Synthèse du mois affiché et du filtre choisi.
 *  - Le capital des prêts est retiré de la ligne qui porte le prélèvement et compté en épargne, une fois.
 *  - Reste (vue Foyer seulement) = budget des dépenses − déjà dépensé − dépenses à venir − épargnes prévues restantes.
 *  - Épargné = lignes d'épargne + capital de prêt remboursé.
 */
export function useTuilesMois() {
  const { mois, filtre } = useFin()
  const transactions = useHorizon((s) => s.finTransactions)
  const lines = useHorizon((s) => s.finLines)
  const budgets = useHorizon((s) => s.finBudgets)
  const echeances = useHorizon((s) => s.finEcheances)
  const prets = useHorizon((s) => s.finLoans)
  const idx = useIndex()
  const foyer = filtre === 'foyer'

  const { agregat, capital: capitalParMois } = useMemo(
    () => agregerHorsCapital({ prets, echeances, transactions, idx, filtre, moisCourant: moisCourant() }),
    [prets, echeances, transactions, idx, filtre])
  const s = useMemo(() => syntheseMois({ mois, lines, budgets, agregat, filtre }), [mois, lines, budgets, agregat, filtre])
  const depenses = s.lignes.filter((l) => l.ligne?.kind !== 'epargne')
  const epargnes = s.lignes.filter((l) => l.ligne?.kind === 'epargne')
  const capitalMois = capitalParMois.get(mois)
  const aVenir = useMemo(() => depensesAVenir({ mois, moisCourant: moisCourant(), transactions, idx, filtre, lines, capital: capitalMois }),
    [mois, transactions, idx, filtre, lines, capitalMois])
  // Épargnes pas encore faites ce mois-ci (budget d'épargne restant, capital de prêt à débiter) : elles partent aussi.
  const epPrevues = useMemo(() => epargnesPrevues({ mois, moisCourant: moisCourant(), lignes: s.lignes, capital: capitalMois }),
    [mois, s.lignes, capitalMois])
  const listeEp = useMemo(() => listeEpargnes({ mois, moisCourant: moisCourant(), lignes: s.lignes, capital: capitalMois }),
    [mois, s.lignes, capitalMois])
  const capital = capitalMois?.fait ?? 0
  const budgetDepenses = somme(depenses, (l) => l.budget)
  const reelDepenses = somme(depenses, (l) => l.reel)
  const resteTuile = foyer ? budgetDepenses - reelDepenses - aVenir.total - epPrevues.total : null
  const epargne = somme(epargnes, (l) => l.reel) + capital
  return { s, depenses, epargnes, capital, capitalMois, aVenir, epPrevues, listeEp, budgetDepenses, reelDepenses, resteTuile, epargne }
}
