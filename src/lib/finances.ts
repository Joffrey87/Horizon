import { moisBudget } from './moisPaie'
// ================================================================
// Finances — règles pures (sans réseau) : budget du mois, bilan,
// patrimoine, allocation, provisions. Testées dans finances.test.ts.
//
// Une opération compte dans le budget si son compte est « du budget », si
// elle n'est pas écartée, et selon le rôle de sa catégorie :
//   - revenu       → « Entrées » du mois ;
//   - hors_budget  → ignorée (virements) ;
//   - dépense      → la ligne de sa catégorie (à défaut celle du parent),
//                    ou « Non classé » — rien ne disparaît en silence.
// Un virement interne n'est compté que s'il alimente une ligne d'épargne
// (ex. virement vers le PEA rangé en « Investissements »).
// ================================================================
import type {
  FinAccount, FinAccountKind, FinAssetClass, FinBudget, FinCategory, FinHolding, FinLine, FinOwner, FinPlanned,
  FinTarget, FinTransaction, FinLabel, FinGroup, FinMerchantAlias, FinEcheance, FinLoan,
} from './types'
import { motifPrelevement } from './prets'
import { todayIso } from './logic'

export type FiltreTitulaire = 'foyer' | FinOwner

export const TITULAIRES: Record<FinOwner, string> = { commun: 'Commun', joffrey: 'Joffrey', honorine: 'Honorine' }

export const GENRES: Record<FinAccountKind, string> = {
  courant: 'Comptes courants', epargne: 'Épargne', investissement: 'Investissements', crypto: 'Crypto',
  immobilier: 'Immobilier', metaux: 'Métaux précieux', pret: 'Prêts', autre: 'Autres',
}

/** Classes d'actifs : libellé et couleur. Palette des domaines (validée sur le
 *  fond sombre) + orange pour l'argent ; liquidités et « autre » en neutre.
 *  La couleur n'est jamais seule : chaque barre porte le nom de sa classe. */
export const CLASSES: Record<FinAssetClass, { label: string; couleur: string }> = {
  actions: { label: 'Actions', couleur: 'var(--color-dom-5)' },
  obligations: { label: 'Obligations', couleur: 'var(--color-dom-2)' },
  or: { label: 'Or', couleur: 'var(--color-dom-1)' },
  energie: { label: 'Énergie', couleur: 'var(--color-dom-3)' },
  crypto: { label: 'Crypto', couleur: 'var(--color-dom-4)' },
  immobilier: { label: 'Immobilier', couleur: 'var(--color-dom-6)' },
  argent: { label: 'Argent', couleur: '#d95926' },
  liquidites: { label: 'Liquidités', couleur: 'var(--color-ink-3)' },
  autre: { label: 'Autre', couleur: '#5f574b' },
}

/** Clé de la pseudo-ligne des dépenses sans ligne de budget. */
export const NON_CLASSE = '__non_classe'

// ---------- Mois ----------

/** 'yyyy-MM' d'une date ISO. */
export const moisDe = (date: string) => date.slice(0, 7)

/** Décale un mois 'yyyy-MM' de n mois (n peut être négatif). */
export function decaleMois(mois: string, n: number): string {
  const [a, m] = mois.split('-').map(Number)
  const t = (a ?? 0) * 12 + ((m ?? 1) - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

/** Nombre de mois de `de` à `a` (positif si `a` est plus tard). */
export function ecartMois(de: string, a: string): number {
  const [a1, m1] = de.split('-').map(Number)
  const [a2, m2] = a.split('-').map(Number)
  return ((a2 ?? 0) - (a1 ?? 0)) * 12 + ((m2 ?? 1) - (m1 ?? 1))
}

const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const NOMS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/** « octobre 2026 », ou « oct. 26 » en court. */
export function libelleMois(mois: string, court = false): string {
  const [a, m] = mois.split('-').map(Number)
  const i = (m ?? 1) - 1
  return court ? `${NOMS_COURTS[i]} ${String(a).slice(2)}` : `${NOMS_MOIS[i]} ${a}`
}

// ---------- Montants ----------

const FORMAT_0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const FORMAT_2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** « 1 234 € » (ou au centime). Les espaces insécables évitent les coupures. */
export function euros(n: number, centimes = false): string {
  const v = Object.is(Math.round(n), -0) ? 0 : n
  return (centimes ? FORMAT_2 : FORMAT_0).format(v)
}

/** « +12 % » / « −3 % ». */
export function pourcent(n: number, signe = false): string {
  const r = Math.round(n)
  return `${signe && r > 0 ? '+' : ''}${r.toLocaleString('fr-FR')} %`.replace('-', '−')
}

// ---------- Classement des opérations ----------

export interface IndexFinances {
  comptes: Map<string, FinAccount>
  categories: Map<string, FinCategory>
  lignes: Map<string, FinLine>
}

export function indexer(accounts: FinAccount[], categories: FinCategory[], lines: FinLine[]): IndexFinances {
  return {
    comptes: new Map(accounts.map((a) => [a.id, a])),
    categories: new Map(categories.map((c) => [c.id, c])),
    lignes: new Map(lines.map((l) => [l.id, l])),
  }
}

/** Catégorie effective d'une opération : suit les fusions (`merged_into`) jusqu'à la cible. */
export function categorieEffective(id: string | null, idx: IndexFinances): FinCategory | undefined {
  let cat = id ? idx.categories.get(id) : undefined
  for (let garde = 0; cat?.merged_into && garde < 10; garde++) {
    const cible = idx.categories.get(cat.merged_into)
    if (!cible) break
    cat = cible
  }
  return cat
}

/** Ligne de budget d'une catégorie : la sienne, à défaut celle de son parent. */
export function ligneDeCategorie(cat: FinCategory | undefined, idx: IndexFinances): string | null {
  if (!cat) return null
  if (cat.line_id) return cat.line_id
  const parent = cat.parent_id ? idx.categories.get(cat.parent_id) : undefined
  return parent?.line_id ?? null
}

/** Choix de catégorie (panneau d'édition) : catégories visibles, non fusionnées, groupées par ligne de budget
 *  dans l'ordre des lignes ; celles sans ligne à la fin (ligne null). Noms triés, « Parent › Enfant » pour une sous-catégorie. */
export function categoriesParLigne(idx: IndexFinances): { ligne: FinLine | null; categories: { id: string; nom: string; court: string; parent: string | null }[] }[] {
  const par = new Map<string | null, { id: string; nom: string; court: string; parent: string | null }[]>()
  for (const c of idx.categories.values()) {
    if (c.hidden || c.merged_into) continue
    const parent = c.parent_id ? idx.categories.get(c.parent_id) : undefined
    if (parent?.hidden) continue
    const l = ligneDeCategorie(c, idx)
    const cle = l && idx.lignes.has(l) ? l : null
    par.set(cle, [...(par.get(cle) ?? []), { id: c.id, nom: parent ? `${parent.name} › ${c.name}` : c.name, court: c.name, parent: parent?.name ?? null }])
  }
  const lignes = lignesTriees([...idx.lignes.values()]).filter((l) => par.has(l.id))
  return [...lignes.map((l) => l.id), ...(par.has(null) ? [null] : [])].map((k) => ({
    ligne: k ? idx.lignes.get(k)! : null,
    categories: par.get(k)!.sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
  }))
}

export type Classement =
  | { type: 'ligne'; ligne: string }
  | { type: 'non_classe' }
  | { type: 'revenu' }
  | { type: 'ignoree'; raison: 'compte' | 'exclue' | 'interne' | 'hors_budget' }

export function classer(tx: FinTransaction, idx: IndexFinances): Classement {
  const compte = idx.comptes.get(tx.account_id)
  if (!compte || !compte.in_budget) return { type: 'ignoree', raison: 'compte' }
  if (tx.excluded) return { type: 'ignoree', raison: 'exclue' }
  const cat = categorieEffective(tx.category_id, idx)
  const ligneId = ligneDeCategorie(cat, idx)
  const ligne = ligneId ? idx.lignes.get(ligneId) : undefined
  if (tx.internal && ligne?.kind !== 'epargne') return { type: 'ignoree', raison: 'interne' }
  // Le rôle se règle sur la catégorie principale : une sous-catégorie le suit.
  const parent = cat?.parent_id ? idx.categories.get(cat.parent_id) : undefined
  const role = parent?.role ?? cat?.role ?? 'depense'
  if (role === 'hors_budget') return { type: 'ignoree', raison: 'hors_budget' }
  if (role === 'revenu') return { type: 'revenu' }
  if (!ligne) return { type: 'non_classe' }
  return { type: 'ligne', ligne: ligne.id }
}

export function titulaireDe(tx: FinTransaction, idx: IndexFinances): FinOwner {
  return tx.owner ?? idx.comptes.get(tx.account_id)?.owner ?? 'joffrey'
}

export const correspond = (filtre: FiltreTitulaire, titulaire: FinOwner) => filtre === 'foyer' || filtre === titulaire

// ---------- Agrégat mensuel ----------

/** Par mois : dépensé par ligne (sorties positives, remboursements déduits) et entrées. */
export type Agregat = Map<string, { lignes: Map<string, number>; entrees: number }>

export function agreger(transactions: FinTransaction[], idx: IndexFinances, filtre: FiltreTitulaire): Agregat {
  const agg: Agregat = new Map()
  for (const tx of transactions) {
    if (!correspond(filtre, titulaireDe(tx, idx))) continue
    const c = classer(tx, idx)
    if (c.type === 'ignoree') continue
    const m = moisBudget(tx.date)
    let mois = agg.get(m)
    if (!mois) { mois = { lignes: new Map(), entrees: 0 }; agg.set(m, mois) }
    const montant = Number(tx.amount)
    if (c.type === 'revenu') { mois.entrees += montant; continue }
    const cle = c.type === 'ligne' ? c.ligne : NON_CLASSE
    mois.lignes.set(cle, (mois.lignes.get(cle) ?? 0) - montant)
  }
  return agg
}

/**
 * Remboursements rattachés : une opération qui rembourse une dépense (`rembourse_de`) compte à la date, dans la
 * catégorie et chez le titulaire de cette dépense, pour que son mois et sa catégorie baissent d'autant. La liste
 * d'origine (Opérations, recherche) n'est pas touchée : seuls les calculs de budget passent par ici.
 */
export function appliquerRemboursements(transactions: FinTransaction[]): FinTransaction[] {
  if (!transactions.some((t) => t.rembourse_de)) return transactions
  const parId = new Map(transactions.map((t) => [t.id, t]))
  return transactions.map((t) => {
    const origine = t.rembourse_de ? parId.get(t.rembourse_de) : undefined
    return origine ? { ...t, date: origine.date, category_id: origine.category_id, owner: origine.owner } : t
  })
}

/**
 * Remboursements REÇUS dans le mois (date bancaire, mois de paie) : opérations rattachées à une dépense, rangées
 * dans « Remboursements », ou en entrée sur une ligne de dépense (mutuelle sur Santé…). Information seule :
 * l'effet est déjà dans chaque catégorie, rien n'est compté deux fois.
 */
export function remboursementsRecus(opts: {
  mois: string; transactions: FinTransaction[]; idx: IndexFinances; filtre: FiltreTitulaire
}): { total: number; operations: FinTransaction[] } {
  const { mois, transactions, idx, filtre } = opts
  const effectives = new Map(appliquerRemboursements(transactions).map((t) => [t.id, t]))
  const operations = transactions.filter((t) => {
    if (Number(t.amount) <= 0 || moisBudget(t.date) !== mois) return false
    if (!correspond(filtre, titulaireDe(t, idx))) return false
    const vue = effectives.get(t.id) ?? t
    if (classer(vue, idx).type === 'ignoree') return false
    if (t.rembourse_de) return true
    const nom = categorieEffective(t.category_id, idx)?.name ?? ''
    if (normaliserLibelle(nom).startsWith('remboursement')) return true
    return classer(t, idx).type === 'ligne'
  }).sort((a, b) => (a.date < b.date ? 1 : -1))
  return { total: operations.reduce((s, t) => s + Number(t.amount), 0), operations }
}

const reelDe = (agg: Agregat, mois: string, cle: string) => agg.get(mois)?.lignes.get(cle) ?? 0

// ---------- Budgets ----------

/** Budget d'une ligne pour un mois : le dernier fixé à ce mois ou avant. */
export function budgetDe(ligneId: string, mois: string, budgets: FinBudget[]): number | null {
  let trouve: FinBudget | null = null
  for (const b of budgets) {
    if (b.kind !== 'budget' || b.line_id !== ligneId || moisDe(b.month) > mois) continue
    if (!trouve || b.month > trouve.month) trouve = b
  }
  return trouve ? Number(trouve.amount) : null
}

/**
 * Opérations à écrire pour changer le budget d'une ligne POUR UN SEUL MOIS. Un budget vaut
 * « à partir de » son mois (budgetDe) : écrire seulement le mois M changerait aussi tous les suivants.
 * On fige donc d'abord le mois suivant à la valeur qu'il avait (0 = « sans budget » si aucun budget
 * ne s'appliquait), sauf s'il a déjà son propre budget ; puis on écrit le mois M (null = effacer
 * la surcharge : le mois reprend le budget par défaut). Les autres mois ne bougent pas.
 */
export function ecrituresBudgetMois(opts: {
  ligneId: string; mois: string; montant: number | null; budgets: FinBudget[]
}): { mois: string; montant: number | null }[] {
  const suivant = decaleMois(opts.mois, 1)
  const ecritures: { mois: string; montant: number | null }[] = []
  const aSonBudget = opts.budgets.some((b) => b.kind === 'budget' && b.line_id === opts.ligneId && moisDe(b.month) === suivant)
  if (!aSonBudget) ecritures.push({ mois: suivant, montant: budgetDe(opts.ligneId, suivant, opts.budgets) ?? 0 })
  ecritures.push({ mois: opts.mois, montant: opts.montant })
  return ecritures
}

/**
 * Le budget d'un mois a-t-il été ajusté pour ce mois seulement ? Oui s'il diffère à la fois du mois
 * précédent ET du mois suivant (un changement durable, lui, se retrouve le mois d'après ; et après un
 * ajustement d'un mois, le suivant est figé à l'ancienne valeur — voir ecrituresBudgetMois).
 * `base` = le budget habituel (celui du mois précédent), null si aucun.
 */
export function budgetAjuste(ligneId: string, mois: string, budgets: FinBudget[]): { ajuste: boolean; base: number | null } {
  const v = (m: string) => budgetDe(ligneId, m, budgets) ?? 0
  const courant = v(mois)
  const avant = v(decaleMois(mois, -1))
  const apres = v(decaleMois(mois, 1))
  const ajuste = budgets.some((b) => b.kind === 'budget' && b.line_id === ligneId && moisDe(b.month) === mois)
    && Math.abs(courant - avant) > 0.005 && Math.abs(courant - apres) > 0.005
  return { ajuste, base: avant > 0 ? avant : null }
}

/**
 * Fond d'une ligne de budget. Couleurs imposées par nom (choix de Joffrey) : Aménagement vert, Dépenses
 * courantes sable, Dépenses exceptionnelles taupe. Pour les autres, la couleur enregistrée ; l'ancien
 * « bleu roi » (plus de bleu dans le design) s'affiche en vert.
 */
export function fondLigne(ligne: Pick<FinLine, 'name' | 'color'> | null | undefined): string | null {
  if (!ligne) return null
  const nom = normaliserLibelle(ligne.name)
  if (/^amenagements?$/.test(nom)) return 'rgba(22, 163, 74, 0.20)'
  if (/^depenses courantes$/.test(nom)) return 'rgba(190, 170, 140, 0.22)'
  if (/^depenses exceptionnelles$/.test(nom)) return 'rgba(150, 125, 105, 0.26)'
  if (ligne.color && /65,\s*105,\s*225/.test(ligne.color)) return 'rgba(22, 163, 74, 0.20)'
  return ligne.color ?? null
}

/**
 * Une ligne d'épargne compte comme épargne ici, sauf « Épargne vacances » : c'est de l'argent mis de côté
 * pour dépenser plus tard dans l'année, pas de l'épargne (ni dans l'Épargné, ni dans le Reste).
 */
export function estEpargneComptee<T extends Pick<FinLine, 'name' | 'kind'>>(ligne: T | null | undefined): ligne is T {
  return ligne?.kind === 'epargne' && !/\bvacances?\b/.test(normaliserLibelle(ligne.name))
}

/** Prévisionnel d'une ligne pour un mois : celui saisi pour ce mois, sinon le budget. */
export function previsionDe(ligneId: string, mois: string, budgets: FinBudget[]): { montant: number | null; saisi: boolean } {
  const p = budgets.find((b) => b.kind === 'prevision' && b.line_id === ligneId && moisDe(b.month) === mois)
  if (p) return { montant: Number(p.amount), saisi: true }
  return { montant: budgetDe(ligneId, mois, budgets), saisi: false }
}

/** Lignes dans l'ordre d'affichage : dépenses puis épargne. */
export function lignesTriees(lines: FinLine[]): FinLine[] {
  return [...lines].sort((a, b) => (a.kind === b.kind ? a.sort_order - b.sort_order : a.kind === 'depense' ? -1 : 1))
}

export interface LigneBudget {
  cle: string                 // id de la ligne, ou NON_CLASSE
  ligne: FinLine | null
  budget: number | null       // null hors vue « Foyer » (les budgets sont ceux du foyer)
  reel: number
  precedent: number
  moyenne3: number           // moyenne des 3 mois précédents
  prevision: number | null
  previsionSaisie: boolean
}

export interface SyntheseMois {
  mois: string
  lignes: LigneBudget[]
  entrees: number
  total: { budget: number | null; reel: number; precedent: number; moyenne3: number; prevision: number | null }
}

/** Le tableau de bord du mois : une ligne par ligne de budget (+ « Non classé » s'il y a lieu). */
export function syntheseMois(opts: {
  mois: string; lines: FinLine[]; budgets: FinBudget[]; agregat: Agregat; filtre: FiltreTitulaire
}): SyntheseMois {
  const { mois, budgets, agregat, filtre } = opts
  const suivant = decaleMois(mois, 1)
  const precedents = [1, 2, 3].map((n) => decaleMois(mois, -n))
  const foyer = filtre === 'foyer'
  const ligne = (cle: string, l: FinLine | null): LigneBudget => {
    const prev = l && foyer ? previsionDe(l.id, suivant, budgets) : { montant: null, saisi: false }
    return {
      cle, ligne: l,
      budget: l && foyer ? budgetDe(l.id, mois, budgets) : null,
      reel: reelDe(agregat, mois, cle),
      precedent: reelDe(agregat, precedents[0]!, cle),
      moyenne3: precedents.reduce((s, m) => s + reelDe(agregat, m, cle), 0) / 3,
      prevision: prev.montant,
      previsionSaisie: prev.saisi,
    }
  }
  const lignes = lignesTriees(opts.lines).map((l) => ligne(l.id, l))
  const nc = ligne(NON_CLASSE, null)
  // « Non classé » n'apparaît que s'il reste des opérations à classer ce mois-ci.
  if (Math.abs(nc.reel) >= 0.005) lignes.push(nc)
  const somme = (f: (l: LigneBudget) => number | null) => lignes.reduce((s, l) => s + (f(l) ?? 0), 0)
  return {
    mois, lignes,
    entrees: agregat.get(mois)?.entrees ?? 0,
    total: {
      budget: foyer ? somme((l) => l.budget) : null,
      reel: somme((l) => l.reel),
      precedent: somme((l) => l.precedent),
      moyenne3: somme((l) => l.moyenne3),
      prevision: foyer ? somme((l) => l.prevision) : null,
    },
  }
}

// ---------- Capital remboursé ----------

/**
 * Capital de prêts remboursé pendant un mois : la part de capital des échéances du mois
 * (tableaux d'amortissement, table fin_echeances — seuls y figurent les prêts dont le
 * capital doit compter comme épargné).
 */
export function capitalRembourse(echeances: FinEcheance[], mois: string): number {
  return echeances.reduce((s, e) => (moisDe(e.date) === mois ? s + Number(e.capital) : s), 0)
}

// ---------- Capital de prêt compté en épargne ----------

/** Capital d'un prêt pour un mois : fait (débité dans le budget), prévu (pas encore débité) ou hors budget. */
export interface CapitalPret {
  pretId: string
  nom: string
  mois: string
  /** Part de capital de l'échéance du mois (fin_echeances). */
  capital: number
  /** Montant réellement débité ce mois-ci dans le budget par ce prêt (échéance entière : capital + intérêts…). */
  debite: number
  /** Capital retiré de la ligne de dépenses (fait) : borné au montant réellement débité. */
  extrait: number
  /** Capital qui partira encore ce mois-ci (prêt du budget, échéance pas encore débitée). */
  prevu: number
  /** Ligne de budget qui porte le débit du prêt (celle dont on retire le capital). */
  ligneId: string | null
  etat: 'fait' | 'prevu'
  /** Prêt payé depuis un compte hors budget (ex. compte Airbnb) : le capital compte en épargne, mais aucune ligne n'est touchée. */
  horsBudget?: boolean
  /** Motif de reconnaissance du prélèvement (loan.debit_match), pour retrouver la charge. */
  motif: string | null
  /** Prélèvements réels du mois (date, montant positif, id), pour les montrer tels quels. */
  operations?: { id: string; date: string; montant: number }[]
  /** Intérêts + frais et assurance de l'échéance du mois (fin_echeances). */
  interets?: number
  assurance?: number
  /** Prêt de l'appartement de Reims : regroupé en une ligne « Prêt appart Reims » dans l'Épargné. */
  reims?: boolean
}

/** Prêts de l'appart de Reims (motif de prélèvement) : PRET IMMOBILIER 164522C et prêt BFM. */
export const MOTIF_PRETS_REIMS = /164522C|BOBOCRE/i
export const NOM_PRET_REIMS = 'Prêt appart Reims'
/** Prêt sans intérêts (BFM) : la part hors capital de l'échéance est de l'assurance. */
export const PRET_SANS_INTERETS = /BOBOCRE/i

export interface CapitalMois {
  mois: string
  prets: CapitalPret[]
  /** Capital déjà retiré des dépenses, par ligne de budget. */
  extraitParLigne: Map<string, number>
  /** Total des capitaux faits (comptés en épargne). */
  fait: number
  /** Total des capitaux encore à venir ce mois-ci (épargne prévue). */
  prevu: number
  /** Part de `fait` + `prevu` due aux prêts payés hors budget (compte Airbnb…). */
  horsBudget: number
}

export interface OptionsCapital {
  prets: FinLoan[]
  echeances: FinEcheance[]
  transactions: FinTransaction[]
  idx: IndexFinances
  filtre: FiltreTitulaire
  moisCourant: string
  /** Aujourd'hui (yyyy-MM-dd), pour dire si l'échéance d'un prêt hors budget est passée ; par défaut la date du jour. */
  aujourdhui?: string
}

/**
 * Capital de prêt d'un mois, prêt par prêt. Le prélèvement d'un prêt est reconnu à son motif
 * (`debit_match`) parmi les opérations du budget visibles dans la vue :
 *  - débité ce mois-ci → « fait » : on retire le capital de la ligne qui porte le prélèvement
 *    (borné au montant débité), il ne reste dans la ligne que intérêts, assurance et frais ;
 *  - pas encore débité, mais prêt payé depuis le budget (déjà vu les mois précédents) et mois
 *    courant ou futur → « prévu » ;
 *  - prélevé sur un compte hors budget (ex. compte Airbnb) : rien à retirer d'une ligne, mais le
 *    capital compte en épargne du mois — « fait » si un prélèvement est vu ce mois-ci ou si la date de
 *    l'échéance est passée, sinon « prévu ».
 */
export function capitalDuMois(opts: OptionsCapital & { mois: string }): CapitalMois {
  const { mois, idx, filtre } = opts
  const res: CapitalMois = { mois, prets: [], extraitParLigne: new Map(), fait: 0, prevu: 0, horsBudget: 0 }
  for (const pret of opts.prets) {
    const echeances = opts.echeances.filter((e) => e.account_id === pret.account_id && moisDe(e.date) === mois)
    if (!echeances.length) continue
    const capital = echeances.reduce((s, e) => s + Number(e.capital), 0)
    const re = motifPrelevement(pret.debit_match)
    const nom = (idx.comptes.get(pret.account_id)?.name ?? 'Prêt').replace(/^pr[eê]t immobilier\s*/i, 'Prêt ')
    const operations: { id: string; date: string; montant: number }[] = []
    const base = {
      pretId: pret.id, nom, mois, capital, debite: 0, extrait: 0, prevu: 0, ligneId: null as string | null, motif: pret.debit_match, operations,
      // Prêt BFM : sans intérêts, la part hors capital de son échéancier est de l'assurance.
      ...(PRET_SANS_INTERETS.test(pret.debit_match ?? '')
        ? { interets: 0, assurance: echeances.reduce((s, e) => s + Number(e.interets ?? 0) + Number(e.frais ?? 0) + Number(e.assurance ?? 0), 0) }
        : { interets: echeances.reduce((s, e) => s + Number(e.interets ?? 0) + Number(e.frais ?? 0), 0), assurance: echeances.reduce((s, e) => s + Number(e.assurance ?? 0), 0) }),
      reims: MOTIF_PRETS_REIMS.test(pret.debit_match ?? ''),
    }
    // Opérations qui portent le prélèvement : compte du budget (ligne) ou hors budget.
    let debite = 0
    let ligneId: string | null = null
    let ligneVue: string | null = null
    let budgetVu = false
    let horsBudgetVu = false
    let debiteHors = 0
    if (re) {
      for (const tx of opts.transactions) {
        if (Number(tx.amount) >= 0 || !re.test(tx.label_local ?? tx.label) && !re.test(tx.label)) continue
        const c = classer(tx, idx)
        if (c.type === 'ignoree' && c.raison === 'compte') {
          if (!correspond(filtre, titulaireDe(tx, idx))) continue
          horsBudgetVu = true
          if (moisBudget(tx.date) === mois) { debiteHors -= Number(tx.amount); operations.push({ id: tx.id, date: tx.date, montant: -Number(tx.amount) }) }
          continue
        }
        if (c.type !== 'ligne' || !correspond(filtre, titulaireDe(tx, idx))) continue
        budgetVu = true
        ligneVue = c.ligne
        if (moisBudget(tx.date) === mois) { debite -= Number(tx.amount); ligneId = c.ligne; operations.push({ id: tx.id, date: tx.date, montant: -Number(tx.amount) }) }
      }
    }
    const surCompteBudget = (pret.debit_account_ids ?? []).some((id) => idx.comptes.get(id)?.in_budget)
    if (debite > 0.005) {
      const extrait = Math.min(capital, debite)
      res.prets.push({ ...base, debite, extrait, ligneId, etat: 'fait' })
      res.fait += extrait
      res.extraitParLigne.set(ligneId!, (res.extraitParLigne.get(ligneId!) ?? 0) + extrait)
    } else if ((budgetVu || surCompteBudget) && mois >= opts.moisCourant) {
      res.prets.push({ ...base, prevu: capital, ligneId: ligneVue, etat: 'prevu' })
      res.prevu += capital
    } else if ((horsBudgetVu || pret.debit_hors_budget) && !budgetVu) {
      const dateEcheance = echeances.map((e) => e.date).sort()[0]!.slice(0, 10)
      const aujourdhui = opts.aujourdhui ?? todayIso()
      if (debiteHors > 0.005 || dateEcheance <= aujourdhui) {
        res.prets.push({ ...base, debite: debiteHors, extrait: capital, etat: 'fait', horsBudget: true })
        res.fait += capital
      } else {
        res.prets.push({ ...base, prevu: capital, etat: 'prevu', horsBudget: true })
        res.prevu += capital
      }
      res.horsBudget += capital
    }
  }
  return res
}

/**
 * Dépenses par ligne sans le capital de prêt (compté en épargne) : agrégat du budget où la part
 * de capital des prélèvements d'emprunt est retirée de leur ligne, et capital détaillé par mois.
 * Aucun trou : ce qui sort de la ligne entre dans « épargné », rien d'autre ne change.
 */
export function agregerHorsCapital(opts: Omit<OptionsCapital, 'moisCourant'> & { moisCourant: string }): { agregat: Agregat; capital: Map<string, CapitalMois> } {
  const agregat = agreger(opts.transactions, opts.idx, opts.filtre)
  const capital = new Map<string, CapitalMois>()
  const moisConcernes = new Set<string>([...agregat.keys(), opts.moisCourant, decaleMois(opts.moisCourant, 1)])
  for (const e of opts.echeances) moisConcernes.add(moisDe(e.date))
  for (const mois of moisConcernes) {
    const c = capitalDuMois({ ...opts, mois })
    if (!c.prets.length) continue
    capital.set(mois, c)
    const m = agregat.get(mois)
    if (!m) continue
    for (const [ligne, montant] of c.extraitParLigne) m.lignes.set(ligne, (m.lignes.get(ligne) ?? 0) - montant)
  }
  return { agregat, capital }
}

export interface EpargnePrevue { nom: string; montant: number; type: 'ligne' | 'capital' }

/**
 * Épargnes pas encore faites ce mois-ci : pour chaque ligne d'épargne, le budget restant
 * (budget − déjà épargné), et le capital des prêts du budget pas encore débité. Un mois passé
 * n'a plus rien de prévu. Le capital déjà débité n'y est pas : il est retiré des dépenses,
 * donc compté une seule fois, dans « fait ».
 */
export function epargnesPrevues(opts: {
  mois: string; moisCourant: string; lignes: LigneBudget[]; capital?: CapitalMois
}): { total: number; details: EpargnePrevue[] } {
  if (opts.mois < opts.moisCourant) return { total: 0, details: [] }
  const details: EpargnePrevue[] = []
  // Le capital remboursé ou encore à débiter (prêts payés depuis le budget) fait partie de l'épargne habituelle : il consomme le budget d'épargne
  // avant qu'on prévoie le reste (300 de PER + ~1 000 de capital = 1 300 : plus rien de prévu ; le capital à venir reste listé à part, sans doublon). Un prêt hors budget (Lille) n'y compte pas.
  let capitalFait = Math.max(0, (opts.capital?.fait ?? 0) + (opts.capital?.prevu ?? 0) - (opts.capital?.horsBudget ?? 0))
  for (const l of opts.lignes) {
    if (!estEpargneComptee(l.ligne) || l.budget === null) continue
    let reste = l.budget - l.reel
    const pris = Math.min(capitalFait, Math.max(0, reste))
    reste -= pris
    capitalFait -= pris
    if (reste > 0.5) details.push({ nom: l.ligne.name, montant: reste, type: 'ligne' })
  }
  for (const p of opts.capital?.prets ?? []) {
    // Un prêt payé hors budget n'est pas retiré du Reste (qui vient du budget) : il figure seulement dans la liste de l'Épargné.
    if (p.etat === 'prevu' && !p.horsBudget && p.prevu > 0.5) details.push({ nom: `Capital ${p.nom}`, montant: p.prevu, type: 'capital' })
  }
  return { total: details.reduce((s, d) => s + d.montant, 0), details }
}

/** Pastille sous une ligne du détail : une opération réelle, ou une part retirée (intérêts, assurance). */
export interface PastilleEpargne { texte: string; montant: number; type: 'operation' | 'interets' | 'assurance'; date?: string }

export interface EpargneLigne { nom: string; montant: number; etat: 'fait' | 'prevu'; type: 'ligne' | 'capital'; pastilles?: PastilleEpargne[] }

/** Pastilles d'un prêt fait : ses prélèvements réels, puis ce qui en est retiré (intérêts, assurance). */
export function pastillesPret(p: CapitalPret): PastilleEpargne[] {
  const res: PastilleEpargne[] = (p.operations ?? []).map((o) => ({ texte: 'operation', montant: o.montant, type: 'operation', date: o.date }))
  if ((p.interets ?? 0) > 0.005) res.push({ texte: 'intérêts', montant: p.interets!, type: 'interets' })
  if ((p.assurance ?? 0) > 0.005) res.push({ texte: 'assurance', montant: p.assurance!, type: 'assurance' })
  return res
}

/**
 * La liste des épargnes du mois pour l'encart « Épargné » : une ligne par épargne, faite
 * (réelle) ou prévue (reste du budget d'épargne, capital pas encore débité), y compris le capital
 * des prêts payés hors budget. « Épargne vacances » n'en fait pas partie (estEpargneComptee).
 */
export function listeEpargnes(opts: {
  mois: string; moisCourant: string; lignes: LigneBudget[]; capital?: CapitalMois
}): { lignes: EpargneLigne[]; fait: number; prevu: number } {
  const lignes: EpargneLigne[] = []
  for (const l of opts.lignes) {
    if (!estEpargneComptee(l.ligne)) continue
    if (Math.abs(l.reel) >= 0.5) lignes.push({ nom: l.ligne.name, montant: l.reel, etat: 'fait', type: 'ligne' })
  }
  let reims: EpargneLigne | null = null
  for (const p of opts.capital?.prets ?? []) {
    if (p.etat !== 'fait' || p.extrait <= 0.005) continue
    if (p.reims) {
      // Prêts de l'appart de Reims : une seule ligne, montant = capital épargné, pastilles = opérations réelles − intérêts/assurance.
      if (!reims) { reims = { nom: NOM_PRET_REIMS, montant: 0, etat: 'fait', type: 'capital', pastilles: [] }; lignes.push(reims) }
      reims.montant += p.extrait
      reims.pastilles!.push(...pastillesPret(p))
      continue
    }
    lignes.push({ nom: `Capital ${p.nom}`, montant: p.extrait, etat: 'fait', type: 'capital' })
  }
  if (reims) {
    const ordre = { operation: 0, interets: 1, assurance: 2 }
    reims.pastilles!.sort((a, b) => ordre[a.type] - ordre[b.type] || (a.date ?? '').localeCompare(b.date ?? ''))
  }
  const prevues = epargnesPrevues(opts)
  for (const d of prevues.details) lignes.push({ nom: d.nom, montant: d.montant, etat: 'prevu', type: d.type })
  if (opts.mois >= opts.moisCourant) {
    for (const p of opts.capital?.prets ?? []) {
      if (p.etat === 'prevu' && p.horsBudget && p.prevu > 0.5) lignes.push({ nom: `Capital ${p.nom}`, montant: p.prevu, etat: 'prevu', type: 'capital' })
    }
  }
  const somme = (etat: EpargneLigne['etat']) => lignes.filter((x) => x.etat === etat).reduce((s, x) => s + x.montant, 0)
  return { lignes, fait: somme('fait'), prevu: somme('prevu') }
}

// ---------- Entrées prévues ----------

/**
 * Entrées prévues pour un mois : les entrées régulières (même intitulé, cleGroupe,
 * présent en entrée chacun des 3 mois précédents — un salaire), chacune comptée pour
 * le plus petit montant mensuel observé (`montant`) ; `moyenne` : leur moyenne sur ces
 * 3 mois. Null s'il n'y en a pas.
 */
export function entreesPrevues(opts: {
  mois: string; transactions: FinTransaction[]; idx: IndexFinances; filtre: FiltreTitulaire
}): { montant: number; moyenne: number; sources: { nom: string; montant: number; moyenne: number }[] } | null {
  const precedents = [1, 2, 3].map((n) => decaleMois(opts.mois, -n))
  const rang = new Map(precedents.map((m, i) => [m, i]))
  const parCle = new Map<string, { nom: string; parMois: number[] }>()
  for (const tx of opts.transactions) {
    const i = rang.get(moisBudget(tx.date))
    if (i === undefined || !correspond(opts.filtre, titulaireDe(tx, opts.idx))) continue
    if (classer(tx, opts.idx).type !== 'revenu' || Number(tx.amount) <= 0) continue
    const { cle, nom } = cleGroupe(tx.label)
    const g = parCle.get(cle) ?? { nom, parMois: [0, 0, 0] }
    g.parMois[i]! += Number(tx.amount)
    parCle.set(cle, g)
  }
  const sources = [...parCle.values()]
    .filter((g) => g.parMois.every((v) => v > 0))
    .map((g) => ({ nom: g.nom, montant: Math.min(...g.parMois), moyenne: g.parMois.reduce((s, v) => s + v, 0) / 3 }))
    .sort((a, b) => b.montant - a.montant)
  if (!sources.length) return null
  return { montant: sources.reduce((s, x) => s + x.montant, 0), moyenne: sources.reduce((s, x) => s + x.moyenne, 0), sources }
}

// ---------- Dépenses encore à venir dans le mois ----------

/**
 * Ce qui va encore partir ce mois-ci, pour un « reste » réaliste :
 * - ligne « Frais fixe » : chaque charge régulière (même intitulé, cleGroupe, présente
 *   chacun des 3 mois précédents) pas encore passée ce mois-ci, à son montant moyen ;
 * - ligne « Courses » : la moyenne des 3 mois précédents moins ce qui est déjà dépensé.
 * Un mois passé n'a plus rien à venir. Les lignes sont reconnues à leur nom.
 */
export function depensesAVenir(opts: {
  mois: string; moisCourant: string; transactions: FinTransaction[]; idx: IndexFinances
  filtre: FiltreTitulaire; lines: FinLine[]
  /** Capital de prêt du mois : la part de capital d'une échéance pas encore débitée est de l'épargne prévue, pas une dépense à venir. */
  capital?: CapitalMois
}): { total: number; details: { nom: string; montant: number }[] } {
  const vide = { total: 0, details: [] }
  if (opts.mois < opts.moisCourant) return vide
  const ligneNommee = (nom: string) => opts.lines.find((l) => memeNom(l.name, nom))?.id ?? null
  const fixes = ligneNommee('Frais fixe')
  const courses = ligneNommee('Courses')
  const precedents = [1, 2, 3].map((n) => decaleMois(opts.mois, -n))
  const rang = new Map(precedents.map((m, i) => [m, i]))
  const charges = new Map<string, { nom: string; parMois: number[]; ceMois: boolean; exemple: string }>()
  const coursesParMois = [0, 0, 0]
  let coursesCeMois = 0
  for (const tx of opts.transactions) {
    if (!correspond(opts.filtre, titulaireDe(tx, opts.idx))) continue
    const c = classer(tx, opts.idx)
    if (c.type !== 'ligne') continue
    const m = moisBudget(tx.date)
    const i = rang.get(m)
    if (c.ligne === courses) {
      if (i !== undefined) coursesParMois[i]! -= Number(tx.amount)
      else if (m === opts.mois) coursesCeMois -= Number(tx.amount)
    } else if (c.ligne === fixes && (i !== undefined || m === opts.mois)) {
      const { cle, nom } = cleGroupe(tx.label)
      const g = charges.get(cle) ?? { nom, parMois: [0, 0, 0], ceMois: false, exemple: tx.label_local ?? tx.label }
      if (i !== undefined) g.parMois[i]! -= Number(tx.amount)
      else g.ceMois = true
      charges.set(cle, g)
    }
  }
  const details = [...charges.values()]
    .filter((g) => !g.ceMois && g.parMois.every((v) => v > 0))
    .map((g) => {
      const brut = g.parMois.reduce((s, v) => s + v, 0) / 3
      // Échéance de prêt pas encore débitée : on n'en garde que intérêts, assurance et frais.
      const capital = (opts.capital?.prets ?? []).filter((p) => p.etat === 'prevu' && !p.horsBudget && motifPrelevement(p.motif)?.test(g.exemple))
        .reduce((s, p) => s + p.prevu, 0)
      return { nom: g.nom, montant: Math.max(0, brut - capital) }
    })
    .filter((d) => d.montant > 0.5)
    .sort((a, b) => b.montant - a.montant)
  const coursesRestantes = courses ? Math.max(0, coursesParMois.reduce((s, v) => s + v, 0) / 3 - coursesCeMois) : 0
  if (coursesRestantes > 0.5) details.push({ nom: 'Courses (moyenne 3 mois)', montant: coursesRestantes })
  return { total: details.reduce((s, d) => s + d.montant, 0), details }
}

// ---------- Bilan de plusieurs mois ----------

export interface BilanLigne {
  cle: string
  ligne: FinLine | null
  cellules: { mois: string; reel: number; budget: number | null }[]
  reel: number                // cumul
  budget: number | null       // cumul (null hors « Foyer »)
  moyenne: number
  depassements: number        // mois au-dessus du budget
}

export interface Bilan {
  mois: string[]
  lignes: BilanLigne[]
  parMois: { mois: string; reel: number; budget: number | null; entrees: number }[]
  total: { reel: number; budget: number | null; entrees: number; moyenne: number }
}

/** Les `n` mois complets qui précèdent `moisCourant`, du plus ancien au plus récent. */
export const moisEcoules = (moisCourant: string, n = 6) =>
  Array.from({ length: n }, (_, i) => decaleMois(moisCourant, i - n))

export function bilan(opts: {
  mois: string[]; lines: FinLine[]; budgets: FinBudget[]; agregat: Agregat; filtre: FiltreTitulaire
}): Bilan {
  const { mois, budgets, agregat, filtre } = opts
  const foyer = filtre === 'foyer'
  const faire = (cle: string, l: FinLine | null): BilanLigne => {
    const cellules = mois.map((m) => ({
      mois: m, reel: reelDe(agregat, m, cle), budget: l && foyer ? budgetDe(l.id, m, budgets) : null,
    }))
    const reel = cellules.reduce((s, c) => s + c.reel, 0)
    return {
      cle, ligne: l, cellules, reel,
      budget: l && foyer ? cellules.reduce((s, c) => s + (c.budget ?? 0), 0) : null,
      moyenne: mois.length ? reel / mois.length : 0,
      // Un budget à 0 = pas de budget fixé : pas de dépassement à signaler.
      depassements: cellules.filter((c) => c.budget !== null && c.budget > 0 && c.reel > c.budget + 0.5).length,
    }
  }
  const lignes = lignesTriees(opts.lines).map((l) => faire(l.id, l))
  const nc = faire(NON_CLASSE, null)
  if (nc.cellules.some((c) => c.reel)) lignes.push(nc)
  const parMois = mois.map((m, i) => ({
    mois: m,
    reel: lignes.reduce((s, l) => s + l.cellules[i]!.reel, 0),
    budget: foyer ? lignes.reduce((s, l) => s + (l.cellules[i]!.budget ?? 0), 0) : null,
    entrees: agregat.get(m)?.entrees ?? 0,
  }))
  const reel = parMois.reduce((s, p) => s + p.reel, 0)
  return {
    mois, lignes, parMois,
    total: {
      reel,
      budget: foyer ? parMois.reduce((s, p) => s + (p.budget ?? 0), 0) : null,
      entrees: parMois.reduce((s, p) => s + p.entrees, 0),
      moyenne: mois.length ? reel / mois.length : 0,
    },
  }
}

// ---------- Détail d'une ligne ----------

export interface GroupeCategorie {
  nom: string                // « Parent › Sous-catégorie » (clé du groupe)
  court: string               // la sous-catégorie seule, pour l'affichage
  total: number               // dépensé (sorties positives)
  operations: FinTransaction[]
}

/** Opérations d'une ligne (ou de « Non classé ») pour un mois, groupées par catégorie. */
export function detailLigne(opts: {
  cle: string; mois: string; transactions: FinTransaction[]; idx: IndexFinances; filtre: FiltreTitulaire
}): GroupeCategorie[] {
  const { cle, mois, transactions, idx, filtre } = opts
  const groupes = new Map<string, GroupeCategorie>()
  for (const tx of transactions) {
    if (moisBudget(tx.date) !== mois || !correspond(filtre, titulaireDe(tx, idx))) continue
    const c = classer(tx, idx)
    const k = c.type === 'ligne' ? c.ligne : c.type === 'non_classe' ? NON_CLASSE : null
    if (k !== cle) continue
    const cat = categorieEffective(tx.category_id, idx)
    const nom = nomCategorie(cat, idx)
    let g = groupes.get(nom)
    if (!g) { g = { nom, court: cat?.name ?? 'Sans catégorie', total: 0, operations: [] }; groupes.set(nom, g) }
    g.total -= Number(tx.amount)
    g.operations.push(tx)
  }
  for (const g of groupes.values()) g.operations.sort((a, b) => b.date.localeCompare(a.date))
  return [...groupes.values()].sort((a, b) => b.total - a.total)
}

/**
 * Détail d'une ligne sans le capital de prêt (compté dans l'Épargné) : chaque groupe qui porte un
 * prélèvement d'emprunt perd la part de capital extraite, comme la tuile. Renvoie aussi les noms
 * des groupes touchés (pour signaler « opération dans Épargné »).
 */
export function detailHorsCapital(groupes: GroupeCategorie[], cle: string, capital?: CapitalMois): { groupes: GroupeCategorie[]; touches: Map<string, { reims: boolean }> } {
  const touches = new Map<string, { reims: boolean }>()
  if (!capital) return { groupes, touches }
  const res = groupes.map((g) => ({ ...g }))
  for (const p of capital.prets) {
    if (p.etat !== 'fait' || p.horsBudget || p.ligneId !== cle || p.extrait <= 0.005) continue
    const ids = new Set((p.operations ?? []).map((o) => o.id))
    const g = res.find((x) => x.operations.some((tx) => ids.has(tx.id)))
    if (!g) continue
    g.total -= p.extrait
    touches.set(g.nom, { reims: (touches.get(g.nom)?.reims ?? false) || !!p.reims })
  }
  return { groupes: res.sort((a, b) => b.total - a.total), touches }
}

export interface NoeudCategorie {
  nom: string
  total: number
  /** Sous-catégories (vide pour une catégorie sans sous-catégorie). */
  enfants: { nom: string; total: number }[]
}

/**
 * Regroupe le détail d'une ligne en catégories → sous-catégories, sommes seules (lecture seule du Résumé).
 * Les groupes « Parent › Enfant » se rangent sous Parent, dont la somme est celle de tous ses enfants (et de ses
 * propres opérations s'il en a). Une catégorie sans sous-catégorie reste une ligne simple. Tri par somme décroissante.
 */
/** Libellé des opérations rangées directement dans un parent qui a des sous-catégories (« Supermarché » pour Courses). */
export const nomPropres = (parent: string) => (parent.trim().toLowerCase() === 'courses' ? 'Supermarché' : 'Autres')

export function hierarchieDetail(groupes: GroupeCategorie[]): NoeudCategorie[] {
  const parents = new Map<string, { total: number; propre: number; enfants: { nom: string; total: number }[] }>()
  for (const g of groupes) {
    const i = g.nom.indexOf(' › ')
    const parent = i < 0 ? g.nom : g.nom.slice(0, i)
    let n = parents.get(parent)
    if (!n) { n = { total: 0, propre: 0, enfants: [] }; parents.set(parent, n) }
    n.total += g.total
    if (i < 0) n.propre += g.total
    else n.enfants.push({ nom: g.court, total: g.total })
  }
  return [...parents.entries()].map(([nom, n]) => {
    const enfants = [...n.enfants]
    // Opérations rangées directement dans la catégorie parente, à côté de ses sous-catégories.
    if (enfants.length && Math.abs(n.propre) > 0.005) enfants.push({ nom: nomPropres(nom), total: n.propre })
    return { nom, total: n.total, enfants: enfants.sort((a, b) => b.total - a.total) }
  }).sort((a, b) => b.total - a.total)
}

/** « Parent › Sous-catégorie », ou « Sans catégorie ». */
export function nomCategorie(cat: FinCategory | undefined, idx: IndexFinances): string {
  if (!cat) return 'Sans catégorie'
  const parent = cat.parent_id ? idx.categories.get(cat.parent_id) : undefined
  return parent ? `${parent.name} › ${cat.name}` : cat.name
}

// ---------- Intitulés locaux ----------

/**
 * Intitulé bancaire nettoyé pour la reconnaissance : minuscules, sans accents,
 * sans le « CB*1234 » de la carte ni les préfixes de prélèvement, espaces réduits.
 * « LA BOULANGERIE 2 CB*1111 » et « … CB*2222 » donnent le même motif.
 */
export function normaliserLibelle(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\bcb\*\s*\d+/g, ' ')
    .replace(/^(prlv sepa|prlv|carte|cb)\s+/, '')
    .replace(/\s+/g, ' ').trim()
}

/** Reconnaît les intitulés : l'intitulé propre à l'opération, sinon la règle dont le
 *  motif est EXACTEMENT l'intitulé nettoyé (jamais « contient » : « reims » ne doit pas
 *  rebaptiser « CRF REIMS », « LAV REIMS »…), sinon rien (null). */
/** Règle intégrée : deux contrats Engie partagent le même mandat, seul le jour
 *  du prélèvement les distingue (Taissy vers le 18, Reims vers le 28). Débits seulement. */
export function libelleEngie(tx: Pick<FinTransaction, 'label' | 'amount' | 'date'>): string | null {
  if (Number(tx.amount) >= 0 || !/\bengie\b/.test(normaliserLibelle(tx.label))) return null
  const jour = Number(tx.date.slice(8, 10))
  return jour >= 22 ? 'Engie Reims Gaz&Electricité' : 'Engie Taissy Electricité'
}

export function creerReconnaissance(regles: FinLabel[], alias: Pick<FinMerchantAlias, 'pattern' | 'label'>[] = []) {
  const parMotif = new Map(regles.filter((r) => r.pattern.trim()).map((r) => [r.pattern.trim(), r]))
  const regleDe = (label: string): FinLabel | null => parMotif.get(normaliserLibelle(label)) ?? null
  const parCle = new Map(alias.filter((a) => a.label.trim()).map((a) => [a.pattern, a.label.trim()]))
  /** Intitulé du commerçant (fin_merchant_alias), par sa clé automatique. */
  const aliasDe = (label: string): string | null => parCle.size ? parCle.get(cleGroupe(label).cle) ?? null : null
  return {
    regleDe,
    aliasDe,
    /** Ce qu'on affiche : intitulé propre, puis commerçant renommé, puis règle, puis Engie, puis la banque. */
    libelle: (tx: FinTransaction): string => tx.label_local?.trim() || aliasDe(tx.label) || regleDe(tx.label)?.label || libelleEngie(tx) || tx.label,
    /** Vrai si l'opération a un intitulé local (propre, commerçant ou par règle). */
    estLocal: (tx: FinTransaction): boolean => !!tx.label_local?.trim() || !!aliasDe(tx.label) || !!regleDe(tx.label) || !!libelleEngie(tx),
  }
}

/**
 * Opérations semblables à `tx` (pour lui appliquer la même catégorie) : même
 * intitulé nettoyé, ou même règle d'intitulé local. Hors `tx` elle-même et hors
 * celles déjà dans la catégorie visée ; les plus récentes d'abord.
 */
export function operationsSemblables(
  tx: FinTransaction, transactions: FinTransaction[], reco: ReturnType<typeof creerReconnaissance>,
  idx: IndexFinances, categorieVisee: string | null,
): FinTransaction[] {
  const motif = normaliserLibelle(tx.label)
  const regle = reco.regleDe(tx.label)
  return transactions.filter((t) => {
    if (t.id === tx.id) return false
    const meme = (motif && normaliserLibelle(t.label) === motif) || (regle && reco.regleDe(t.label)?.id === regle.id)
    return meme && (categorieEffective(t.category_id, idx)?.id ?? null) !== categorieVisee
  }).sort((a, b) => b.date.localeCompare(a.date))
}

// ---------- Recherche d'opérations ----------

const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Opérations qui répondent à une recherche, les plus récentes d'abord.
 * Un nombre (« 42 », « 42,50 ») cherche le montant (à l'euro près s'il n'a pas de
 * centimes) ; sinon chaque mot doit figurer dans l'intitulé bancaire, l'intitulé
 * affiché, la catégorie ou la ligne (casse et accents ignorés).
 */
export function rechercherOperations(opts: {
  transactions: FinTransaction[]; requete: string; idx: IndexFinances; filtre: FiltreTitulaire
  libelle?: (tx: FinTransaction) => string
}): FinTransaction[] {
  const { transactions, idx, filtre, libelle } = opts
  const q = opts.requete.trim()
  if (!q) return []
  const nombre = /^[+-]?\d+(?:[.,]\d{1,2})?$/.test(q.replace(/\s|€/g, '')) ? q.replace(/\s|€/g, '').replace(',', '.') : null
  const mots = sansAccents(q).split(/\s+/).filter(Boolean)
  return transactions.filter((tx) => {
    if (!correspond(filtre, titulaireDe(tx, idx))) return false
    const montant = Math.abs(Number(tx.amount))
    if (nombre !== null) {
      const n = Math.abs(Number(nombre))
      return nombre.includes('.') ? Math.abs(montant - n) < 0.005 : Math.trunc(montant) === n
    }
    const cat = categorieEffective(tx.category_id, idx)
    const ligne = idx.lignes.get(ligneDeCategorie(cat, idx) ?? '')
    const texte = sansAccents([tx.label, tx.label_local ?? '', libelle?.(tx) ?? '', nomCategorie(cat, idx), ligne?.name ?? ''].join(' '))
    return mots.every((m) => texte.includes(m))
  }).sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * Dernières opérations (panneau du Résumé) : dépenses et entrées du filtre de titulaire,
 * les plus récentes d'abord, virements internes écartés. Avec une recherche, mêmes règles
 * que rechercherOperations (intitulés, catégorie, ligne, montant).
 */
export function operationsRecentes(opts: {
  transactions: FinTransaction[]; requete: string; idx: IndexFinances; filtre: FiltreTitulaire
  libelle?: (tx: FinTransaction) => string
}): FinTransaction[] {
  const base = opts.transactions.filter((tx) => !tx.internal)
  if (opts.requete.trim()) return rechercherOperations({ ...opts, transactions: base })
  return base.filter((tx) => correspond(opts.filtre, titulaireDe(tx, opts.idx)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
}

/** Découpe `texte` en morceaux, `vu` vrai sur ceux qui répondent à un mot de la recherche
 *  (casse et accents ignorés) : pour surligner. Une recherche de montant ne surligne rien. */
export function segmentsSurlignes(texte: string, requete: string): { t: string; vu: boolean }[] {
  const q = requete.trim()
  if (!q || /^[+-]?\d+(?:[.,]\d{1,2})?$/.test(q.replace(/\s|€/g, ''))) return [{ t: texte, vu: false }]
  // Un caractère accentué décomposé garde sa longueur (NFD puis retrait des diacritiques, lettre par lettre).
  const plat = [...texte].map((c) => sansAccents(c) || c).map((c) => c.slice(0, 1)).join('')
  const marque = new Array<boolean>(texte.length).fill(false)
  for (const m of sansAccents(q).split(/\s+/).filter(Boolean)) {
    for (let i = plat.indexOf(m); i >= 0; i = plat.indexOf(m, i + 1)) for (let k = i; k < i + m.length; k++) marque[k] = true
  }
  const out: { t: string; vu: boolean }[] = []
  ;[...texte].forEach((c, i) => {
    const d = out[out.length - 1]
    if (d && d.vu === marque[i]) d.t += c; else out.push({ t: c, vu: marque[i]! })
  })
  return out
}

// ---------- Regroupements d'intitulés (détail compacté) ----------

/** Enseignes et fournisseurs reconnus d'office : début de l'intitulé nettoyé → nom du groupe.
 *  Un fournisseur passe avant le mandat : Orange fibre et Orange mobile (deux mandats) → Orange. */
const ENSEIGNES: [RegExp, string][] = [
  [/^(carrefour|crf)\b/, 'Carrefour'],
  [/^(intermarche|inter)\b/, 'Intermarché'],
  [/^(monoprix|monop)\b/, 'Monoprix'],
  [/^(e\.? ?leclerc|leclerc)\b/, 'Leclerc'],
  [/^auchan\b/, 'Auchan'],
  [/^lidl\b/, 'Lidl'],
  [/^aldi\b/, 'Aldi'],
  [/^franprix\b/, 'Franprix'],
  [/^(super u|hyper u|u express|magasins u)\b/, 'Super U'],
  [/^picard\b/, 'Picard'],
  [/^biocoop\b/, 'Biocoop'],
  [/^naturalia\b/, 'Naturalia'],
  [/^grand frais\b/, 'Grand Frais'],
  [/^(amazon|amzn)\b/, 'Amazon'],
  [/^sncf\b/, 'SNCF'],
  [/^orange\b/, 'Orange'],
  [/^sfr\b/, 'SFR'],
  [/^bouygues\b/, 'Bouygues Telecom'],
  [/^(free mobile|free telecom|freebox)\b/, 'Free'],
  [/^edf\b/, 'EDF'],
  [/^engie\b/, 'Engie'],
  [/^total ?energies\b/, 'TotalEnergies'],
  [/^spotify\b/, 'Spotify'],
  [/^netflix\b/, 'Netflix'],
  [/^deezer\b/, 'Deezer'],
  [/^(canal ?\+|canal plus|canalplus)/, 'Canal+'],
  [/^disney/, 'Disney+'],
  [/^apple\b/, 'Apple'],
  [/^google\b/, 'Google'],
]

const PARTICULES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'a', 'au', 'aux', 'et', 'en', 'sur', 'pour'])
const titre = (m: string) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()

/** Nom lisible tiré d'un intitulé bancaire : sans carte ni numéros, 4 mots au plus ;
 *  les mots en MAJUSCULES passent en casse de titre (sigles courts gardés : SA, EDF). */
export function nomLisible(label: string): string {
  const mots: string[] = []
  for (const m of label.replace(/\bCB\*\s*\d+/gi, ' ').split(/\s+/)) {
    if (!m) continue
    // Un mot chiffré, une parenthèse ou « RUM » ouvre la partie technique (références, « (facture: … », mandat).
    if (/\d/.test(m) || m.startsWith('(') || m === 'RUM') { if (mots.length) break; continue }
    const propre = m.replace(/[:;,(-]+$/, '')
    if (!propre) continue
    mots.push(propre)
    if (mots.length === 4) break
  }
  if (!mots.length) return label.trim()
  return mots.map((m, i) => {
    if (m !== m.toUpperCase()) return m
    if (PARTICULES.has(m.toLowerCase())) return i === 0 ? titre(m) : m.toLowerCase()
    return m.replace(/[^\p{L}]/gu, '').length > 3 ? titre(m) : m
  }).join(' ')
}

/**
 * Clé de regroupement automatique d'une opération, prudente :
 * - enseigne ou fournisseur connu (Carrefour City, CRF Reims… → Carrefour ; Orange) ;
 * - prélèvement : la référence du mandat (« RUM … »), stable d'un mois à l'autre ;
 * - sinon l'intitulé nettoyé sans aucun mot contenant un chiffre
 *   (« CARREFOUR CITY 2 », numéros de facture, dates, « Réf : SCT… »).
 */
export function cleGroupe(label: string): { cle: string; nom: string } {
  const n = normaliserLibelle(label)
  for (const [re, nom] of ENSEIGNES) if (re.test(n)) return { cle: `enseigne:${nom.toLowerCase()}`, nom }
  return { cle: clesGroupe(label)[0]!, nom: nomLisible(label) }
}

/** Toutes les clés possibles d'une opération, de la plus forte à la plus faible :
 *  enseigne, mandat, intitulé sans mots chiffrés. Un regroupement manuel posé sur
 *  l'une d'elles (même avant l'ajout d'une enseigne à la liste) reste reconnu. */
export function clesGroupe(label: string): string[] {
  const n = normaliserLibelle(label)
  const cles: string[] = []
  for (const [re, nom] of ENSEIGNES) if (re.test(n)) { cles.push(`enseigne:${nom.toLowerCase()}`); break }
  const rum = /\bRUM\s+(\S+)/i.exec(label)
  if (rum) cles.push(`rum:${rum[1]!.toLowerCase()}`)
  const mots = n.split(' ').filter((m) => !/\d/.test(m) && /[a-z]/.test(m) && m !== 'ref')
  cles.push(mots.join(' ') || n)
  return cles
}

/** Opérations réunies sous un même intitulé (automatique ou regroupement manuel). */
export interface GroupeIntitules {
  cle: string                // `groupe:<nom>` pour un regroupement manuel, sinon la clé automatique
  nom: string
  manuel: boolean
  cles: string[]             // clés automatiques réunies dans ce groupe
  total: number              // dépensé (sorties positives, remboursements déduits)
  operations: FinTransaction[]
  /** Toujours absent : un regroupement manuel forme un seul groupe à plat. */
  sousGroupes?: GroupeIntitules[]
}

/**
 * Regroupe des opérations par intitulé très semblable (cleGroupe) ; un regroupement
 * manuel (`fin_groups` : clé automatique → nom) réunit plusieurs clés sous un nom,
 * et ses opérations sont à leur tour regroupées par intitulé semblable (`sousGroupes`) :
 * groupe manuel → intitulés semblables → opérations.
 * Le nom d'un groupe automatique : l'enseigne, sinon l'intitulé local de
 * l'opération la plus récente, sinon un nom lisible tiré de l'intitulé bancaire.
 * Les plus gros d'abord ; dans chaque groupe, les opérations les plus récentes d'abord.
 */
export function grouperParIntitule(
  operations: FinTransaction[], groupes: FinGroup[], libelleLocal?: (tx: FinTransaction) => string | null,
): GroupeIntitules[] {
  const regles = new Map(groupes.map((g) => [g.pattern, g.name.trim()]))
  const parCle = new Map<string, GroupeIntitules & { nomAuto: string; recente: string; local: string | null }>()
  // Une opération sans intitulé local rejoint celles qui en ont un au même intitulé
  // bancaire ou au même mandat (« Loyer » posé sur quelques virements seulement) —
  // jamais par l'enseigne : un ticket Carrefour renommé n'emporte pas tout Carrefour.
  const localParCle = new Map<string, string>()
  for (const tx of operations) {
    const local = libelleLocal?.(tx)?.trim()
    if (!local) continue
    for (const k of clesGroupe(tx.label)) if (!k.startsWith('enseigne:') && !localParCle.has(k)) localParCle.set(k, local)
  }
  for (const tx of operations) {
    const auto = cleGroupe(tx.label)
    // Même intitulé local = même groupe, même si les intitulés bancaires diffèrent
    // (« X Virement de … Réf : … » et « X » tout court).
    const local = libelleLocal?.(tx)?.trim()
      || clesGroupe(tx.label).map((k) => localParCle.get(k)).find(Boolean) || null
    // Clé retenue : celle qui porte un regroupement manuel s'il y en a un (pour pouvoir le défaire).
    const candidates = [...(local ? [`local:${normaliserLibelle(local)}`] : []), ...clesGroupe(tx.label)]
    const base = candidates.find((k) => regles.get(k)) ?? candidates[0]!
    const manuel = regles.get(base) || null
    const cleG = manuel ? `groupe:${manuel}` : base
    let g = parCle.get(cleG)
    if (!g) {
      g = { cle: cleG, nom: manuel ?? auto.nom, manuel: !!manuel, cles: [], total: 0, operations: [], nomAuto: auto.nom, recente: '', local: null }
      parCle.set(cleG, g)
    }
    if (!g.cles.includes(base)) g.cles.push(base)
    g.total -= Number(tx.amount)
    g.operations.push(tx)
    if (tx.date >= g.recente) {
      g.recente = tx.date
      g.local = local
      g.nomAuto = auto.nom
    }
  }
  return [...parCle.values()].map(({ nomAuto, recente: _r, local, ...g }) => {
    const enseigne = g.cles.length === 1 && g.cles[0]!.startsWith('enseigne:')
    const renomme = enseigne && local?.trim() && g.operations.every((tx) => libelleLocal?.(tx)?.trim() === local.trim())
    return {
      ...g,
      nom: g.manuel || (enseigne && !renomme) ? g.nom : local?.trim() || nomAuto,
      operations: g.operations.sort((a, b) => b.date.localeCompare(a.date)),
    }
  }).sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom, 'fr'))
}

/** Même nom à l'accent, à la casse et au pluriel près (« Abonnement » = « abonnements »). */
const memeNom = (a: string, b: string) => {
  const n = (x: string) => normaliserLibelle(x).replace(/s$/, '')
  return n(a) === n(b)
}

/**
 * Évite un échelon inutile dans une catégorie : un groupe manuel qui porte le nom de la
 * catégorie (« Abonnements » dans Abonnements) ou qui y est seul laisse la place à ses
 * intitulés semblables, remontés d'un cran. Les plus gros d'abord.
 */
export function aplatirGroupes(groupes: GroupeIntitules[], nomCategorie?: string): GroupeIntitules[] {
  const plats = groupes.flatMap((g) =>
    g.manuel && g.sousGroupes && (groupes.length === 1 || (nomCategorie && memeNom(g.nom, nomCategorie))) ? g.sousGroupes : [g])
  return plats.sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom, 'fr'))
}

export interface GroupePeriode extends GroupeIntitules {
  parMois: number[]          // dépensé, aligné sur les mois demandés
  moyenne: number
  sousGroupes?: GroupePeriode[]
}

/**
 * Détail compacté d'une ligne (ou de « Non classé ») sur plusieurs mois : une ligne
 * par groupe d'intitulés (grouperParIntitule), le dépensé de chaque mois et la moyenne.
 */
export function detailPeriode(opts: {
  cle: string; mois: string[]; transactions: FinTransaction[]; idx: IndexFinances; filtre: FiltreTitulaire
  groupes: FinGroup[]; libelleLocal?: (tx: FinTransaction) => string | null
}): GroupePeriode[] {
  const { cle, mois, transactions, idx, filtre } = opts
  const rang = new Map(mois.map((m, i) => [m, i]))
  const retenues = transactions.filter((tx) => {
    if (!rang.has(moisBudget(tx.date)) || !correspond(filtre, titulaireDe(tx, idx))) return false
    const c = classer(tx, idx)
    return (c.type === 'ligne' ? c.ligne : c.type === 'non_classe' ? NON_CLASSE : null) === cle
  })
  const parPeriode = (g: GroupeIntitules): GroupePeriode => {
    const parMois = mois.map(() => 0)
    for (const tx of g.operations) parMois[rang.get(moisBudget(tx.date))!]! -= Number(tx.amount)
    const { sousGroupes, ...reste } = g
    return {
      ...reste, parMois, moyenne: mois.length ? g.total / mois.length : 0,
      ...(sousGroupes ? { sousGroupes: trier(sousGroupes.map(parPeriode)) } : {}),
    }
  }
  const trier = (gs: GroupePeriode[]) => gs.sort((a, b) => b.moyenne - a.moyenne || a.nom.localeCompare(b.nom, 'fr'))
  return trier(grouperParIntitule(retenues, opts.groupes, opts.libelleLocal).map(parPeriode))
}

// ---------- Patrimoine ----------

export function patrimoine(accounts: FinAccount[], avecCrypto = true) {
  const actifs = accounts.filter((a) => !a.archived && (avecCrypto || a.kind !== 'crypto'))
  const parGenre = new Map<FinAccountKind, number>()
  for (const a of actifs) parGenre.set(a.kind, (parGenre.get(a.kind) ?? 0) + Number(a.balance))
  const brut = actifs.filter((a) => Number(a.balance) > 0).reduce((s, a) => s + Number(a.balance), 0)
  const dettes = actifs.filter((a) => Number(a.balance) < 0).reduce((s, a) => s - Number(a.balance), 0)
  return {
    brut, dettes, net: brut - dettes,
    parGenre: [...parGenre].map(([kind, valeur]) => ({ kind, valeur })).sort((a, b) => b.valeur - a.valeur),
  }
}

// ---------- Composition du patrimoine ----------

export type ComposantePatrimoine = 'immobilier' | 'investissements' | 'metaux' | 'liquidites' | 'crypto'

/** Composantes du graphique, de bas en haut (palette validée sur le fond sombre). */
export const COMPOSANTES: { cle: ComposantePatrimoine; label: string; couleur: string }[] = [
  { cle: 'immobilier', label: 'Immobilier (net des prêts)', couleur: 'var(--color-dom-6)' },
  { cle: 'investissements', label: 'Investissements', couleur: 'var(--color-dom-5)' },
  { cle: 'metaux', label: 'Métaux précieux', couleur: 'var(--color-dom-1)' },
  { cle: 'liquidites', label: 'Comptes & épargne', couleur: 'var(--color-dom-2)' },
  { cle: 'crypto', label: 'Crypto', couleur: 'var(--color-dom-4)' },
]

export interface PointComposition {
  date: string
  parts: Record<ComposantePatrimoine, number> | null   // null : composition inconnue pour ce jour
  total: number
}

/**
 * Historique réécrit d'après les valeurs retenues dans Horizon :
 * - immobilier : chaque bien compte sa valeur d'aujourd'hui (saisie ou Finary) depuis sa
 *   date d'achat — une réévaluation ne crée plus de marche dans le passé ;
 * - prêt saisi : l'écart avec Finary s'applique à partir du jour de la saisie.
 */
export function reecriturePatrimoine(accounts: FinAccount[]) {
  const biens = accounts.filter((a) => !a.archived && a.kind === 'immobilier')
  const pretsSaisis = accounts.filter((a) => !a.archived && a.kind === 'pret' && a.balance_manual_at && a.balance_source !== null)
  return {
    /** Valeur des biens détenus à cette date ; null sans bien (on garde la série Finary). */
    immobilier: (date: string) => biens.length
      ? biens.reduce((s, a) => s + (!a.acquired_on || a.acquired_on <= date ? Number(a.balance) : 0), 0)
      : null,
    /** À ajouter au capital restant dû de Finary (prêts en positif). */
    ecartPrets: (date: string) => pretsSaisis.reduce((s, a) =>
      s + (a.balance_manual_at!.slice(0, 10) <= date ? Number(a.balance_source) - Number(a.balance) : 0), 0),
  }
}

/**
 * Patrimoine dans le temps, par composante. Sans la crypto (trop variable), le
 * total l'exclut aussi. L'immobilier est compté net des prêts. Avec les comptes,
 * l'immobilier et les prêts saisis sont réécrits (`reecriturePatrimoine`).
 */
export function compositionPatrimoine(
  points: { date: string; net: number; immobilier: number | null; prets: number | null; investissements: number | null;
    metaux: number | null; liquidites: number | null; crypto: number | null }[],
  avecCrypto: boolean,
  accounts: FinAccount[] = [],
): PointComposition[] {
  const r = reecriturePatrimoine(accounts)
  return points.map((p) => {
    if (p.immobilier === null || p.investissements === null) {
      // Ancien point sans composition : le total seul (sans crypto, on ne peut pas la retirer).
      return { date: p.date, parts: null, total: Number(p.net) }
    }
    const parts = {
      immobilier: (r.immobilier(p.date) ?? Number(p.immobilier)) - (Number(p.prets ?? 0) + r.ecartPrets(p.date)),
      investissements: Number(p.investissements),
      metaux: Number(p.metaux ?? 0),
      liquidites: Number(p.liquidites ?? 0),
      crypto: avecCrypto ? Number(p.crypto ?? 0) : 0,
    }
    return { date: p.date, parts, total: Object.values(parts).reduce((s, v) => s + v, 0) }
  })
}

// ---------- Allocation ----------

export interface LigneAllocation {
  classe: FinAssetClass
  valeur: number
  pct: number                 // part du portefeuille suivi
  cible: number | null
  ecart: number | null        // en points de %
  aAjuster: number | null     // montant pour atteindre la cible (positif = à renforcer)
}

/**
 * Allocation réelle face à la cible. Le « portefeuille suivi » = les classes
 * qui ont une cible ; les autres sont montrées à part, sans jugement.
 */
export function allocation(holdings: FinHolding[], targets: FinTarget[], accounts: FinAccount[]) {
  const archives = new Set(accounts.filter((a) => a.archived).map((a) => a.id))
  const parClasse = new Map<FinAssetClass, number>()
  for (const h of holdings) {
    if (archives.has(h.account_id)) continue
    parClasse.set(h.asset_class, (parClasse.get(h.asset_class) ?? 0) + Number(h.value))
  }
  const cibles = new Map(targets.map((t) => [t.asset_class, Number(t.pct)]))
  const suivi = [...cibles.keys()].reduce((s, c) => s + (parClasse.get(c) ?? 0), 0)
  const suivies: LigneAllocation[] = [...cibles].map(([classe, cible]) => {
    const valeur = parClasse.get(classe) ?? 0
    const pct = suivi ? (valeur / suivi) * 100 : 0
    return { classe, valeur, pct, cible, ecart: pct - cible, aAjuster: (cible / 100) * suivi - valeur }
  }).sort((a, b) => (b.cible ?? 0) - (a.cible ?? 0) || b.valeur - a.valeur)
  const horsCible = [...parClasse].filter(([c, v]) => !cibles.has(c) && v)
    .map(([classe, valeur]) => ({ classe, valeur })).sort((a, b) => b.valeur - a.valeur)
  return { suivi, suivies, horsCible, totalCibles: [...cibles.values()].reduce((s, v) => s + v, 0) }
}

// ---------- Dépenses à venir ----------

/**
 * Ce qu'il reste à mettre de côté pour une dépense prévue, et combien par mois
 * d'ici là (du mois courant au mois qui précède l'échéance ; tout de suite si
 * l'échéance est ce mois-ci ou passée).
 */
export function provision(p: FinPlanned, aujourdhui: string): { restant: number; mois: number; parMois: number } {
  const restant = Math.max(0, Number(p.amount) - Number(p.saved))
  if (p.done) return { restant: 0, mois: 0, parMois: 0 }
  const mois = Math.max(0, ecartMois(moisDe(aujourdhui), moisDe(p.due_date)))
  return { restant, mois, parMois: mois > 0 ? restant / mois : restant }
}

/** Opération « en attente » : marquée par la banque (pending) ou, pour la carte Crypto.com, note « en attente… ». */
export function estEnAttente(tx: Pick<FinTransaction, 'pending' | 'note'>): boolean {
  return !!tx.pending || /^\s*en attente/i.test(tx.note ?? '')
}
