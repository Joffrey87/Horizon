// Sous-onglet Finances « Résumé » : règles pures (testées dans resume.test.ts).
// Rien ici ne touche aux écrans : couleurs d'anneau, recherche des lignes de budget par nom,
// données d'une tuile de budget. Reste et Épargné viennent du Budget (views/finances/tuilesMois.ts).
import type { FinLine } from './types'
import { normaliserLibelle, type LigneBudget } from './finances'

/** Ton d'un anneau : vert sous 75 %, ambre de 75 à 100 % (100 inclus), rouge-orangé au-delà. Jamais de bleu. */
export type TonAnneau = 'ok' | 'attention' | 'depasse' | 'neutre'

export const SEUIL_ATTENTION = 0.75
export const SEUIL_DEPASSE = 1

export const COULEURS_ANNEAU: Record<TonAnneau, string> = {
  ok: '#86c36b',
  attention: '#f59e0b',
  depasse: '#ef5a36',
  neutre: '#b8b0a2',
}

/** Ton selon la part du budget consommée (0,5 = 50 %). Sans budget (null) : neutre. */
export function tonAnneau(ratio: number | null): TonAnneau {
  if (ratio === null || !Number.isFinite(ratio)) return 'neutre'
  if (ratio > SEUIL_DEPASSE) return 'depasse'
  if (ratio >= SEUIL_ATTENTION) return 'attention'
  return 'ok'
}

/** Les six budgets de la page, dans l'ordre d'affichage, avec les noms acceptés pour la ligne du foyer. */
export const BUDGETS_RESUME: { cle: string; titre: string; noms: string[] }[] = [
  { cle: 'courses', titre: 'Courses', noms: ['courses', 'course'] },
  { cle: 'amenagement', titre: 'Aménagement', noms: ['amenagement', 'amenagements'] },
  { cle: 'vacances', titre: 'Vacances', noms: ['vacances', 'vacance'] },
  { cle: 'dons', titre: 'Dons', noms: ['dons', 'don'] },
  { cle: 'courantes', titre: 'Dépenses courantes', noms: ['depenses courantes', 'depense courante', 'courantes'] },
  { cle: 'exceptionnelles', titre: 'Dépenses exceptionnelles', noms: ['depenses exceptionnelles', 'depense exceptionnelle', 'exceptionnelles'] },
]

const mots = (s: string) => normaliserLibelle(s).split(/[^a-z0-9]+/).filter(Boolean)

/**
 * Ligne de dépenses reconnue à son nom, sans tenir compte de la casse ni des accents.
 * D'abord le nom exact (ou un synonyme), sinon une ligne dont les mots contiennent ceux du nom
 * (« Dépenses courantes (hors loyer) »). Les lignes d'épargne sont ignorées. Absente : undefined.
 */
export function ligneParNom<T extends Pick<FinLine, 'name' | 'kind'>>(lignes: T[], noms: string[]): T | undefined {
  const depenses = lignes.filter((l) => l.kind !== 'epargne')
  for (const nom of noms) {
    const exact = depenses.find((l) => normaliserLibelle(l.name) === nom)
    if (exact) return exact
  }
  for (const nom of noms) {
    const voulus = mots(nom)
    const proche = depenses.find((l) => { const m = mots(l.name); return voulus.every((v) => m.includes(v)) })
    if (proche) return proche
  }
  return undefined
}

export interface TuileBudget {
  cle: string
  titre: string
  /** Id de la ligne de budget du foyer (pour changer son budget du mois) ; null si introuvable. */
  ligneId: string | null
  /** Ligne introuvable dans le budget du foyer. */
  absente: boolean
  budget: number | null
  depense: number
  /** Budget − dépensé (négatif : dépassé) ; null sans budget. */
  restant: number | null
  /** Part consommée, 0,93 = 93 % ; null sans budget. */
  ratio: number | null
  ton: TonAnneau
}

/** Données d'une tuile : le budget n'existe que dans la vue Foyer (voir syntheseMois). */
export function tuileBudget(def: { cle: string; titre: string }, ligne: LigneBudget | undefined): TuileBudget {
  if (!ligne) return { ...def, ligneId: null, absente: true, budget: null, depense: 0, restant: null, ratio: null, ton: 'neutre' }
  const budget = ligne.budget !== null && ligne.budget > 0 ? ligne.budget : null
  const ratio = budget !== null ? Math.max(0, ligne.reel) / budget : null
  return {
    ...def, ligneId: ligne.ligne?.id ?? null, absente: false, budget, depense: ligne.reel,
    restant: budget !== null ? budget - ligne.reel : null, ratio, ton: tonAnneau(ratio),
  }
}

/** Les six tuiles du Résumé, retrouvées par nom parmi les lignes du mois. Une ligne absente donne une tuile « absente ». */
export function tuilesBudgets(lignes: LigneBudget[]): TuileBudget[] {
  const reelles = lignes.filter((l): l is LigneBudget & { ligne: FinLine } => l.ligne !== null)
  return BUDGETS_RESUME.map((def) => {
    const l = ligneParNom(reelles.map((x) => ({ ...x.ligne, lb: x })), def.noms)
    return tuileBudget(def, l?.lb)
  })
}
