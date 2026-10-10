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
  FinTarget, FinTransaction, FinLabel, FinGroup, FinEcheance,
} from './types'

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
    const m = moisDe(tx.date)
    let mois = agg.get(m)
    if (!mois) { mois = { lignes: new Map(), entrees: 0 }; agg.set(m, mois) }
    const montant = Number(tx.amount)
    if (c.type === 'revenu') { mois.entrees += montant; continue }
    const cle = c.type === 'ligne' ? c.ligne : NON_CLASSE
    mois.lignes.set(cle, (mois.lignes.get(cle) ?? 0) - montant)
  }
  return agg
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
    const i = rang.get(moisDe(tx.date))
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
}): { total: number; details: { nom: string; montant: number }[] } {
  const vide = { total: 0, details: [] }
  if (opts.mois < opts.moisCourant) return vide
  const ligneNommee = (nom: string) => opts.lines.find((l) => memeNom(l.name, nom))?.id ?? null
  const fixes = ligneNommee('Frais fixe')
  const courses = ligneNommee('Courses')
  const precedents = [1, 2, 3].map((n) => decaleMois(opts.mois, -n))
  const rang = new Map(precedents.map((m, i) => [m, i]))
  const charges = new Map<string, { nom: string; parMois: number[]; ceMois: boolean }>()
  const coursesParMois = [0, 0, 0]
  let coursesCeMois = 0
  for (const tx of opts.transactions) {
    if (!correspond(opts.filtre, titulaireDe(tx, opts.idx))) continue
    const c = classer(tx, opts.idx)
    if (c.type !== 'ligne') continue
    const m = moisDe(tx.date)
    const i = rang.get(m)
    if (c.ligne === courses) {
      if (i !== undefined) coursesParMois[i]! -= Number(tx.amount)
      else if (m === opts.mois) coursesCeMois -= Number(tx.amount)
    } else if (c.ligne === fixes && (i !== undefined || m === opts.mois)) {
      const { cle, nom } = cleGroupe(tx.label)
      const g = charges.get(cle) ?? { nom, parMois: [0, 0, 0], ceMois: false }
      if (i !== undefined) g.parMois[i]! -= Number(tx.amount)
      else g.ceMois = true
      charges.set(cle, g)
    }
  }
  const details = [...charges.values()]
    .filter((g) => !g.ceMois && g.parMois.every((v) => v > 0))
    .map((g) => ({ nom: g.nom, montant: g.parMois.reduce((s, v) => s + v, 0) / 3 }))
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
    if (moisDe(tx.date) !== mois || !correspond(filtre, titulaireDe(tx, idx))) continue
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
export function creerReconnaissance(regles: FinLabel[]) {
  const parMotif = new Map(regles.filter((r) => r.pattern.trim()).map((r) => [r.pattern.trim(), r]))
  const regleDe = (label: string): FinLabel | null => parMotif.get(normaliserLibelle(label)) ?? null
  return {
    regleDe,
    /** Ce qu'on affiche pour une opération. */
    libelle: (tx: FinTransaction): string => tx.label_local?.trim() || regleDe(tx.label)?.label || tx.label,
    /** Vrai si l'opération a un intitulé local (propre ou par règle). */
    estLocal: (tx: FinTransaction): boolean => !!tx.label_local?.trim() || !!regleDe(tx.label),
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
  /** Groupe manuel : ses opérations regroupées à leur tour par intitulé semblable
   *  (absent s'il n'y en a qu'un : les opérations s'affichent alors directement). */
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
    const sous = g.manuel ? grouperParIntitule(g.operations, [], libelleLocal) : []
    return {
      ...g,
      nom: g.manuel || enseigne ? g.nom : local?.trim() || nomAuto,
      operations: g.operations.sort((a, b) => b.date.localeCompare(a.date)),
      ...(sous.length > 1 ? { sousGroupes: sous } : {}),
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
    if (!rang.has(moisDe(tx.date)) || !correspond(filtre, titulaireDe(tx, idx))) return false
    const c = classer(tx, idx)
    return (c.type === 'ligne' ? c.ligne : c.type === 'non_classe' ? NON_CLASSE : null) === cle
  })
  const parPeriode = (g: GroupeIntitules): GroupePeriode => {
    const parMois = mois.map(() => 0)
    for (const tx of g.operations) parMois[rang.get(moisDe(tx.date))!]! -= Number(tx.amount)
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
