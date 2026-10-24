import { moisBudget } from './moisPaie'
import type { FinAccount, FinCategory, FinTransaction } from './types'
import { normaliserLibelle } from './finances'

/** Compte « Epargne Dépenses » : BoursoBank n° 00040660665 (external_id « cacc-0665 »), à défaut par son nom. */
export const estCompteEpargneDepenses = (a: FinAccount) => (a.external_id ?? '').endsWith('0665') || /^epargne( d[ée]penses?)?$/i.test(a.name.trim())
/** Compte CSL (compte sur livret, épargne vacances) : reconnu à son nom. */
export const estCompteCSL = (a: FinAccount) => /\bcsl\b|compte sur livret/i.test(a.name)

export interface Mouvement { id: string; date: string; libelle: string; montant: number }
const mv = (t: FinTransaction): Mouvement => ({ id: t.id, date: t.date, libelle: t.label_local ?? t.label, montant: Math.abs(t.amount) })
const somme = (l: Mouvement[]) => l.reduce((n, m) => n + m.montant, 0)
const nomCat = (t: FinTransaction, cats: Map<string, FinCategory>) => { const c = t.category_id ? cats.get(t.category_id) : undefined; return c ? normaliserLibelle(c.name) : '' }

/**
 * Épargne Dépenses du mois : virements vers le compte Epargne Dépenses (débits classés « Epargne dépenses »,
 * ou libellé « dépenses annualisées / épargne dépense(s) … » : 200 € annuelles, 110 € copro Reims), et à défaut le crédit sur ce compte.
 */
export function epargneDepenses({ transactions, comptes, categories, mois }: { transactions: FinTransaction[]; comptes: FinAccount[]; categories: FinCategory[]; mois: string }) {
  const parId = new Map(comptes.map((c) => [c.id, c]))
  const cats = new Map(categories.map((c) => [c.id, c]))
  const compte = comptes.find(estCompteEpargneDepenses)
  const debits = transactions.filter((t) => moisBudget(t.date) === mois && t.amount < 0 && parId.get(t.account_id)?.kind === 'courant' && !estCompteEpargneDepenses(parId.get(t.account_id)!)
    && (nomCat(t, cats) === 'epargne depenses' || /depenses annualis|epargne d[ée]penses?\b/i.test(normaliserLibelle(t.label))))
  const credits = compte ? transactions.filter((t) => t.account_id === compte.id && moisBudget(t.date) === mois && t.amount > 0
    && !debits.some((d) => -d.amount === t.amount && Math.abs(Date.parse(d.date) - Date.parse(t.date)) <= 2 * 864e5)) : []
  const virements = [...debits, ...credits].map(mv).sort((a, b) => b.date.localeCompare(a.date))
  return { virements, idsDebits: new Set(debits.map((t) => t.id)), totalDebits: debits.reduce((n, t) => n - t.amount, 0), total: somme(virements), solde: compte ? Number(compte.balance ?? 0) : null, compte: compte?.name ?? null }
}

/**
 * Épargne Vacances : versé vers le CSL (catégorie ou libellé « Épargne Vacances »), moins les retours du CSL
 * vers un compte courant (crédit interne au libellé « Vacances », ou débit sur le compte CSL).
 */
export function epargneVacances({ transactions, comptes, categories, mois }: { transactions: FinTransaction[]; comptes: FinAccount[]; categories: FinCategory[]; mois: string }) {
  const parId = new Map(comptes.map((c) => [c.id, c]))
  const cats = new Map(categories.map((c) => [c.id, c]))
  const duMois = transactions.filter((t) => moisBudget(t.date) === mois)
  const verse = duMois.filter((t) => t.amount < 0 && !estCompteCSL(parId.get(t.account_id) ?? ({ name: '' } as FinAccount))
    && (nomCat(t, cats) === 'epargne vacances' || /epargne vacances/.test(normaliserLibelle(t.label)))).map(mv)
  const csl = comptes.find(estCompteCSL)
  const retours = duMois.filter((t) => t.amount > 0 && t.internal && parId.get(t.account_id)?.kind === 'courant'
    && (/\bvacances\b|\bcsl\b/.test(normaliserLibelle(t.label)))).map(mv)
  const retoursCSL = csl && !retours.length ? duMois.filter((t) => t.account_id === csl.id && t.amount < 0).map(mv) : []
  const r = [...retours, ...retoursCSL]
  return { verse, retours: r, total: somme(verse) - somme(r), solde: csl ? Number(csl.balance ?? 0) : null }
}
