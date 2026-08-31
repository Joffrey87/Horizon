// ================================================================
// HORIZON — store global (zustand) : une seule source de vérité
// Les vues sont des projections de ces données, jamais des copies.
// ================================================================

import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type {
  Birthday, Check, Domain, GospelQuiz, Habit, HabitLog, Idea, Layout, NewsDigest, NewsKind, NewsTopic,
  Objective, OlafatcoJob, Project, Review, Settings, ShoppingItem, ShoppingList, Step, Task,
} from './types'

type Table =
  | 'domains' | 'objectives' | 'projects' | 'steps' | 'tasks' | 'ideas'
  | 'habits' | 'habit_logs' | 'reviews' | 'layouts' | 'birthdays' | 'checks' | 'olafatco_jobs'
  | 'news_topics' | 'news_digests' | 'shopping_lists' | 'shopping_items'

interface HorizonState {
  session: Session | null
  recovery: boolean
  ready: boolean
  loading: boolean
  /** Dernier échec réseau/Supabase, en clair. Affiché par le bandeau du Shell.
   *  Sans lui, une panne se présentait comme un compte vide et une écriture
   *  perdue comme un succès. */
  error: string | null
  domains: Domain[]
  objectives: Objective[]
  projects: Project[]
  steps: Step[]
  tasks: Task[]
  ideas: Idea[]
  habits: Habit[]
  habitLogs: HabitLog[]
  reviews: Review[]
  layouts: Layout[]
  birthdays: Birthday[]
  checks: Check[]
  olafatcoJobs: OlafatcoJob[]
  newsTopics: NewsTopic[]
  newsDigests: NewsDigest[]
  shoppingLists: ShoppingList[]
  shoppingItems: ShoppingItem[]
  settings: Settings | null

  init: () => Promise<void>
  loadAll: () => Promise<void>
  insert: <T extends { id: string }>(table: Table, values: Record<string, unknown>) => Promise<T | null>
  update: <T extends { id: string }>(table: Table, id: string, values: Record<string, unknown>) => Promise<T | null>
  remove: (table: Table, id: string) => Promise<void>
  saveSettings: (values: Partial<Settings>) => Promise<void>
  toggleHabitToday: (habitId: string, date: string) => Promise<void>
  cycleHabitDay: (habitId: string, date: string) => Promise<void>
  refreshNews: (mode?: NewsKind) => Promise<{ ok: boolean; updated?: number; error?: string }>
  resetShopping: (listId: string) => Promise<void>
  gospelQuiz: (reference: string, passage: string, level: number, opts?: { keyVerse?: string; verseRef?: string; avoid?: string[]; format?: 'jour' | 'revision' }) => Promise<{ ok: boolean; quiz?: GospelQuiz; error?: string }>
  clearRecovery: () => void
  clearError: () => void
  signOut: () => Promise<void>
}

const COLLECTION: Record<Table, keyof HorizonState> = {
  domains: 'domains', objectives: 'objectives', projects: 'projects', steps: 'steps', tasks: 'tasks',
  ideas: 'ideas', habits: 'habits', habit_logs: 'habitLogs', reviews: 'reviews', layouts: 'layouts',
  birthdays: 'birthdays', checks: 'checks', olafatco_jobs: 'olafatcoJobs',
  news_topics: 'newsTopics', news_digests: 'newsDigests',
  shopping_lists: 'shoppingLists', shopping_items: 'shoppingItems',
}

export const useHorizon = create<HorizonState>((set, get) => ({
  session: null,
  recovery: false,
  ready: false,
  loading: false,
  error: null,
  domains: [], objectives: [], projects: [], steps: [], tasks: [], ideas: [],
  habits: [], habitLogs: [], reviews: [], layouts: [], birthdays: [], checks: [], olafatcoJobs: [],
  newsTopics: [], newsDigests: [], shoppingLists: [], shoppingItems: [], settings: null,

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
          domains: [], objectives: [], projects: [], steps: [], tasks: [], ideas: [],
          habits: [], habitLogs: [], reviews: [], layouts: [], birthdays: [], checks: [], olafatcoJobs: [],
          newsTopics: [], newsDigests: [], shoppingLists: [], shoppingItems: [], settings: null,
        })
      }
    })
    if (data.session) await get().loadAll()
  },

  loadAll: async () => {
    set({ loading: true, error: null })
    const responses = await Promise.all([
      supabase.from('domains').select('*').order('sort_order'),
      supabase.from('objectives').select('*').order('sort_order'),
      supabase.from('projects').select('*').order('created_at'),
      supabase.from('steps').select('*').order('sort_order'),
      supabase.from('tasks').select('*').order('created_at'),
      supabase.from('ideas').select('*').order('created_at', { ascending: false }),
      supabase.from('habits').select('*').order('created_at'),
      supabase.from('habit_logs').select('*'),
      supabase.from('reviews').select('*').order('review_date', { ascending: false }),
      supabase.from('layouts').select('*'),
      supabase.from('settings').select('*').maybeSingle(),
      supabase.from('birthdays').select('*'),
      supabase.from('checks').select('*').order('sort_order'),
      supabase.from('olafatco_jobs').select('*').order('created_at', { ascending: false }),
      supabase.from('news_topics').select('*').order('sort_order'),
      supabase.from('news_digests').select('*'),
      supabase.from('shopping_lists').select('*').order('sort_order'),
      supabase.from('shopping_items').select('*').order('sort_order'),
    ])
    const [dom, obj, pro, stp, tas, ide, hab, log, rev, lay, setg, bd, chk, oja, nto, ndi, shl, shi] = responses
    // Une table en échec conserve ce qui était déjà chargé : mieux vaut un écran
    // incomplet et signalé qu'un compte qui paraît vide.
    const prev = get()
    const keep = <T,>(res: { data: T[] | null; error: unknown }, fallback: T[]): T[] =>
      res.error ? fallback : (res.data ?? [])
    const failed = responses.filter((r) => r.error)
    set({
      domains: keep(dom, prev.domains), objectives: keep(obj, prev.objectives), projects: keep(pro, prev.projects),
      steps: keep(stp, prev.steps), tasks: keep(tas, prev.tasks), ideas: keep(ide, prev.ideas),
      habits: keep(hab, prev.habits), habitLogs: keep(log, prev.habitLogs), reviews: keep(rev, prev.reviews),
      layouts: keep(lay, prev.layouts), birthdays: keep(bd, prev.birthdays), checks: keep(chk, prev.checks),
      olafatcoJobs: keep(oja, prev.olafatcoJobs), newsTopics: keep(nto, prev.newsTopics),
      newsDigests: keep(ndi, prev.newsDigests), shoppingLists: keep(shl, prev.shoppingLists),
      shoppingItems: keep(shi, prev.shoppingItems),
      settings: setg.error ? prev.settings : (setg.data ?? null),
      loading: false,
      error: failed.length === 0 ? null
        : `Chargement incomplet : ${failed.length} donnée${failed.length > 1 ? 's' : ''} n'a pas pu être lue (${failed[0]?.error?.message ?? 'réseau'}).`,
    })
  },

  insert: async (table, values) => {
    const user_id = get().session?.user.id
    if (!user_id) return null
    const { data, error } = await supabase.from(table).insert({ ...values, user_id }).select().single()
    if (error || !data) { set({ error: `Création impossible : ${error?.message ?? 'réponse vide'}` }); return null }
    const key = COLLECTION[table]
    set({ [key]: [...(get()[key] as unknown[]), data] } as Partial<HorizonState>)
    return data
  },

  update: async (table, id, values) => {
    const { data, error } = await supabase.from(table).update(values).eq('id', id).select().single()
    if (error || !data) { set({ error: `Enregistrement impossible : ${error?.message ?? 'réponse vide'}` }); return null }
    const key = COLLECTION[table]
    set({
      [key]: (get()[key] as { id: string }[]).map((row) => (row.id === id ? data : row)),
    } as Partial<HorizonState>)
    return data
  },

  remove: async (table, id) => {
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) { set({ error: `Suppression impossible : ${error.message}` }); return }
    const key = COLLECTION[table]
    set({ [key]: (get()[key] as { id: string }[]).filter((row) => row.id !== id) } as Partial<HorizonState>)
    // cohérence locale minimale des cascades
    if (table === 'projects') {
      set({
        tasks: get().tasks.filter((t) => t.project_id !== id),
        steps: get().steps.filter((st) => st.project_id !== id),
      })
    }
    if (table === 'steps') {
      // les tâches de l'étape restent, rattachées au projet mais détachées de l'étape
      set({ tasks: get().tasks.map((t) => (t.step_id === id ? { ...t, step_id: null } : t)) })
    }
    if (table === 'domains') void get().loadAll()
    if (table === 'habits') {
      set({ habitLogs: get().habitLogs.filter((l) => l.habit_id !== id) })
    }
    if (table === 'shopping_lists') {
      set({ shoppingItems: get().shoppingItems.filter((it) => it.list_id !== id) })
    }
  },

  saveSettings: async (values) => {
    const user_id = get().session?.user.id
    if (!user_id) return
    const { data, error } = await supabase.from('settings')
      .upsert({ user_id, ...values, updated_at: new Date().toISOString() })
      .select().single()
    if (error || !data) { set({ error: `Réglages non enregistrés : ${error?.message ?? 'réponse vide'}` }); return }
    set({ settings: data })
  },

  toggleHabitToday: async (habitId, date) => {
    const existing = get().habitLogs.find((l) => l.habit_id === habitId && l.log_date === date)
    if (existing) {
      const { error } = await supabase.from('habit_logs').delete().eq('id', existing.id)
      if (error) { set({ error: `Habitude non mise à jour : ${error.message}` }); return }
      set({ habitLogs: get().habitLogs.filter((l) => l.id !== existing.id) })
    } else {
      const user_id = get().session?.user.id
      if (!user_id) return
      const { data, error } = await supabase.from('habit_logs')
        .insert({ user_id, habit_id: habitId, log_date: date, done: true }).select().single()
      if (error || !data) { set({ error: `Habitude non mise à jour : ${error?.message ?? 'réponse vide'}` }); return }
      set({ habitLogs: [...get().habitLogs, data] })
    }
  },

  // Cycle à 3 états pour une case d'habitude : rien → validé (done=true) → non validé (done=false) → rien.
  cycleHabitDay: async (habitId, date) => {
    const existing = get().habitLogs.find((l) => l.habit_id === habitId && l.log_date === date)
    if (!existing) {
      const user_id = get().session?.user.id
      if (!user_id) return
      const { data, error } = await supabase.from('habit_logs')
        .insert({ user_id, habit_id: habitId, log_date: date, done: true }).select().single()
      if (error || !data) { set({ error: `Habitude non mise à jour : ${error?.message ?? 'réponse vide'}` }); return }
      set({ habitLogs: [...get().habitLogs, data] })
    } else if (existing.done) {
      const { error } = await supabase.from('habit_logs').update({ done: false }).eq('id', existing.id)
      if (error) { set({ error: `Habitude non mise à jour : ${error.message}` }); return }
      set({ habitLogs: get().habitLogs.map((l) => (l.id === existing.id ? { ...l, done: false } : l)) })
    } else {
      const { error } = await supabase.from('habit_logs').delete().eq('id', existing.id)
      if (error) { set({ error: `Habitude non mise à jour : ${error.message}` }); return }
      set({ habitLogs: get().habitLogs.filter((l) => l.id !== existing.id) })
    }
  },

  // Déclenche la régénération des synthèses d'actualités (edge function), puis
  // recharge le cache local. Le cron fait la même chose chaque matin.
  refreshNews: async (mode = 'jour') => {
    try {
      const { data, error } = await supabase.functions.invoke('horizon-news', { body: { source: 'app', mode } })
      if (error) throw error
      const { data: digs } = await supabase.from('news_digests').select('*')
      set({ newsDigests: digs ?? [] })
      return { ok: true, updated: data?.updated as number | undefined }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, error: msg }
    }
  },

  // Page Écritures : quiz de mémorisation généré à la demande par l'edge function.
  // (Le passage lui-même vient de getbible.net, sans clé — voir lib/bible.ts.)
  gospelQuiz: async (reference, passage, level, opts) => {
    try {
      const { data, error } = await supabase.functions.invoke('horizon-gospel', {
        body: {
          reference, passage, level,
          keyVerse: opts?.keyVerse, verseRef: opts?.verseRef, avoid: opts?.avoid,
          format: opts?.format ?? 'jour',
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return { ok: true, quiz: data?.quiz as GospelQuiz }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  },

  // Remet à zéro une liste de courses (décoche tout) pour la prochaine tournée.
  resetShopping: async (listId) => {
    const { error } = await supabase.from('shopping_items').update({ checked: false }).eq('list_id', listId)
    if (error) { set({ error: `Liste non réinitialisée : ${error.message}` }); return }
    set({ shoppingItems: get().shoppingItems.map((it) => (it.list_id === listId ? { ...it, checked: false } : it)) })
  },

  clearRecovery: () => set({ recovery: false }),
  clearError: () => set({ error: null }),

  signOut: async () => { await supabase.auth.signOut() },
}))
