// ================================================================
// Entraînement — programme A/B (full body) et déroulé d'une séance.
// Règles pures, sans réseau : testées dans programme.test.ts.
// Pour changer un exercice, une série ou un temps de repos : c'est ici.
// ================================================================

export type SeanceId = 'A' | 'B'
export type Mesure = 'charge' | 'poids_du_corps' | 'duree'

export interface SpecSerie {
  label: string
  min?: number
  max?: number
  /** Série d'échauffement (non comptée dans le suivi). */
  echauffement?: boolean
  /** Part de la charge de travail (séries d'échauffement). */
  pct?: number
  /** Charge fixe conseillée, en kg. */
  kg?: number
  /** Répétitions fixes (échauffement). */
  reps?: number
  /** Durée cible en secondes (gainage). */
  secondes?: number
  optionnelle?: boolean
}

export interface Exercice {
  id: string
  nom: string
  mesure: Mesure
  /** Repos après une série de travail, en secondes. */
  repos: number
  parCote?: boolean
  /** Pas d'augmentation automatique de la charge (abdos au poids du corps). */
  sansProgression?: boolean
  consigne?: string
  series: SpecSerie[]
}

export interface ItemEchauffement {
  id: string
  titre: string
  detail: string
  secondes?: number
  repos?: number
}

const REPOS_ECHAUFFEMENT = 45

const degressif = (): SpecSerie[] => [
  { label: '4-6', min: 4, max: 6 },
  { label: '6-8', min: 6, max: 8 },
  { label: '8-10', min: 8, max: 10 },
  { label: '10-12 (optionnelle)', min: 10, max: 12, optionnelle: true },
]
const trois = (s: SpecSerie): SpecSerie[] => [{ ...s }, { ...s }, { ...s }]
const hypertrophie = () => trois({ label: '8-12', min: 8, max: 12 })
const ech = (pct: number, reps: number, label?: string): SpecSerie => ({
  label: label ?? `${Math.round(pct * 100)} % × ${reps}`,
  echauffement: true,
  pct,
  reps,
})

export const EXERCICES = {
  couche: {
    id: 'couche', nom: 'Développé couché', mesure: 'charge', repos: 150,
    consigne: 'Omoplates serrées, pieds ancrés, barre au bas des pectoraux.',
    series: [ech(0.4, 8), ech(0.6, 5), ech(0.8, 3), ...degressif()],
  },
  tractions: {
    id: 'tractions', nom: 'Tractions lestées', mesure: 'poids_du_corps', repos: 150,
    consigne: 'Descente complète, poitrine vers la barre.',
    series: [ech(0, 5, 'Poids du corps × 5'), ech(0.5, 3, 'Moitié du lest × 3'), ...hypertrophie()],
  },
  sdt: {
    id: 'sdt', nom: 'Soulevé de terre', mesure: 'charge', repos: 150,
    consigne: 'Dos neutre, barre contre les tibias, pousser le sol.',
    series: [ech(0.4, 5), ech(0.6, 3), ech(0.8, 2), ...degressif().slice(0, 3)],
  },
  legext: {
    id: 'legext', nom: 'Leg extension', mesure: 'charge', repos: 0,
    series: [ech(0.5, 12, 'Léger × 12'), ...trois({ label: '12-15', min: 12, max: 15 })],
  },
  legcurl: {
    id: 'legcurl', nom: 'Leg curl', mesure: 'charge', repos: 90,
    series: [ech(0.5, 12, 'Léger × 12'), ...trois({ label: '12-15', min: 12, max: 15 })],
  },
  releves: {
    id: 'releves', nom: 'Relevés de jambes suspendu', mesure: 'poids_du_corps', repos: 60, sansProgression: true,
    consigne: 'Enrouler le bassin, sans balancer.',
    series: trois({ label: '8-12', min: 8, max: 12 }),
  },
  planche: {
    id: 'planche', nom: 'Gainage planche', mesure: 'duree', repos: 60,
    consigne: 'Fessiers serrés, bassin rétroversé, nombril rentré.',
    series: trois({ label: '30-45 s', secondes: 40, min: 30, max: 45 }),
  },
  militaire: {
    id: 'militaire', nom: 'Développé militaire', mesure: 'charge', repos: 150,
    consigne: 'Fessiers et abdos serrés, ne pas cambrer.',
    series: [ech(0, 10, 'Barre à vide × 10'), ech(0.5, 5), ech(0.75, 3), ...degressif()],
  },
  rowing: {
    id: 'rowing', nom: 'Rowing barre', mesure: 'charge', repos: 90,
    consigne: 'Buste penché, tirer vers le nombril.',
    series: [ech(0.5, 8), ...hypertrophie()],
  },
  incline: {
    id: 'incline', nom: 'Développé incliné', mesure: 'charge', repos: 90,
    series: [ech(0.6, 5), ...hypertrophie()],
  },
  fentes: {
    id: 'fentes', nom: 'Fentes haltères (par côté)', mesure: 'charge', repos: 90,
    consigne: 'Descente lente, genou dans l’axe du pied, pas modéré.',
    series: [
      { label: 'Poids du corps × 8', echauffement: true, kg: 0, reps: 8 },
      { label: '2 × 10 kg × 6', echauffement: true, kg: 20, reps: 6 },
      ...trois({ label: '10-12 par côté', min: 10, max: 12 }),
    ],
  },
  roue: {
    id: 'roue', nom: 'Roue abdominale', mesure: 'poids_du_corps', repos: 60, sansProgression: true,
    consigne: 'Bassin rétroversé, ne pas creuser le bas du dos.',
    series: trois({ label: '8-10', min: 8, max: 10 }),
  },
  lateral: {
    id: 'lateral', nom: 'Gainage latéral', mesure: 'duree', repos: 60, parCote: true,
    series: trois({ label: '30 s par côté', secondes: 30, min: 30, max: 30 }),
  },
} satisfies Record<string, Exercice>

export type ExerciceId = keyof typeof EXERCICES

/** Blocs de chaque séance : un bloc à deux exercices est un superset. */
export const SEANCES: Record<SeanceId, { titre: string; duree: string; blocs: ExerciceId[][] }> = {
  A: {
    titre: 'Séance A',
    duree: 'environ 1 h 15',
    blocs: [['couche'], ['tractions'], ['sdt'], ['legext', 'legcurl'], ['releves'], ['planche']],
  },
  B: {
    titre: 'Séance B',
    duree: 'environ 1 h 10',
    blocs: [['militaire'], ['rowing'], ['incline'], ['fentes'], ['roue'], ['lateral']],
  },
}

export const ECHAUFFEMENT_GENERAL: ItemEchauffement[] = [
  { id: 'rameur', titre: 'Rameur', detail: 'Allure modérée, monter progressivement.', secondes: 300, repos: 15 },
  { id: 'balanc-av', titre: 'Balancements de jambe avant-arrière', detail: '10 par jambe, en se tenant à un appui.' },
  { id: 'balanc-lat', titre: 'Balancements de jambe latéraux', detail: '10 par jambe : prépare les adducteurs.' },
  { id: 'epaules', titre: 'Rotations d’épaules', detail: '10 passages avec élastique ou bâton.' },
  { id: 'dos', titre: 'Dos rond / dos creux', detail: '10 répétitions lentes, à quatre pattes.' },
  { id: 'squats', titre: 'Squats au poids du corps', detail: '10 répétitions, amplitude complète.' },
  { id: 'vacuum-1', titre: 'Vacuum (1/3)', detail: 'Rentrer le nombril au maximum, respirer doucement.', secondes: 20, repos: 15 },
  { id: 'vacuum-2', titre: 'Vacuum (2/3)', detail: 'Rentrer le nombril au maximum, respirer doucement.', secondes: 20, repos: 15 },
  { id: 'vacuum-3', titre: 'Vacuum (3/3)', detail: 'Rentrer le nombril au maximum, respirer doucement.', secondes: 20, repos: 10 },
  { id: 'deadbug', titre: 'Dead bug', detail: '2 × 8 par côté, lombaires collées au sol.' },
  { id: 'hanche-g', titre: 'Étirement fléchisseur de hanche — gauche', detail: 'En fente, genou gauche au sol, bassin rétroversé.', secondes: 30, repos: 5 },
  { id: 'hanche-d', titre: 'Étirement fléchisseur de hanche — droite', detail: 'En fente, genou droit au sol, bassin rétroversé.', secondes: 30, repos: 15 },
]

export type EtapeEchauffement = {
  type: 'echauffement'
  id: string
  bloc: string
  titre: string
  detail: string
  secondes?: number
  repos: number
}
export type EtapeSerie = {
  type: 'serie'
  id: string
  bloc: string
  exercice: Exercice
  spec: SpecSerie
  /** Numéro de série de travail (1, 2, 3…) ; absent pour un échauffement. */
  numero?: number
  cote?: 'gauche' | 'droit'
  repos: number
}
export type Etape = EtapeEchauffement | EtapeSerie

/** Étapes d'une série donnée (deux étapes pour un gainage par côté). */
function etapesSerie(ex: Exercice, bloc: string, i: number, reposForce?: number): EtapeSerie[] {
  const spec = ex.series[i]
  if (!spec) return []
  const numero = spec.echauffement ? undefined : ex.series.slice(0, i + 1).filter((s) => !s.echauffement).length
  const repos = reposForce ?? (spec.echauffement ? REPOS_ECHAUFFEMENT : ex.repos)
  const base = { type: 'serie' as const, bloc, exercice: ex, spec, numero }
  if (ex.mesure === 'duree' && ex.parCote) {
    return [
      { ...base, id: `${ex.id}-${i}-g`, cote: 'gauche', repos: 5 },
      { ...base, id: `${ex.id}-${i}-d`, cote: 'droit', repos },
    ]
  }
  return [{ ...base, id: `${ex.id}-${i}`, repos }]
}

/** Déroulé complet d'une séance : échauffement général puis chaque bloc. */
export function etapesSeance(seance: SeanceId): Etape[] {
  const etapes: Etape[] = ECHAUFFEMENT_GENERAL.map((w) => ({
    type: 'echauffement' as const,
    id: `ech-${w.id}`,
    bloc: 'Échauffement général',
    titre: w.titre,
    detail: w.detail,
    secondes: w.secondes,
    repos: w.repos ?? 0,
  }))

  for (const ids of SEANCES[seance].blocs) {
    const exs: Exercice[] = ids.map((id) => EXERCICES[id])
    const [a, b] = exs
    if (!a) continue
    if (!b) {
      a.series.forEach((_, i) => etapes.push(...etapesSerie(a, a.nom, i)))
      continue
    }
    // Superset : on alterne les deux exercices, le repos tombe après le second.
    const bloc = `Superset : ${a.nom} + ${b.nom}`
    const n = Math.max(a.series.length, b.series.length)
    for (let i = 0; i < n; i++) {
      etapes.push(...etapesSerie(a, bloc, i, b.series[i] ? 0 : undefined))
      etapes.push(...etapesSerie(b, bloc, i))
    }
  }
  const derniere = etapes[etapes.length - 1]
  if (derniere) etapes[etapes.length - 1] = { ...derniere, repos: 0 }
  return etapes
}

/** Arrondi à la charge réalisable avec des disques de 1,25 kg de chaque côté. */
export const arrondiDisque = (kg: number) => Math.round(kg / 2.5) * 2.5

export const libelleEtape = (e: Etape) => {
  if (e.type === 'echauffement') return e.titre
  const cote = e.cote ? ` (${e.cote})` : ''
  return e.spec.echauffement
    ? `${e.exercice.nom} — échauffement ${e.spec.label}`
    : `${e.exercice.nom} — série ${e.numero} : ${e.spec.label}${cote}`
}
