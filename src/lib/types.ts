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

export interface Objective {
  id: UUID
  user_id: UUID
  domain_id: UUID
  title: string
  description: string | null
  horizon: ObjectiveHorizon
  status: ObjectiveStatus
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
  status: ProjectStatus
  progress: number
  next_action: string | null
  blocked: boolean
  blocked_reason: string | null
  last_activity_at: string
  created_at: string
}

export type TaskStatus = 'a_faire' | 'en_cours' | 'fait' | 'annule'

export interface Task {
  id: UUID
  user_id: UUID
  project_id: UUID | null
  domain_id: UUID | null
  title: string
  notes: string | null
  status: TaskStatus
  importance: number | null // 1..3
  urgence: number | null // 1..3
  effort: number | null // 1..3
  due_date: string | null
  scheduled_date: string | null
  duration_min: number | null
  is_recurring: boolean
  recurrence_rule: string | null // 'daily' | 'weekly:1,3,5' | 'monthly:15'
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

export interface Settings {
  user_id: UUID
  wip_limit: number
  first_name: string | null
  daily_quote: boolean
  updated_at: string
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
