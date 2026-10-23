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

/**
 * Les sept budgets de la page, dans l'ordre d'affichage, avec les noms acceptés pour la ligne du foyer et la couleur
 * (RVB) de la tuile : ambre, vert, violet, sable, taupe, olive, rose — jamais de bleu. Les Dons sont séparés du reste par un espace.
 */
export const BUDGETS_RESUME: { cle: string; titre: string; noms: string[]; rvb: [number, number, number]; separe?: boolean }[] = [
  { cle: 'courses', titre: 'Courses', noms: ['courses', 'course'], rvb: [245, 158, 11] },
  { cle: 'amenagement', titre: 'Aménagement', noms: ['amenagement', 'amenagements'], rvb: [22, 163, 74] },
  { cle: 'vacances', titre: 'Vacances', noms: ['vacances', 'vacance'], rvb: [139, 92, 246] },
  { cle: 'courantes', titre: 'Dépenses courantes', noms: ['depenses courantes', 'depense courante', 'courantes'], rvb: [190, 170, 140] },
  { cle: 'exceptionnelles', titre: 'Dépenses exceptionnelles', noms: ['depenses exceptionnelles', 'depense exceptionnelle', 'exceptionnelles'], rvb: [150, 125, 105] },
  // Frais fixe : le réel de la ligne est déjà hors capital des prêts (agregerHorsCapital, compté en épargne).
  { cle: 'fraisfixe', titre: 'Frais fixe', noms: ['frais fixe', 'frais fixes'], rvb: [132, 140, 90] },
  { cle: 'dons', titre: 'Dons', noms: ['dons', 'don'], rvb: [236, 72, 153], separe: true },
]

/** Couleur de la tuile avec transparence (fond, bordure). */
export const rgba = (rvb: readonly [number, number, number], a: number) => `rgba(${rvb[0]},${rvb[1]},${rvb[2]},${a})`
/** Couleur de l'anneau et de l'icône : celle de la tuile, éclaircie (lisible sur le fond teinté). */
export const eclaircie = (rvb: readonly [number, number, number], k = 0.27) =>
  `rgb(${rvb.map((v) => Math.round(v + (255 - v) * k)).join(',')})`

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
  /** Couleur de la tuile (RVB) et tuile séparée du groupe (Dons). */
  rvb: [number, number, number]
  separe: boolean
  /** Id de la ligne de budget du foyer (pour changer son budget du mois) ; null si introuvable. */
  ligneId: string | null
  /** Ligne introuvable dans le budget du foyer. */
  absente: boolean
  budget: number | null
  depense: number
  /** Budget − dépensé (négatif : dépassé) ; null sans budget. */
  restant: number | null
  /** Part consommée (0,93 = 93 % du budget) ; null sans budget. Sert au tracé de l'anneau, jamais affichée. */
  ratio: number | null
  ton: TonAnneau
}

/** Données d'une tuile : le budget n'existe que dans la vue Foyer (voir syntheseMois). */
export function tuileBudget(def: { cle: string; titre: string; rvb?: [number, number, number]; separe?: boolean }, ligne: LigneBudget | undefined): TuileBudget {
  const { rvb = [190, 170, 140] as [number, number, number], separe = false, ...id } = def
  const base = { ...id, rvb, separe }
  if (!ligne) return { ...base, ligneId: null, absente: true, budget: null, depense: 0, restant: null, ratio: null, ton: 'neutre' }
  const budget = ligne.budget !== null && ligne.budget > 0 ? ligne.budget : null
  const ratio = budget !== null ? Math.max(0, ligne.reel) / budget : null
  return {
    ...base, ligneId: ligne.ligne?.id ?? null, absente: false, budget, depense: ligne.reel,
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
