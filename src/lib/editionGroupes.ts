// Édition des regroupements depuis le détail du Résumé : renommer un commerçant
// (fin_merchant_alias), fusionner deux groupes et séparer un groupe (fin_groups).
import { cleGroupe, type GroupeIntitules } from './finances'
import type { FinGroup, FinMerchantAlias } from './types'

/** Toutes les clés d'un groupe : celles vues ce mois-ci, plus, pour un groupe manuel,
 *  toutes les règles du même nom (ses commerçants absents ce mois-ci). */
export function clesDuGroupe(g: Pick<GroupeIntitules, 'cles' | 'manuel' | 'nom'>, regles: Pick<FinGroup, 'pattern' | 'name'>[]): string[] {
  const cles = new Set(g.cles)
  if (g.manuel) for (const r of regles) if (r.name.trim() === g.nom) cles.add(r.pattern)
  return [...cles]
}

export type Ecriture =
  | { op: 'insert'; values: Record<string, string> }
  | { op: 'update'; id: string; values: Record<string, string> }
  | { op: 'remove'; id: string }

/** Ranger les clés `cles` sous le nom `nom` : une règle fin_groups par clé. */
export function planRegrouper(cles: string[], nom: string, regles: Pick<FinGroup, 'id' | 'pattern' | 'name'>[]): Ecriture[] {
  const v = nom.trim()
  if (!v) return []
  return [...new Set(cles)].flatMap((cle): Ecriture[] => {
    const r = regles.find((x) => x.pattern === cle)
    if (!r) return [{ op: 'insert', values: { pattern: cle, name: v } }]
    return r.name === v ? [] : [{ op: 'update', id: r.id, values: { name: v } }]
  })
}

/** Séparer : retirer les règles des clés du groupe. */
export function planSeparer(cles: string[], regles: Pick<FinGroup, 'id' | 'pattern'>[]): Ecriture[] {
  return regles.filter((r) => cles.includes(r.pattern)).map((r) => ({ op: 'remove', id: r.id }))
}

/** Renommer un commerçant : l'intitulé vaut pour toutes les opérations de ses clés
 *  (vide = on retire le renommage). */
export function planAlias(cles: string[], label: string, alias: Pick<FinMerchantAlias, 'id' | 'pattern' | 'label'>[]): Ecriture[] {
  const v = label.trim()
  return [...new Set(cles)].flatMap((cle): Ecriture[] => {
    const a = alias.find((x) => x.pattern === cle)
    if (!v) return a ? [{ op: 'remove', id: a.id }] : []
    if (!a) return [{ op: 'insert', values: { pattern: cle, label: v } }]
    return a.label === v ? [] : [{ op: 'update', id: a.id, values: { label: v } }]
  })
}

/** Clé de commerçant d'une opération (celle que lit la reconnaissance des intitulés). */
export const cleCommercant = (label: string) => cleGroupe(label).cle
