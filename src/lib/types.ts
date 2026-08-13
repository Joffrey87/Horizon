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

/** La synthèse générée pour un sujet (remplacée à chaque génération). */
export interface NewsDigest {
  id: UUID
  user_id: UUID
  topic_id: UUID
  content: string
  sources: NewsSource[]
  generated_at: string
}

// ---- Listes de courses (page « Listes » sous Vérifications) ---------------

export type ShoppingSection = 'alimentaire' | 'bio' | 'non_alimentaire'

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

/** Alerte calculée pour le cockpit — jamais culpabilisante */
export interface Alert {
  id: string
  kind: 'stagnation' | 'blocage' | 'surcharge' | 'revue' | 'habitude' | 'sans_action'
  label: string
  detail?: string
  severity: 'info' | 'warn'
  link?: string
}
