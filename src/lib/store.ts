// ================================================================
// HORIZON — store global (zustand) : une seule source de vérité
// Les vues sont des projections de ces données, jamais des copies.
// ================================================================

import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type {
  Domain, Habit, HabitLog, Idea, Layout, Objective, Project, Review, Settings, Task,
} from './types'

type Table =
  | 'domains' | 'objectives' | 'projects' | 'tasks' | 'ideas'
  | 'habits' | 'habit_logs' | 'reviews' | 'layouts'

interface HorizonState {
  session: Session | null
  recovery: boolean
  ready: boolean
  loading: boolean
  domains: Domain[]
  objectives: Objective[]
  projects: Project[]
  tasks: Task[]
  ideas: Idea[]
  habits: Habit[]
  habitLogs: HabitLog[]
  reviews: Review[]
  layouts: Layout[]
  settings: Settings | null

  init: () => Promise<void>
  loadAll: () => Promise<void>
  insert: <T extends { id: string }>(table: Table, values: Record<string, unknown>) => Promise<T | null>
  update: <T extends { id: string }>(table: Table, id: string, values: Record<string, unknown>) => Promise<T | null>
  remove: (table: Table, id: string) => Promise<void>
  saveSettings: (values: Partial<Settings>) => Promise<void>
  toggleHabitToday: (habitId: string, date: string) => Promise<void>
  clearRecovery: () => void
  signOut: () => Promise<void>
}

const COLLECTION: Record<Table, keyof HorizonState> = {
  domains: 'domains', objectives: 'objectives', projects: 'projects', tasks: 'tasks',
  ideas: 'ideas', habits: 'habits', habit_logs: 'habitLogs', reviews: 'reviews', layouts: 'layouts',
}

export const useHorizon = create<HorizonState>((set, get) => ({
  session: null,
  recovery: false,
  ready: false,
  loading: false,
  domains: [], objectives: [], projects: [], tasks: [], ideas: [],
  habits: [], habitLogs: [], reviews: [], layouts: [], settings: null,

  init: async () => {
    const { data } = await supabase.auth.getSession()
    set({ session: data.session, ready: true })
    supabase.auth.onAuthStateChange((event, session) => {
      const prev = get().session
      if (event === 'PASSWORD_RECOVERY') set({ recovery: true })
      set({ session })
      if (session && session.user.id !== prev?.user.id) void get().loadAll()
      if (!session) {
        set({
          domains: [], objectives: [], projects: [], tasks: [], ideas: [],
          habits: [], habitLogs: [], reviews: [], layouts: [], settings: null,
        })
      }
    })
    if (data.session) await get().loadAll()
  },

  loadAll: async () => {
    set({ loading: true })
    const [dom, obj, pro, tas, ide, hab, log, rev, lay, setg] = await Promise.all([
      supabase.from('domains').select('*').order('sort_order'),
      supabase.from('objectives').select('*').order('sort_order'),
      supabase.from('projects').select('*').order('created_at'),
      supabase.from('tasks').select('*').order('created_at'),
      supabase.from('ideas').select('*').order('created_at', { ascending: false }),
      supabase.from('habits').select('*').order('created_at'),
      supabase.from('habit_logs').select('*'),
      supabase.from('reviews').select('*').order('review_date', { ascending: false }),
      supabase.from('layouts').select('*'),
      supabase.from('settings').select('*').maybeSingle(),
    ])
    set({
      domains: dom.data ?? [], objectives: obj.data ?? [], projects: pro.data ?? [],
      tasks: tas.data ?? [], ideas: ide.data ?? [], habits: hab.data ?? [],
      habitLogs: log.data ?? [], reviews: rev.data ?? [], layouts: lay.data ?? [],
      settings: setg.data ?? null, loading: false,
    })
  },

  insert: async (table, values) => {
    const user_id = get().session?.user.id
    if (!user_id) return null
    const { data, error } = await supabase.from(table).insert({ ...values, user_id }).select().single()
    if (error || !data) { console.error(error); return null }
    const key = COLLECTION[table]
    set({ [key]: [...(get()[key] as unknown[]), data] } as Partial<HorizonState>)
    return data
  },

  update: async (table, id, values) => {
    const { data, error } = await supabase.from(table).update(values).eq('id', id).select().single()
    if (error || !data) { console.error(error); return null }
    const key = COLLECTION[table]
    set({
      [key]: (get()[key] as { id: string }[]).map((row) => (row.id === id ? data : row)),
    } as Partial<HorizonState>)
    return data
  },

  remove: async (table, id) => {
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) { console.error(error); return }
    const key = COLLECTION[table]
    set({ [key]: (get()[key] as { id: string }[]).filter((row) => row.id !== id) } as Partial<HorizonState>)
    // cohérence locale minimale des cascades
    if (table === 'projects') {
      set({ tasks: get().tasks.filter((t) => t.project_id !== id) })
    }
    if (table === 'domains') void get().loadAll()
    if (table === 'habits') {
      set({ habitLogs: get().habitLogs.filter((l) => l.habit_id !== id) })
    }
  },

  saveSettings: async (values) => {
    const user_id = get().session?.user.id
    if (!user_id) return
    const { data, error } = await supabase.from('settings')
      .upsert({ user_id, ...values, updated_at: new Date().toISOString() })
      .select().single()
    if (!error && data) set({ settings: data })
  },

  toggleHabitToday: async (habitId, date) => {
    const existing = get().habitLogs.find((l) => l.habit_id === habitId && l.log_date === date)
    if (existing) {
      await supabase.from('habit_logs').delete().eq('id', existing.id)
      set({ habitLogs: get().habitLogs.filter((l) => l.id !== existing.id) })
    } else {
      const user_id = get().session?.user.id
      if (!user_id) return
      const { data, error } = await supabase.from('habit_logs')
        .insert({ user_id, habit_id: habitId, log_date: date, done: true }).select().single()
      if (!error && data) set({ habitLogs: [...get().habitLogs, data] })
    }
  },

  clearRecovery: () => set({ recovery: false }),

  signOut: async () => { await supabase.auth.signOut() },
}))
