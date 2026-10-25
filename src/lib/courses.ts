// ================================================================
// Courses : tri automatique des articles dans la liste « Courses ».
// Règle = table de mots-clés français par catégorie (ci-dessous). Pur, testable.
//   - plusieurs articles d'un coup, séparés par virgule, point-virgule ou retour ligne ;
//   - l'expression la plus longue l'emporte, puis le mot le plus à gauche (« jus d'orange » → Boissons) ;
//   - « bio » dans le texte bascule vers l'onglet Bio ;
//   - pas de doublon avec ce qui est déjà dans la liste.
// ================================================================
import type { ShoppingItem, ShoppingList, ShoppingSection } from './types'

export interface Rayon { section: ShoppingSection; category: string | null }
export interface ArticleClasse extends Rayon { label: string }

/** Rayon des viandes : l'onglet « Boucherie » de la liste (une seule ligne à changer). */
const BOUCHERIE: Rayon = { section: 'boucherie', category: null }
/** Aucun mot reconnu : alimentaire, sans catégorie (affiché en fin de liste, sans titre). */
export const RAYON_DEFAUT: Rayon = { section: 'alimentaire', category: null }

const ali = (category: string): Rayon => ({ section: 'alimentaire', category })
const nonAli = (category: string): Rayon => ({ section: 'non_alimentaire', category })

/** Table de tri : rayon → mots-clés (au singulier, sans accent). */
export const REGLES_COURSES: { rayon: Rayon; mots: string[] }[] = [
  { rayon: ali('Fruits'), mots: [
    'fruit', 'fruits rouges', 'pomme', 'poire', 'banane', 'orange', 'citron', 'citron vert', 'clementine', 'mandarine', 'kiwi',
    'fraise', 'framboise', 'myrtille', 'mure', 'cassis', 'cerise', 'raisin', 'peche', 'nectarine', 'abricot', 'prune', 'melon',
    'pasteque', 'ananas', 'mangue', 'avocat', 'figue', 'pamplemousse', 'grenade', 'litchi', 'papaye', 'fruit de la passion'] },
  { rayon: ali('Légumes'), mots: [
    'legume', 'tomate', 'carotte', 'courgette', 'aubergine', 'poivron', 'oignon', 'echalote', 'ail', 'salade', 'laitue', 'mache',
    'roquette', 'epinard', 'brocoli', 'chou', 'chou fleur', 'chou rouge', 'haricot vert', 'poireau', 'champignon', 'concombre',
    'radis', 'celeri', 'betterave', 'pomme de terre', 'patate', 'patate douce', 'potiron', 'courge', 'butternut', 'endive',
    'fenouil', 'asperge', 'petit pois', 'mais', 'artichaut', 'navet', 'panais', 'persil', 'basilic', 'coriandre', 'menthe',
    'ciboulette', 'gingembre', 'herbe fraiche'] },
  { rayon: BOUCHERIE, mots: [
    'viande', 'poulet', 'blanc de poulet', 'cuisse de poulet', 'boeuf', 'veau', 'porc', 'agneau', 'dinde', 'canard', 'magret',
    'lapin', 'steak', 'steak hache', 'viande hachee', 'escalope', 'cote de porc', 'cote de boeuf', 'entrecote', 'bavette', 'rosbif',
    'roti', 'gigot', 'saucisse', 'chipolata', 'merguez', 'boudin', 'jambon', 'lardon', 'bacon', 'saucisson', 'chorizo', 'cordon bleu',
    'nugget', 'paupiette', 'travers', 'cote', 'filet mignon', 'osso buco', 'joue de boeuf'] },
  { rayon: ali('Poissons'), mots: [
    'poisson', 'saumon', 'thon', 'cabillaud', 'colin', 'lieu', 'merlu', 'sardine', 'maquereau', 'truite', 'dorade', 'bar', 'sole',
    'crevette', 'gambas', 'moule', 'huitre', 'calamar', 'saint jacques', 'surimi', 'haddock', 'lotte', 'fruits de mer', 'crabe', 'langoustine'] },
  { rayon: ali('Frais'), mots: [
    'lait', 'yaourt', 'yogourt', 'fromage', 'fromage blanc', 'fromage rape', 'beurre', 'creme', 'creme fraiche', 'oeuf', 'mozzarella',
    'parmesan', 'emmental', 'gruyere', 'camembert', 'brie', 'chevre', 'comte', 'raclette', 'reblochon', 'feta', 'skyr', 'faisselle',
    'margarine', 'dessert lacte', 'houmous', 'tzatziki', 'pate feuilletee', 'pate brisee', 'pate a pizza', 'tofu', 'ricotta', 'mascarpone'] },
  { rayon: ali('Boulangerie'), mots: [
    'pain', 'baguette', 'brioche', 'croissant', 'pain au chocolat', 'pain de mie', 'viennoiserie', 'tortilla', 'wrap', 'pita',
    'bun', 'pain burger', 'biscotte', 'pain complet', 'pain aux cereales'] },
  { rayon: ali('Épicerie'), mots: [
    'pate', 'spaghetti', 'tagliatelle', 'penne', 'macaroni', 'coquillette', 'riz', 'semoule', 'couscous', 'boulgour', 'ble', 'quinoa',
    'lentille', 'pois chiche', 'haricot rouge', 'haricot blanc', 'cereale', 'muesli', 'flocon d avoine', 'farine', 'sucre', 'levure',
    'maizena', 'conserve', 'boite de thon', 'bouillon', 'soupe', 'puree', 'polenta', 'passata', 'sauce tomate', 'coulis', 'nouille',
    'tapioca', 'cacao', 'compote', 'lait de coco', 'concentre de tomate', 'cracker'] },
  { rayon: ali('Condiments'), mots: [
    'huile', 'huile d olive', 'huile de tournesol', 'vinaigre', 'vinaigre balsamique', 'sel', 'poivre', 'moutarde', 'ketchup', 'mayonnaise',
    'epice', 'sauce', 'sauce soja', 'curry', 'paprika', 'cumin', 'cannelle', 'herbes de provence', 'cornichon', 'olive', 'bouillon cube',
    'piment', 'tabasco', 'pesto', 'cube de bouillon', 'vanille'] },
  { rayon: ali('Boissons'), mots: [
    'eau', 'eau gazeuse', 'jus', 'jus d orange', 'jus de pomme', 'soda', 'coca', 'limonade', 'sirop', 'biere', 'vin', 'cidre', 'champagne',
    'whisky', 'boisson', 'cafe', 'the', 'tisane', 'infusion', 'capsule', 'ice tea', 'orangina', 'perrier'] },
  { rayon: ali('Surgelés'), mots: [
    'surgele', 'glace', 'pizza', 'frite', 'poisson pane', 'legume surgele', 'epinard surgele', 'sorbet', 'steak surgele', 'petit pois surgele'] },
  { rayon: ali('Snacks & douceurs'), mots: [
    'biscuit', 'chocolat', 'bonbon', 'gateau', 'confiture', 'miel', 'pate a tartiner', 'nutella', 'madeleine', 'speculoos', 'chips',
    'cacahuete', 'noix', 'amande', 'noisette', 'pistache', 'fruit sec', 'barre de cereales', 'pain d epices', 'galette', 'cookie', 'tablette de chocolat'] },
  { rayon: nonAli('Hygiène'), mots: [
    'dentifrice', 'brosse a dent', 'savon', 'shampoing', 'shampooing', 'gel douche', 'deodorant', 'coton', 'coton tige', 'papier toilette',
    'mouchoir', 'rasoir', 'creme solaire', 'creme hydratante', 'serviette hygienique', 'tampon', 'couche', 'lingette', 'fil dentaire', 'bain de bouche',
    'apres shampoing', 'lait corporel', 'parfum', 'gant de toilette', 'demaquillant'] },
  { rayon: nonAli('Entretien'), mots: [
    'lessive', 'adoucissant', 'liquide vaisselle', 'produit vaisselle', 'pastille lave vaisselle', 'tablette lave vaisselle', 'eponge', 'sopalin',
    'essuie tout', 'sac poubelle', 'javel', 'nettoyant', 'produit menager', 'detergent', 'degraissant', 'anticalcaire', 'papier alu', 'papier aluminium',
    'film alimentaire', 'papier cuisson', 'sac congelation', 'gant', 'gant menage', 'serpillere', 'balai', 'desodorisant', 'lave vitre', 'wc'] },
  { rayon: nonAli('Maison'), mots: [
    'pile', 'ampoule', 'bougie', 'allumette', 'briquet', 'ruban adhesif', 'scotch', 'colle', 'piles', 'rallonge', 'multiprise', 'cahier', 'stylo', 'enveloppe',
    'timbre poste', 'plante', 'terreau', 'croquette', 'litiere'] },
]

/** Catégories proposables dans le panneau, par onglet. */
export const CHOIX_RAYONS: { section: ShoppingSection; label: string; categories: (string | null)[] }[] = [
  { section: 'alimentaire', label: 'Alimentaire',
    categories: ['Fruits', 'Légumes', 'Poissons', 'Frais', 'Boulangerie', 'Épicerie', 'Condiments', 'Boissons', 'Surgelés', 'Snacks & douceurs', null] },
  { section: 'bio', label: 'Bio', categories: ['Fruits', 'Légumes', null] },
  { section: 'boucherie', label: 'Boucherie', categories: [null] },
  { section: 'non_alimentaire', label: 'Non-alimentaire', categories: ['Hygiène', 'Entretien', 'Maison', null] },
]

export const SECTION_LABELS: Record<ShoppingSection, string> = {
  alimentaire: 'Alimentaire', bio: 'Bio', non_alimentaire: 'Non-alimentaire', boucherie: 'Boucherie',
}

export const cleRayon = (r: Rayon): string => `${r.section}|${r.category ?? ''}`
export const rayonDeCle = (k: string): Rayon => {
  const [section, category] = k.split('|')
  return { section: section as ShoppingSection, category: category || null }
}
export const libelleRayon = (r: Rayon): string =>
  r.category ? `${SECTION_LABELS[r.section]} · ${r.category}` : `${SECTION_LABELS[r.section]} · Autre`

// ---- Normalisation ---------------------------------------------------------

/** Mots d'un texte : minuscules, sans accent ni ponctuation, pluriels simplifiés (« pommes » = « pomme »). */
export function mots(texte: string): string[] {
  return texte
    .toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((m) => (m.length > 3 && /[sx]$/.test(m) ? m.slice(0, -1) : m))
}

/** Clé de comparaison d'un libellé (pour repérer les doublons). */
export const cleLibelle = (label: string): string => mots(label).join(' ')

const TABLE = REGLES_COURSES.flatMap((r) => r.mots.map((m) => ({ rayon: r.rayon, mots: mots(m) })))

/** Position du motif dans le texte (en mots), ou -1. */
function position(texte: string[], motif: string[]): number {
  if (motif.length === 0 || motif.length > texte.length) return -1
  for (let i = 0; i + motif.length <= texte.length; i++) {
    if (motif.every((m, j) => texte[i + j] === m)) return i
  }
  return -1
}

/** Rayon d'un article d'après la table (le mot-clé le plus long gagne ; défaut : alimentaire). */
export function rayonPourArticle(label: string): Rayon {
  const t = mots(label)
  const bio = t.includes('bio')
  // Priorité : expression la plus longue (en mots), puis mot le plus à gauche (en français le nom
  // principal vient d'abord : « jus de raisin » = jus, « compote de pomme » = compote), puis le plus long.
  let meilleur: { rayon: Rayon; poids: number } | null = null
  for (const e of TABLE) {
    const pos = position(t, e.mots)
    if (pos < 0) continue
    const poids = e.mots.length * 10000 - pos * 100 + e.mots.join(' ').length
    if (!meilleur || poids > meilleur.poids) meilleur = { rayon: e.rayon, poids }
  }
  const rayon = meilleur?.rayon ?? RAYON_DEFAUT
  if (!bio) return rayon
  // « bio » : onglet Bio, sous-groupe seulement pour fruits et légumes (comme la liste existante)
  const garde = rayon.category === 'Fruits' || rayon.category === 'Légumes'
  return { section: 'bio', category: garde ? rayon.category : null }
}

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Texte tapé → articles (virgule, point-virgule ou retour ligne), propres et sans doublon interne. */
export function decouperArticles(texte: string): string[] {
  const vus = new Set<string>()
  const out: string[] = []
  for (const brut of texte.split(/[,;\n]+/)) {
    const label = majuscule(brut.replace(/\s+/g, ' ').trim())
    const cle = cleLibelle(label)
    if (!cle || vus.has(cle)) continue
    vus.add(cle)
    out.push(label)
  }
  return out
}

/** Libellé affiché : on retire le mot « bio » (l'onglet Bio le dit déjà), sauf s'il est seul. */
export function libelleSansBio(label: string, rayon: Rayon): string {
  if (rayon.section !== 'bio') return label
  const sans = label.replace(/\bbio\b/gi, '').replace(/\s+/g, ' ').trim()
  return sans ? majuscule(sans) : label
}

export function classerArticle(label: string): ArticleClasse {
  const rayon = rayonPourArticle(label)
  return { label: majuscule(libelleSansBio(label, rayon)), ...rayon }
}

/** Les articles bio se distinguent des autres (une « Lessive » bio et une « Lessive » classique coexistent). */
const familleDe = (section: string | null) => (section === 'bio' ? 'bio' : 'std')

export interface PlanCourses {
  /** À créer, avec leur rayon final (choix de l'utilisateur ou règle). */
  aAjouter: ArticleClasse[]
  /** Déjà dans la liste mais cochés (achetés) : on les décoche au lieu de les recréer. */
  aRemettre: ShoppingItem[]
  /** Déjà dans la liste, non cochés : ignorés. */
  doublons: string[]
}

/**
 * Prépare l'ajout. `choix` permet de forcer le rayon d'un article (clé = libellé tel que découpé).
 * Un article déjà présent (même mot, même famille bio / non-bio, n'importe quel onglet) n'est pas recréé.
 */
export function planifierAjout(
  texte: string, existants: ShoppingItem[], choix: Record<string, Rayon> = {},
): PlanCourses {
  const plan: PlanCourses = { aAjouter: [], aRemettre: [], doublons: [] }
  for (const brut of decouperArticles(texte)) {
    const auto = classerArticle(brut)
    const rayon = choix[brut] ?? auto
    const label = choix[brut] ? libelleSansBio(brut, choix[brut]) : auto.label
    const cle = cleLibelle(label)
    const deja = existants.find((e) => cleLibelle(e.label) === cle && familleDe(e.section) === familleDe(rayon.section))
    if (deja) {
      if (deja.checked) plan.aRemettre.push(deja)
      else plan.doublons.push(deja.label)
      continue
    }
    plan.aAjouter.push({ label, section: rayon.section, category: rayon.category })
  }
  return plan
}

/** La liste « Courses » de l'utilisateur (sans tenir compte de la casse ni des accents). */
export function trouverListeCourses(listes: ShoppingList[]): ShoppingList | null {
  return listes.find((l) => cleLibelle(l.name) === 'course') ?? null
}
