// Fiches de prêt : chiffres dérivés du tableau d'amortissement (fin_echeances) et de la
// fiche (fin_loans), rapprochement avec les prélèvements réels. Fonctions pures.
import type { FinEcheance, FinLoan, FinTransaction } from './types'

const arrondi = (n: number) => Math.round(n * 100) / 100
const num = (v: unknown) => Number(v) || 0

export interface StatsPret {
  /** Échéances triées par date. */
  lignes: FinEcheance[]
  /** Indices des échéances déjà passées (date ≤ aujourd'hui). */
  nbPayees: number
  restant: number
  capitalRembourse: number
  interetsPayes: number
  interetsRestants: number
  assurancePayee: number
  assuranceRestante: number
  coutTotal: number          // intérêts + assurance + frais sur toute la durée
  progression: number        // 0..1, part du capital emprunté déjà remboursé
  prochaine: FinEcheance | null
  derniere: FinEcheance | null
  moisRestants: number
}

/** Chiffres clés d'un prêt à une date donnée ('yyyy-MM-dd'). */
export function statsPret(echeances: FinEcheance[], emprunte: number | null, aujourdhui: string): StatsPret {
  const lignes = [...echeances].sort((a, b) => a.date.localeCompare(b.date))
  const passees = lignes.filter((e) => e.date <= aujourdhui)
  const futures = lignes.filter((e) => e.date > aujourdhui)
  const somme = (l: FinEcheance[], f: (e: FinEcheance) => number) => arrondi(l.reduce((s, e) => s + f(e), 0))
  const derniereLigne = passees.at(-1)
  const capitalPaye = somme(passees, (e) => num(e.capital))
  const base = emprunte ?? (lignes.length ? somme(lignes, (e) => num(e.capital)) : 0)
  const restant = derniereLigne?.restant_du != null ? num(derniereLigne.restant_du) : arrondi(base - capitalPaye)
  const rembourse = arrondi(base - restant)
  const frais = somme(lignes, (e) => num(e.frais))
  return {
    lignes, nbPayees: passees.length, restant, capitalRembourse: rembourse,
    interetsPayes: somme(passees, (e) => num(e.interets)),
    interetsRestants: somme(futures, (e) => num(e.interets)),
    assurancePayee: somme(passees, (e) => num(e.assurance)),
    assuranceRestante: somme(futures, (e) => num(e.assurance)),
    coutTotal: arrondi(somme(lignes, (e) => num(e.interets)) + somme(lignes, (e) => num(e.assurance)) + frais),
    progression: base > 0 ? Math.min(1, Math.max(0, rembourse / base)) : 0,
    prochaine: futures[0] ?? null,
    derniere: lignes.at(-1) ?? null,
    moisRestants: futures.length,
  }
}

/** Montant total prélevé pour une échéance (capital + intérêts + assurance + frais). */
export const montantEcheance = (e: FinEcheance) => arrondi(num(e.capital) + num(e.interets) + num(e.assurance) + num(e.frais))

export interface PrelevementMois {
  mois: string               // 'yyyy-MM'
  echeance: FinEcheance
  attendu: number
  reel: number
  ecart: number              // réel − attendu
  operations: FinTransaction[]
  /** 'ok' : conforme ; 'ecart' : montant différent ; 'absent' : aucun prélèvement trouvé. */
  etat: 'ok' | 'ecart' | 'absent'
}

const TOLERANCE = 0.05
const JOURS_GRACE = 4

const joursEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

/** Motif de libellé → RegExp, ou null s'il est vide/invalide. */
export function motifPrelevement(motif: string | null): RegExp | null {
  if (!motif?.trim()) return null
  try { return new RegExp(motif, 'i') } catch { return null }
}

/**
 * Rapproche les échéances des prélèvements réels (opérations dont le libellé contient le
 * motif de la fiche). Les prélèvements en plusieurs fois (compte vide) sont additionnés
 * dans le mois. On ne juge que depuis le premier prélèvement retrouvé, et seulement
 * les échéances échues depuis plus de quelques jours.
 */
export function prelevementsReels(loan: Pick<FinLoan, 'debit_match' | 'debit_account_ids'>, echeances: FinEcheance[],
  transactions: FinTransaction[], aujourdhui: string): PrelevementMois[] {
  const re = motifPrelevement(loan.debit_match)
  if (!re) return []
  const comptes = loan.debit_account_ids ?? []
  const ops = transactions.filter((t) => t.amount < 0 && !t.pending
    && (comptes.length === 0 || comptes.includes(t.account_id))
    && re.test(t.label_local ?? t.label))
  if (!ops.length) return []
  const parMois = new Map<string, FinTransaction[]>()
  for (const t of ops) {
    const m = t.date.slice(0, 7)
    parMois.set(m, [...(parMois.get(m) ?? []), t])
  }
  const premier = [...parMois.keys()].sort()[0]!
  const lignes = [...echeances].sort((a, b) => a.date.localeCompare(b.date))
  const out: PrelevementMois[] = []
  for (const e of lignes) {
    const mois = e.date.slice(0, 7)
    if (mois < premier || joursEntre(e.date, aujourdhui) < JOURS_GRACE) continue
    const operations = (parMois.get(mois) ?? []).sort((a, b) => a.date.localeCompare(b.date))
    const attendu = montantEcheance(e)
    const reel = arrondi(-operations.reduce((s, t) => s + t.amount, 0))
    const ecart = arrondi(reel - attendu)
    out.push({
      mois, echeance: e, attendu, reel, ecart, operations,
      etat: operations.length === 0 ? 'absent' : Math.abs(ecart) <= TOLERANCE ? 'ok' : 'ecart',
    })
  }
  return out
}

/** Écart entre le capital restant dû du tableau et celui du compte (Finary ou saisi), en valeur absolue. */
export function ecartCapital(restantTableau: number, soldeCompte: number): number {
  return arrondi(Math.abs(soldeCompte) - restantTableau)
}

export const ORIGINES: Record<string, string> = {
  manual: 'saisi', finary: 'Finary', estimated: 'estimé', pdf: 'document',
}
