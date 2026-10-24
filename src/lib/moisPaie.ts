// Mois budgétaire « de paie à paie » : un mois commence le jour où la paie (DDFIP … REMUNERATION, créditée sur le Joint)
// arrive et finit la veille de la paie suivante. Affichage seulement : les dates des opérations ne changent pas.
import type { FinTransaction } from './types'

/** La paie : crédit « REMUNERATION » de la DDFIP. */
export const estPaie = (t: Pick<FinTransaction, 'label' | 'amount'>) => Number(t.amount) > 0 && /ddfip.*remuneration|remuneration du \d\d\/\d{4}/i.test(t.label)

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
