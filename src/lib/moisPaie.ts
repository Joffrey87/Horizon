// Mois budgétaire « de paie à paie » : un mois commence le jour où la paie (DDFIP … REMUNERATION, créditée sur le Joint)
// arrive et finit la veille de la paie suivante. Affichage seulement : les dates des opérations ne changent pas.
import type { FinTransaction } from './types'

/** Montant minimal d'un crédit « DDFIP DES YVELINES » pour être la paie (écarte remboursements d'impôt et petites régularisations). */
export const SEUIL_PAIE = 6000

/** La paie : crédit « REMUNERATION » de la DDFIP, ou crédit « DDFIP DES YVELINES » d'au moins SEUIL_PAIE
 *  (le libellé de la banque arrive d'abord sans le détail « REMUNERATION DU … »). */
export const estPaie = (t: Pick<FinTransaction, 'label' | 'amount'>) => {
  const montant = Number(t.amount)
  if (!(montant > 0)) return false
  return /ddfip.*remuneration|remuneration du \d\d\/\d{4}/i.test(t.label) || (montant >= SEUIL_PAIE && /ddfip des yvelines/i.test(t.label))
}

let paies: string[] = []
let source: unknown = null

/** Dates des paies (triées). Recalculées seulement quand la liste d'opérations change. */
export function installerPaies(transactions: Pick<FinTransaction, 'label' | 'amount' | 'date'>[]) {
  if (transactions === source) return
  source = transactions
  paies = [...new Set(transactions.filter(estPaie).map((t) => t.date.slice(0, 10)))].sort()
}
export const datesPaies = () => paies

const suivant = (m: string) => { const [a, mm] = m.split('-').map(Number) as [number, number]; return mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, '0')}` }
/** Mois ouvert par une paie : celle de fin de mois (jour ≥ 15) ouvre le mois suivant, sinon le sien. */
export const moisOuvertPar = (date: string) => Number(date.slice(8, 10)) >= 15 ? suivant(date.slice(0, 7)) : date.slice(0, 7)

/**
 * Mois budgétaire d'une date : celui ouvert par la dernière paie reçue à cette date ; sans paie connue
 * (avant la première, ou paie du mois pas encore arrivée), le mois civil. Jamais avant le mois civil.
 */
export function moisBudget(date: string, liste: readonly string[] = paies): string {
  const civil = date.slice(0, 7)
  const d = date.slice(0, 10)
  let derniere: string | undefined
  for (const p of liste) { if (p <= d) derniere = p; else break }
  if (!derniere) return civil
  const m = moisOuvertPar(derniere)
  return m > civil ? m : civil
}

/** Mois d'une opération : celui que Joffrey lui a affecté à la main (`mois_affecte`), sinon le mois de paie de sa date. */
export const moisAffecte = (t: { date: string; mois_affecte?: string | null }): string => t.mois_affecte || moisBudget(t.date)
