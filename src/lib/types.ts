// ================================================================
// HORIZON — types alignés sur le schéma Supabase (source de vérité)
// ================================================================

export type UUID = string

export interface Domain {
  id: UUID
  user_id: UUID
  name: string
  color: string
  icon: string
  sort_order: number
  created_at: string
}

export type ObjectiveHorizon = 'court_terme' | 'annuel' | 'trimestriel' | 'long_terme' | 'libre'
export type ObjectiveStatus = 'actif' | 'atteint' | 'abandonne'

export interface ObjectiveCriterion {
  label: string
  done: boolean
}

export type ObjectiveGranularity = 'jour' | 'semaine' | 'mois'

export interface Objective {
  id: UUID
  user_id: UUID
  domain_id: UUID
  title: string
  description: string | null
  horizon: ObjectiveHorizon
  status: ObjectiveStatus
  target_date: string | null
  target_granularity: ObjectiveGranularity | null
  criteria: ObjectiveCriterion[]
  sort_order: number
  created_at: string
}

export type ProjectStatus = 'actif' | 'pause' | 'termine' | 'abandonne'

export interface Project {
  id: UUID
  user_id: UUID
  domain_id: UUID
  objective_id: UUID | null
  title: string
  description: string | null
  notes: string | null
  status: ProjectStatus
  progress: number
  blocked: boolean
  blocked_reason: string | null
  /** Clé d'icône (src/lib/projectIcons.tsx) et couleur du liseret ; à défaut, couleur du domaine. */
  icon: string | null
  color: string | null
  last_activity_at: string
  created_at: string
}

export type StepStatus = 'actif' | 'termine'

/** Étape = sous-projet d'un projet : un titre, une échéance, et ses propres tâches. */
export interface Step {
  id: UUID
  user_id: UUID
  project_id: UUID
  title: string
  due_date: string | null
  scheduled_date: string | null // placée dans le calendrier
  status: StepStatus
  notable: boolean // apparaît dans les vues trimestre / année
  sort_order: number
  created_at: string
}

export type TaskStatus = 'a_faire' | 'en_cours' | 'fait' | 'annule'

export interface Task {
  id: UUID
  user_id: UUID
  project_id: UUID | null
  step_id: UUID | null
  domain_id: UUID | null
  title: string
  /** Type posé par le bouton « + » ; absent/'tache' = tâche ordinaire. */
  kind?: 'tache' | 'achat' | 'rappel'
  notes: string | null
  status: TaskStatus
  importance: number | null // 1..3
  urgence: number | null // 1..3
  effort: number | null // 1..3
  due_date: string | null
  scheduled_date: string | null   // planifié (ferme) : sera fait ce jour-là
  ideal_date: string | null       // idéal (souhait) : idéalement ce jour-là, pas encore décidé
  end_date: string | null   // durée « jusqu'à une date »
  duration_min: number | null
  is_task: boolean          // false = simple évènement calendaire (hors Priorités)
  location: string | null   // lieu (ex. lieu de vacances) — change où chercher les messes
  is_recurring: boolean
  recurrence_rule: string | null // 'daily' | 'weekly:1,3,5' | 'monthly:15'
  notable: boolean // apparaît dans les vues trimestre / année
  home_hidden: boolean // masquée de l'espace visuel de l'accueil (œil)
  /** Épinglée sur l'accueil : seules les épinglées y remontent. */
  home_pinned: boolean
  sort_order: number // ordre manuel des tâches d'un projet (drag & drop)
  done_at: string | null
  created_at: string
}

export type IdeaStatus = 'active' | 'reportee' | 'convertie' | 'abandonnee'

export interface Idea {
  id: UUID
  user_id: UUID
  domain_id: UUID
  project_id: UUID | null
  title: string
  description: string | null
  status: IdeaStatus
  defer_until: string | null
  importance: number | null
  urgence: number | null
  impact: number | null
  effort: number | null
  created_at: string
}

export type AnchorState = 'nouvelle' | 'consolidation' | 'stable' | 'a_revoir'

export interface Habit {
  id: UUID
  user_id: UUID
  domain_id: UUID
  title: string
  description: string | null
  frequency_type: 'daily' | 'weekly'
  weekly_target: number
  weekdays: string | null   // ex '2,4,6' (jours ISO) ; si défini, l'habitude est attendue ces jours-là
  time_of_day: string | null // ex '07:30' ; heure indicative
  anchor_state: AnchorState
  active: boolean
  start_date: string
  created_at: string
}

export interface HabitLog {
  id: UUID
  user_id: UUID
  habit_id: UUID
  log_date: string
  done: boolean
}

export type ReviewKind = 'hebdo' | 'confirmation' | 'mensuelle'

export interface Review {
  id: UUID
  user_id: UUID
  kind: ReviewKind
  review_date: string
  answers: Record<string, string>
  week_focus: UUID[]
  completed: boolean
  created_at: string
}

export interface Layout {
  id: UUID
  user_id: UUID
  name: string
  projection: string
  is_default: boolean
  data: {
    positions?: Record<string, { x: number; y: number }>
    /** Tailles choisies à la main (panneaux redimensionnés de l'accueil). */
    sizes?: Record<string, { w: number; h: number }>
    /** Bloc-notes de la vue Semaine (4 colonnes). */
    notes?: string[]
    filters?: Record<string, unknown>
  }
  created_at: string
  updated_at: string
}

export interface Birthday {
  id: UUID
  user_id: UUID
  name: string
  day: number   // 1..31
  month: number // 1..12
  created_at: string
}

export type CheckKind = 'periodique' | 'messe_travail' | 'checklist'

/** Un créneau de messe : heure « HH:MM » et lieu (église). */
export interface MassSlot { t: string; c: string }

/** Une tâche cochable d'une liste de vérification. */
export interface ChecklistItem { id: string; label: string; done: boolean }

/** Un groupe de tâches d'une liste (ex. « Départ », « Retour »). */
export interface ChecklistSection { id: string; title: string; items: ChecklistItem[] }

/** Contenu typé de `Check.config` pour le type checklist.
 *  `category` = famille de listes (ex. « Vacances ») ; le titre du check porte le nom de l'instance
 *  (ex. « Vacances Août 2026 »). */
export interface ChecklistConfig { category?: string; sections: ChecklistSection[] }

/** Contenu typé de `Check.config` pour le type messe_travail. */
export interface MassConfig {
  masses?: Record<string, MassSlot[]>  // Reims (hérité) — clé = jour ISO ('5' ven, '6' sam, '7' dim)
  massesByCity?: Record<string, Record<string, MassSlot[]>>  // slug ville -> jour ISO -> messes
  chosen?: Record<string, string>       // date ISO -> messe choisie (« HH:MM Lieu »)
  refreshed_at?: string                 // dernière mise à jour de la liste
}

/** Vérification = alerte configurable par l'utilisateur.
 *  - 'periodique' : à revoir tous les `interval_days` jours ;
 *  - 'messe_travail' : remonte les jours d'obligation travaillés (dimanche,
 *    1er vendredi, 1er samedi) où il faut trouver une messe. */
export interface Check {
  id: UUID
  user_id: UUID
  title: string
  kind: CheckKind
  domain_id: UUID | null
  link: string | null
  interval_days: number | null   // cadence (periodique)
  window_months: number          // fenêtre d'évaluation
  config: Record<string, unknown>
  resolved: string[]             // dates ISO déjà traitées (messe_travail)
  last_done_at: string | null    // dernier « vérifié » (periodique)
  active: boolean
  sort_order: number
  created_at: string
}

export interface Settings {
  user_id: UUID
  wip_limit: number
  first_name: string | null
  home_city: string | null   // ville de référence pour la recherche de messes
  daily_quote: boolean
  catholic_feasts: boolean    // afficher les grandes fêtes catholiques dans le calendrier
  updated_at: string
}

// ---- Heures de contrôle (OLAFATCO) ---------------------------------------

/** Une ligne de saisie proposée pour un jour travaillé (heures de contrôle). */
export interface OlafatcoLine {
  date: string           // ISO 'yyyy-MM-dd'
  shift_code: string     // code de vacation CAPS (M1, J, S1, N…)
  standard: number       // heures « standard »
  instructeur: number    // heures « instructeur »
  urmn: number           // occurrences URMN
  urme: number           // occurrences URME + FIR
  entered?: boolean      // saisi sur OLAFATCO (rempli par l'agent — étape 2)
  error?: string | null  // motif d'échec de saisie (agent — étape 2)
}

/** Rapport de vérification après saisie (rempli par l'agent — étape 2). */
export interface OlafatcoReport {
  ok: boolean
  entered: number        // nb de jours effectivement saisis
  total: number          // nb de jours du job
  message?: string
  anomalies?: string[]
}

export type OlafatcoJobStatus = 'a_valider' | 'valide' | 'en_cours' | 'termine' | 'erreur'

/** Un « job » de saisie des heures de contrôle : proposition → validation →
 *  (envoi par l'agent) → rapport. L'état vit en base pour survivre à la
 *  fermeture de la fenêtre Horizon. */
export interface OlafatcoJob {
  id: UUID
  user_id: UUID
  period_start: string   // ISO
  period_end: string     // ISO
  status: OlafatcoJobStatus
  lines: OlafatcoLine[]
  validated_at: string | null
  report: OlafatcoReport | null
  report_at: string | null
  created_at: string
}

/** Règles de proposition des heures de contrôle (été aéronautique).
 *  Total standard + instructeur borné, ≥ `minPerSide` de chaque côté, pas de
 *  `step`. Jours « hauts » (vendredi→lundi) visent des totaux plus élevés. */
export interface HoursRules {
  totalMin: number       // borne basse du total (4)
  totalMax: number       // borne haute du total (5)
  minPerSide: number     // minimum par côté (1,5)
  step: number           // pas de saisie (0,25)
  highDaysISO: number[]  // jours ISO « hauts » (5,6,7,1 = ven→lun)
  highTotals: number[]   // totaux visés les jours hauts
  lowTotals: number[]    // totaux visés les jours bas
  urmn: number           // occurrences URMN par défaut
  urme: number           // occurrences URME + FIR par défaut
}

// ---- Actualités (onglet « Activités ») -----------------------------------

/** Un sujet de veille suivi par l'utilisateur (IA, Elon Musk, Atelier Missor…). */
export interface NewsTopic {
  id: UUID
  user_id: UUID
  label: string
  prompt: string | null   // précisions optionnelles pour orienter la synthèse
  sort_order: number
  active: boolean
  created_at: string
}

/** Une source citée dans une synthèse. */
export interface NewsSource { title: string; url: string }

/** Nature d'une synthèse : veille du jour, ou mémoire du trimestre. */
export type NewsKind = 'jour' | 'important'

/** La synthèse générée pour un sujet (une par sujet et par nature,
 *  remplacée à chaque génération de la même nature). */
export interface NewsDigest {
  id: UUID
  user_id: UUID
  topic_id: UUID
  kind: NewsKind
  content: string
  sources: NewsSource[]
  generated_at: string
}

// ---- Listes de courses (page « Listes » sous Vérifications) ---------------

export type ShoppingSection = 'alimentaire' | 'bio' | 'non_alimentaire' | 'boucherie'

export interface ShoppingList {
  id: UUID
  user_id: UUID
  name: string
  recurrent: boolean   // liste récurrente à 3 rayons (alimentaire/bio/non-alimentaire)
  sort_order: number
  created_at: string
}

export interface ShoppingItem {
  id: UUID
  user_id: UUID
  list_id: UUID
  label: string
  section: ShoppingSection | null  // rayon (liste récurrente) ; null sinon
  category: string | null          // sous-groupe (ex. « Viande », « Fruits ») ; null si autonome
  checked: boolean                 // acheté (coché, sans rayer)
  sort_order: number
  created_at: string
}

// ---- Évangile / quiz (onglet « Activités ») ------------------------------

export interface GospelQuestion {
  id: string
  type: 'qcm' | 'texte'
  question: string
  choices?: string[]
  answer: string
  hint?: string
}

export interface GospelQuiz {
  level: number
  intro?: string
  questions: GospelQuestion[]
}

/** Un appel au modèle Anthropic, consigné par les fonctions Edge (lecture seule côté app).
 *  Le coût n'est pas stocké : il se calcule (`coutUsd`, aiUsage.ts). */
export interface AiUsage {
  id: UUID
  user_id: UUID
  /** Fonction à l'origine de l'appel. */
  fn: 'gospel' | 'news' | 'assistant'
  /** Précision : « jour niv. 2 », « revision », « jour · Sujet »… */
  detail: string | null
  model: string
  input_tokens: number
  output_tokens: number
  /** Recherches web, facturées à part. */
  web_searches: number
  created_at: string
}

/** Alerte calculée pour le cockpit — jamais culpabilisante */
export interface Alert {
  id: string
  kind: 'stagnation' | 'blocage' | 'surcharge' | 'revue' | 'habitude' | 'sans_action'
  label: string
  detail?: string
  severity: 'info' | 'warn'
  link?: string
}

/** Un agenda externe au format iCal (Google Agenda…) importé dans `tasks`.
 *  `ical_url` est une clé d'accès en lecture à l'agenda : elle ne doit jamais
 *  sortir de la base (RLS) ni entrer dans le dépôt, qui est public. */
export interface CalendarFeed {
  id: UUID
  user_id: UUID
  label: string
  ical_url: string
  domain_id: UUID | null
  active: boolean
  /** UID iCal des séries écartées : plus jamais proposées. */
  ignored: string[]
  last_sync_at: string | null
  last_error: string | null
  last_count: number | null
  created_at: string
}

/** Un évènement d'agenda externe PROPOSÉ à l'import : rien n'entre dans
 *  « Temps » sans que l'utilisateur l'ait choisi. `uid` désigne la série
 *  entière (écarter, c'est écarter toutes ses occurrences). */
export interface PropositionAgenda {
  uid: string
  cle: string
  titre: string
  debut: string
  fin: string | null
  lieu: string | null
  duree: number | null
  recurrent: boolean
  feed_id: UUID
  feed_label: string
}

// ---- Agent Céleste (remplacements) ----------------------------------------

export type CelesteMode = 'auto_premiere' | 'confirmation' | 'auto'

/** Règles de disponibilité de l'agent Céleste (une ligne par utilisateur).
 *  Les identifiants Céleste ne sont PAS ici (secrets de la fonction Edge). */
export interface CelesteRules {
  user_id: UUID
  enabled: boolean
  /** auto_premiere : accepte seul la première demande compatible puis passe en
   *  confirmation ; confirmation : propose et attend ; auto : accepte toujours. */
  mode: CelesteMode
  delay_seconds: number
  no_weekdays: number[]      // jours ISO refusés (7 = dimanche)
  /** Jour refusé mais ouvert à certaines vacations : { "4": ["N"] } = jeudi, sauf en nuit. */
  weekday_exceptions: Record<string, string[]>
  no_shifts: string[]        // codes de vacation refusés (N, S2…)
  no_teams: string[]         // équipes refusées
  refuse_reserved: boolean   // demandes fléchées (« Pour Marie », réservée) écartées
  no_keywords: string[]      // mots du commentaire qui font écarter
  min_notice_days: number
  max_per_week: number | null
  ntfy_topic: string | null
  last_scan_at: string | null
  last_error: string | null
  updated_at: string
}

export type CelesteStatus = 'proposee' | 'acceptee' | 'ignoree' | 'refusee' | 'expiree' | 'annulee' | 'erreur'

/** Une demande de remplacement vue par l'agent, et ce qu'il en a fait. */
export interface CelesteProposal {
  id: UUID
  user_id: UUID
  celeste_id: string
  date: string               // ISO 'yyyy-MM-dd'
  shift_code: string         // S1, M2, N…
  start_time: string         // « 15:00 »
  end_time: string
  ends_next_day: boolean
  team: string | null
  points: number | null
  comment: string | null
  poster: string | null
  status: CelesteStatus
  reason: string | null      // règle en cause, ou message d'erreur
  auto: boolean              // acceptée par l'agent seul
  task_id: UUID | null
  decided_at: string | null
  created_at: string
}

// ---------------------------------------------------------------
// Finances (tables fin_*) — voir migration « finances ».
// ---------------------------------------------------------------

export type FinOwner = 'commun' | 'joffrey' | 'honorine'
export type FinAccountKind = 'courant' | 'epargne' | 'investissement' | 'crypto' | 'immobilier' | 'metaux' | 'pret' | 'autre'
export type FinAssetClass = 'actions' | 'obligations' | 'or' | 'argent' | 'energie' | 'crypto' | 'immobilier' | 'liquidites' | 'autre'

/** Ligne du tableau de budget (Frais fixe, Courses…). */
export interface FinLine {
  id: UUID
  user_id: UUID
  name: string
  kind: 'depense' | 'epargne'
  color: string | null        // fond translucide de la ligne (ex. rgba(245, 158, 11, 0.18))
  sort_order: number
  created_at: string
}

export interface FinAccount {
  id: UUID
  user_id: UUID
  name: string
  institution: string | null
  kind: FinAccountKind
  subtype: string | null
  owner: FinOwner
  in_budget: boolean          // ses opérations comptent dans le budget
  balance: number             // valeur retenue (saisie ou source) ; négatif pour un prêt
  balance_source: number | null      // dernière valeur reçue de la source (Finary)
  balance_manual_at: string | null   // non nul : valeur saisie dans Horizon, l'import n'y touche plus
  acquired_on: string | null         // date d'achat d'un bien immobilier
  balance_at: string | null
  archived: boolean
  sort_order: number
  source: string
  external_id: string | null
  created_at: string
}

export interface FinCategory {
  id: UUID
  user_id: UUID
  name: string
  parent_id: UUID | null
  line_id: UUID | null        // à défaut, celle du parent
  role: 'depense' | 'revenu' | 'hors_budget'
  hidden: boolean             // masquée des listes de choix (ses opérations restent comptées)
  merged_into: UUID | null    // fusionnée dans cette catégorie : ses opérations comptent comme les siennes
  manual: boolean             // retouchée dans Horizon : l'import ne réécrit ni nom ni parent
  source: string
  external_id: string | null
  created_at: string
}

export interface FinTransaction {
  id: UUID
  user_id: UUID
  account_id: UUID
  date: string                // 'yyyy-MM-dd'
  amount: number              // signé : négatif = sortie
  label: string
  label_local: string | null  // intitulé propre à cette opération (prioritaire sur les règles)
  category_id: UUID | null
  category_manual: boolean
  owner: FinOwner | null      // null = titulaire du compte
  internal: boolean
  excluded: boolean
  note: string | null
  /** Autorisation carte pas encore comptabilisée par la banque (déjà dans le solde temps réel). */
  pending?: boolean
  source: string
  external_id: string | null
  created_at: string
}

/** Règle d'intitulé local : l'intitulé nettoyé contient `pattern` → afficher `label`. */
export interface FinLabel {
  id: UUID
  user_id: UUID
  pattern: string             // déjà nettoyé (normaliserLibelle)
  label: string
  created_at: string
}

/** Correction d'une dépense récurrente détectée pour le « RESTE » (ignorée, ou montant ajusté). */
export interface FinResteAjustement {
  id: UUID
  user_id: UUID
  cle: string                 // clé de regroupement (cleGroupe)
  nom: string | null
  ignore: boolean
  montant: number | null      // dépense retenue (positive) à la place de celle détectée
  created_at: string
}

/** Regroupement d'intitulés : clé automatique (cleGroupe) → nom du groupe. */
export interface FinGroup {
  id: UUID
  user_id: UUID
  pattern: string             // clé automatique, correspondance exacte
  name: string
  created_at: string
}

/** Commerçant renommé : clé automatique (cleGroupe) → intitulé affiché, pour toutes ses opérations. */
export interface FinMerchantAlias {
  id: UUID
  user_id: UUID
  pattern: string             // clé automatique, correspondance exacte
  label: string
  created_at: string
}

export interface FinBudget {
  id: UUID
  user_id: UUID
  line_id: UUID
  kind: 'budget' | 'prevision'
  month: string               // 1er du mois, 'yyyy-MM-01'
  amount: number
  created_at: string
}

/** Échéance d'un prêt (tableau d'amortissement) : la part de capital compte comme épargnée. */
export interface FinEcheance {
  id: UUID
  user_id: UUID
  account_id: UUID
  date: string
  capital: number
  interets: number
  /** Assurance comprise dans l'échéance. */
  assurance: number
  /** Frais de dossier / garantie prélevés avec cette échéance. */
  frais: number
  /** Capital restant dû après cette échéance (null : à recalculer). */
  restant_du: number | null
  rang: number | null
  /** 'pdf' (tableau officiel), 'estime' (recalculé), 'finary'. */
  source: string
  created_at: string
}

/** D'où vient une information d'une fiche de prêt. */
export type OriginePret = 'manual' | 'finary' | 'estimated' | 'pdf'

/** Fiche d'un prêt (1:1 avec un compte de type 'pret') : conditions du contrat. */
export interface FinLoan {
  id: UUID
  user_id: UUID
  account_id: UUID
  lender: string | null
  contract_ref: string | null
  loan_type: string | null
  start_date: string | null
  duration_months: number | null
  borrowed_capital: number | null
  rate_nominal: number | null          // en %
  rate_taeg: number | null
  monthly_payment: number | null       // hors assurance
  insurance_monthly: number | null     // assurance comprise dans l'échéance
  insurance_extra: number | null       // assurance prélevée à part
  fees: number | null
  /** Motif (regex, insensible à la casse) des libellés des prélèvements réels. */
  debit_match: string | null
  debit_account_ids: UUID[]
  notes: string | null
  origins: Record<string, OriginePret>
  created_at: string
  updated_at: string
}

export interface FinNetworth {
  id: UUID
  user_id: UUID
  date: string
  net: number
  gross: number | null
  // Composition (valeurs brutes par catégorie ; prêts en positif). Null : inconnue.
  immobilier: number | null
  prets: number | null
  investissements: number | null
  metaux: number | null
  liquidites: number | null
  crypto: number | null
  source: string
}

export interface FinHolding {
  id: UUID
  user_id: UUID
  account_id: UUID
  name: string
  code: string | null
  quantity: number | null
  value: number
  buy_value: number | null
  asset_class: FinAssetClass
  class_manual: boolean
  source: string
  external_id: string | null
  updated_at: string
}

export interface FinTarget {
  id: UUID
  user_id: UUID
  asset_class: FinAssetClass
  pct: number
}

export interface FinDca {
  id: UUID
  user_id: UUID
  label: string
  code: string | null
  envelope: string | null
  asset_class: FinAssetClass | null
  amount: number
  active: boolean
  sort_order: number
  created_at: string
}

export interface FinPlanned {
  id: UUID
  user_id: UUID
  title: string
  amount: number
  due_date: string
  line_id: UUID | null
  saved: number
  done: boolean
  note: string | null
  created_at: string
}

/** Partage d'onglets avec un autre compte (table `partages`, appliqué par RLS). */
export interface Partage {
  id: UUID
  owner_id: UUID
  member_email: string
  member_name: string | null
  member_id: UUID | null       // relié quand le membre s'est inscrit (e-mail confirmé)
  actif: boolean               // validé par le propriétaire : rien n'est lisible avant
  onglets: ('finances' | 'temps')[]
  finances_classer: boolean    // ranger les opérations (catégorie, titulaire, intitulé)
  temps_projets_masques: UUID[]
  temps_taches_masquees: boolean // Temps : évènements seulement
  created_at: string
}
