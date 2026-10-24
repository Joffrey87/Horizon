import type { FinAccount, FinTransaction } from './types'

/**
 * « Épargne utilisée » : l'argent sorti d'une épargne vers un compte courant dans le mois.
 * La base ne connaît pas toujours le compte d'origine d'un virement interne : on le retrouve
 * par sa contrepartie (sortie du même montant sur un compte d'épargne, ±2 jours) ou par une règle ci-dessous.
 */
export interface RegleEpargne {
  /** Motif sur le libellé de l'opération créditée. */
  libelle?: RegExp
  /** Ou identifiant exact d'opération. */
  id?: string
  /** Montant exact, si le libellé est ambigu. */
  montant?: number
  /** Nom du compte d'épargne d'origine à afficher. */
  origine: string
}

/** Règles faciles à compléter : la première qui correspond l'emporte. */
export const REGLES_EPARGNE: RegleEpargne[] = [
  { libelle: /virement interne telephone/i, origine: 'Épargne urgence' },
  { libelle: /depuis compte s\b/i, origine: 'Livret (Compte S)' },
]

/** Comptes jamais considérés comme destination « courante » (alimentations crypto, etc.). */
const EXCLUS = /crypto/i

export const estCompteEpargne = (a: FinAccount | undefined) =>
  !!a && (a.kind === 'epargne' || /^(epargne|épargne|livret)\b/i.test(a.name)) && !/avenir/i.test(a.name)

export interface VirementEpargne { id: string; date: string; libelle: string; origine: string; montant: number; compte: string }

const vers = (t: FinTransaction, dest: FinAccount, origine: string): VirementEpargne =>
  ({ id: t.id, date: t.date, libelle: t.label_local ?? t.label, origine, montant: t.amount, compte: dest.name })

const jours = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000

export function epargneUtilisee(
  { transactions, comptes, mois, regles = REGLES_EPARGNE }:
  { transactions: FinTransaction[]; comptes: FinAccount[]; mois: string; regles?: RegleEpargne[] },
): { virements: VirementEpargne[]; total: number; parOrigine: { origine: string; total: number; virements: VirementEpargne[] }[] } {
  const parId = new Map(comptes.map((c) => [c.id, c]))
  const virements: VirementEpargne[] = []
  const sansOrigine: { t: FinTransaction; dest: FinAccount }[] = []
  for (const t of transactions) {
    if (!t.internal || t.amount <= 0 || !t.date.startsWith(mois)) continue
    const dest = parId.get(t.account_id)
    if (!dest || dest.kind !== 'courant' || estCompteEpargne(dest) || EXCLUS.test(dest.name)) continue
    const regle = regles.find((r) => (r.id ? r.id === t.id : r.libelle?.test(t.label) ?? false) && (r.montant === undefined || r.montant === t.amount))
    if (regle) virements.push(vers(t, dest, regle.origine))
    else sansOrigine.push({ t, dest })
  }
  // Contrepartie : chaque sortie d'épargne va au crédit de même montant le plus proche (±2 jours), une seule fois.
  const pris = new Set<string>()
  for (const o of transactions) {
    const src = parId.get(o.account_id)
    if (o.amount >= 0 || !estCompteEpargne(src)) continue
    const c = sansOrigine.filter(({ t }) => !pris.has(t.id) && t.amount === -o.amount && jours(o.date, t.date) <= 2)
      .sort((x, y) => jours(o.date, x.t.date) - jours(o.date, y.t.date))[0]
    if (c) { pris.add(c.t.id); virements.push(vers(c.t, c.dest, src!.name)) }
  }
  virements.sort((a, b) => b.date.localeCompare(a.date) || b.montant - a.montant)
  const groupes = new Map<string, VirementEpargne[]>()
  for (const v of virements) groupes.set(v.origine, [...(groupes.get(v.origine) ?? []), v])
  const somme = (l: VirementEpargne[]) => l.reduce((a, v) => a + v.montant, 0)
  return {
    virements,
    total: somme(virements),
    parOrigine: [...groupes].map(([origine, l]) => ({ origine, total: somme(l), virements: l })).sort((a, b) => b.total - a.total),
  }
}
