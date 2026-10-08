// ================================================================
// HORIZON — store global (zustand) : une seule source de vérité
// Les vues sont des projections de ces données, jamais des copies.
// ================================================================

import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { capturesEnAttente, depiler } from './capture'
import { messageFonction } from './functionError'
import type {
  Birthday, CalendarFeed, CelesteProposal, CelesteRules, Check, Domain, FinAccount, FinBudget, FinCategory, FinDca,
  FinHolding, FinLabel, FinLine, FinNetworth, FinPlanned, FinTarget, FinTransaction, GospelQuiz, Habit, HabitLog, Idea, Layout,
  NewsDigest, NewsKind, NewsTopic, Objective, OlafatcoJob, Project, PropositionAgenda, Review, Settings, ShoppingItem,
  ShoppingList, Step, Task,
} from './types'

type Table =
  | 'domains' | 'objectives' | 'projects' | 'steps' | 'tasks' | 'ideas'
  | 'habits' | 'habit_logs' | 'reviews' | 'layouts' | 'birthdays' | 'checks' | 'olafatco_jobs'
  | 'news_topics' | 'news_digests' | 'shopping_lists' | 'shopping_items' | 'calendar_feeds'
  | 'celeste_proposals'
  | 'fin_lines' | 'fin_accounts' | 'fin_categories' | 'fin_transactions' | 'fin_budgets' | 'fin_networth'
  | 'fin_holdings' | 'fin_targets' | 'fin_dca' | 'fin_planned' | 'fin_labels'

interface HorizonState {
  session: Session | null
  recovery: boolean
  ready: boolean
  loading: boolean
  /** Dernier échec réseau/Supabase, en clair. Affiché par le bandeau du Shell.
   *  Sans lui, une panne se présentait comme un compte vide et une écriture
   *  perdue comme un succès. */
  error: string | null
  /** Captures faites hors ligne, encore sur l'appareil. Renvoyées dès que
   *  le réseau revient — se vider la tête ne dépend jamais du réseau. */
  enAttente: number
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
  calendarFeeds: CalendarFeed[]
  /** Évènements d'agenda proposés à l'import, jamais encore acceptés. */
  propositionsAgenda: PropositionAgenda[]
  /** Agent Céleste : règles (null tant que l'agent n'a jamais tourné) et demandes vues. */
  celesteRules: CelesteRules | null
  celesteProposals: CelesteProposal[]
  settings: Settings | null
  /** Finances : chargées à la première ouverture de l'onglet, pas au démarrage
   *  (des milliers d'opérations que les autres pages n'utilisent pas). */
  finLoaded: boolean
  finLines: FinLine[]
  finAccounts: FinAccount[]
  finCategories: FinCategory[]
  finTransactions: FinTransaction[]
  finBudgets: FinBudget[]
  finNetworth: FinNetworth[]
  finHoldings: FinHolding[]
  finTargets: FinTarget[]
  finDca: FinDca[]
  finPlanned: FinPlanned[]
  /** Règles d'intitulés locaux (motif → intitulé affiché). */
  finLabels: FinLabel[]

  init: () => Promise<void>
  loadAll: () => Promise<void>
  insert: <T extends { id: string }>(table: Table, values: Record<string, unknown>) => Promise<T | null>
  update: <T extends { id: string }>(table: Table, id: string, values: Record<string, unknown>) => Promise<T | null>
  remove: (table: Table, id: string) => Promise<void>
  /** Même modification sur plusieurs lignes d'une table (une seule requête). */
  updateMany: (table: Table, ids: string[], values: Record<string, unknown>) => Promise<boolean>
  saveSettings: (values: Partial<Settings>) => Promise<void>
  toggleHabitToday: (habitId: string, date: string) => Promise<void>
  cycleHabitDay: (habitId: string, date: string) => Promise<void>
  refreshNews: (mode?: NewsKind) => Promise<{ ok: boolean; updated?: number; error?: string }>
  resetShopping: (listId: string) => Promise<void>
  /** Charge (ou recharge) toutes les tables fin_*. Sans `force`, ne relit pas ce qui l'est déjà. */
  loadFinances: (force?: boolean) => Promise<void>
  /** Budget (à partir de ce mois) ou prévisionnel (ce mois seul) d'une ligne ; null efface. */
  setFinBudget: (lineId: string, kind: 'budget' | 'prevision', month: string, amount: number | null) => Promise<void>
  /** Relit les agendas externes : met à jour les évènements déjà acceptés et
   *  remplit `propositionsAgenda` avec les nouveautés — sans rien importer. */
  syncAgenda: () => Promise<{ ok: boolean; propositions?: number; error?: string }>
  /** Fait entrer un évènement proposé dans « Temps ». */
  accepterProposition: (p: PropositionAgenda) => Promise<boolean>
  /** Écarte toute la série : elle ne sera plus jamais proposée. */
  ignorerSerie: (feedId: string, uid: string) => Promise<void>
  gospelQuiz: (reference: string, passage: string, level: number, opts?: { keyVerse?: string; verseRef?: string; avoid?: string[]; format?: 'jour' | 'revision' }) => Promise<{ ok: boolean; quiz?: GospelQuiz; error?: string }>
  /** Agent Céleste : enregistre les règles (crée la ligne si besoin). */
  saveCelesteRules: (values: Partial<CelesteRules>) => Promise<void>
  /** Agent Céleste : action de la fonction Edge (scan, accept, unaccept), puis rechargement. */
  celesteAction: (action: 'scan' | 'accept' | 'unaccept', proposalId?: string) => Promise<{ ok: boolean; error?: string; result?: Record<string, unknown> }>
  clearRecovery: () => void
  clearError: () => void
  /** Réessaie d'envoyer les captures mises de côté. Sans effet si la file est
   *  vide ; s'arrête au premier échec (le réseau est manifestement toujours là). */
  flushCaptures: () => Promise<void>
  refreshEnAttente: () => void
  signOut: () => Promise<void>
}

const COLLECTION: Record<Table, keyof HorizonState> = {
  domains: 'domains', objectives: 'objectives', projects: 'projects', steps: 'steps', tasks: 'tasks',
  ideas: 'ideas', habits: 'habits', habit_logs: 'habitLogs', reviews: 'reviews', layouts: 'layouts',
  birthdays: 'birthdays', checks: 'checks', olafatco_jobs: 'olafatcoJobs',
  news_topics: 'newsTopics', news_digests: 'newsDigests',
  shopping_lists: 'shoppingLists', shopping_items: 'shoppingItems',
  calendar_feeds: 'calendarFeeds',
  celeste_proposals: 'celesteProposals',
  fin_lines: 'finLines', fin_accounts: 'finAccounts', fin_categories: 'finCategories',
  fin_transactions: 'finTransactions', fin_budgets: 'finBudgets', fin_networth: 'finNetworth',
  fin_holdings: 'finHoldings', fin_targets: 'finTargets', fin_dca: 'finDca', fin_planned: 'finPlanned', fin_labels: 'finLabels',
}

/** Les vides de l'onglet Finances (état initial et déconnexion). */
const FIN_VIDE = {
  finLoaded: false, finLines: [], finAccounts: [], finCategories: [], finTransactions: [], finBudgets: [],
  finNetworth: [], finHoldings: [], finTargets: [], finDca: [], finPlanned: [], finLabels: [],
}

/** Lit une table en entier : PostgREST plafonne une réponse à 1000 lignes. */
async function toutLire(table: string, ordre: string, croissant = true): Promise<{ data: unknown[]; error: string | null }> {
  const PAGE = 1000
  const data: unknown[] = []
  for (let de = 0; ; de += PAGE) {
    const r = await supabase.from(table).select('*').order(ordre, { ascending: croissant }).order('id')
      .range(de, de + PAGE - 1)
    if (r.error) return { data, error: r.error.message }
    data.push(...(r.data ?? []))
    if ((r.data ?? []).length < PAGE) return { data, error: null }
  }
}

/** Noms lisibles des collections, dans l'ordre des requêtes de `loadAll`. */
const TABLES = [
  'domaines', 'objectifs', 'projets', 'étapes', 'tâches', 'idées', 'habitudes',
  'suivi des habitudes', 'revues', 'dispositions', 'réglages', 'anniversaires',
  'vérifications', 'heures de contrôle', "sujets d'actualité", 'synthèses',
  'listes de courses', 'articles', 'agendas', 'règles Céleste', 'remplas Céleste',
]

export const useHorizon = create<HorizonState>((set, get) => ({
  session: null,
  recovery: false,
  ready: false,
  loading: false,
  error: null,
  enAttente: capturesEnAttente().length,
  domains: [], objectives: [], projects: [], steps: [], tasks: [], ideas: [],
  habits: [], habitLogs: [], reviews: [], layouts: [], birthdays: [], checks: [], olafatcoJobs: [],
  newsTopics: [], newsDigests: [], shoppingLists: [], shoppingItems: [], calendarFeeds: [],
  propositionsAgenda: [], celesteRules: null, celesteProposals: [], settings: null,
  ...FIN_VIDE,

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
          newsTopics: [], newsDigests: [], shoppingLists: [], shoppingItems: [], calendarFeeds: [],
          celesteRules: null, celesteProposals: [], settings: null,
          ...FIN_VIDE,
        })
      }
    })
    // Le réseau revient : on renvoie ce qui attendait sur l'appareil.
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => { void get().flushCaptures() })
    }
    if (data.session) await get().loadAll()
  },

  loadAll: async () => {
    set({ loading: true, error: null })
    // Des fabriques et non des promesses : on doit pouvoir relancer une requête.
    // L'ordre est celui de la déstructuration ci-dessous — ne pas y toucher.
    const requetes = [
      () => supabase.from('domains').select('*').order('sort_order'),
      () => supabase.from('objectives').select('*').order('sort_order'),
      () => supabase.from('projects').select('*').order('created_at'),
      () => supabase.from('steps').select('*').order('sort_order'),
      () => supabase.from('tasks').select('*').order('created_at'),
      () => supabase.from('ideas').select('*').order('created_at', { ascending: false }),
      () => supabase.from('habits').select('*').order('created_at'),
      () => supabase.from('habit_logs').select('*'),
      () => supabase.from('reviews').select('*').order('review_date', { ascending: false }),
      () => supabase.from('layouts').select('*'),
      () => supabase.from('settings').select('*').maybeSingle(),
      () => supabase.from('birthdays').select('*'),
      () => supabase.from('checks').select('*').order('sort_order'),
      () => supabase.from('olafatco_jobs').select('*').order('created_at', { ascending: false }),
      () => supabase.from('news_topics').select('*').order('sort_order'),
      () => supabase.from('news_digests').select('*'),
      () => supabase.from('shopping_lists').select('*').order('sort_order'),
      () => supabase.from('shopping_items').select('*').order('sort_order'),
      () => supabase.from('calendar_feeds').select('*').order('created_at'),
      () => supabase.from('celeste_rules').select('*').maybeSingle(),
      () => supabase.from('celeste_proposals').select('*').order('date'),
    ]
    type Reponse = { data: unknown; error: { message?: string } | null }
    const lancer = (i: number) => requetes[i]!() as unknown as Promise<Reponse>

    let responses = await Promise.all(requetes.map((_, i) => lancer(i)))
    // Un échec au démarrage est souvent passager : Supabase répond parfois
    // « JWT issued at future » (PGRST303) quand l'horloge de son service d'auth
    // devance celle de son API — le jeton doit « vieillir » de quelques secondes
    // pour être accepté. On relance les requêtes tombées avant d'alarmer.
    for (const attente of [900, 3000]) {
      if (!responses.some((r) => r.error)) break
      await new Promise((r) => setTimeout(r, attente))
      responses = await Promise.all(
        responses.map((r, i) => (r.error ? lancer(i) : Promise.resolve(r))),
      )
    }
    const [dom, obj, pro, stp, tas, ide, hab, log, rev, lay, setg, bd, chk, oja, nto, ndi, shl, shi, cal, cru, cpr] = responses
    // Une table en échec conserve ce qui était déjà chargé : mieux vaut un écran
    // incomplet et signalé qu'un compte qui paraît vide.
    const prev = get()
    const keep = <T,>(res: Reponse | undefined, fallback: T[]): T[] =>
      !res || res.error ? fallback : ((res.data as T[] | null) ?? [])
    const failed = responses.filter((r) => r.error)
    const premiere = failed[0]?.error?.message ?? 'réseau'
    const noms = responses.map((r, i) => (r.error ? (TABLES[i] ?? '?') : null)).filter(Boolean)
    // Au-delà de trois, on ne récite pas la liste : elle devient illisible.
    const tables = noms.length > 3
      ? `${noms.slice(0, 3).join(', ')} et ${noms.length - 3} autres`
      : noms.join(', ')
    // « JWT issued at future » ne vient ni du réseau ni des données : c'est un
    // décalage d'horloge interne à Supabase. On le dit, plutôt que d'inquiéter.
    const message = /issued at future|JWT/i.test(premiere)
      ? `Supabase a refusé le jeton pour ${tables} (décalage d'horloge de son côté, PGRST303). C'est passager : réessaie dans un instant.`
      : `Chargement incomplet : ${tables} n'a pas pu être lu (${premiere}).`
    set({
      domains: keep(dom, prev.domains), objectives: keep(obj, prev.objectives), projects: keep(pro, prev.projects),
      steps: keep(stp, prev.steps), tasks: keep(tas, prev.tasks), ideas: keep(ide, prev.ideas),
      habits: keep(hab, prev.habits), habitLogs: keep(log, prev.habitLogs), reviews: keep(rev, prev.reviews),
      layouts: keep(lay, prev.layouts), birthdays: keep(bd, prev.birthdays), checks: keep(chk, prev.checks),
      olafatcoJobs: keep(oja, prev.olafatcoJobs), newsTopics: keep(nto, prev.newsTopics),
      newsDigests: keep(ndi, prev.newsDigests), shoppingLists: keep(shl, prev.shoppingLists),
      shoppingItems: keep(shi, prev.shoppingItems), calendarFeeds: keep(cal, prev.calendarFeeds),
      celesteProposals: keep(cpr, prev.celesteProposals),
      celesteRules: !cru || cru.error ? prev.celesteRules : ((cru.data as CelesteRules | null) ?? null),
      settings: !setg || setg.error ? prev.settings : ((setg.data as Settings | null) ?? null),
      loading: false,
      error: failed.length === 0 ? null : message,
    })
    if (failed.length === 0) void get().flushCaptures()
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

  updateMany: async (table, ids, values) => {
    if (!ids.length) return true
    const { data, error } = await supabase.from(table).update(values).in('id', ids).select()
    if (error || !data) { set({ error: `Enregistrement impossible : ${error?.message ?? 'réponse vide'}` }); return false }
    const key = COLLECTION[table]
    const parId = new Map((data as { id: string }[]).map((r) => [r.id, r]))
    set({ [key]: (get()[key] as { id: string }[]).map((row) => parId.get(row.id) ?? row) } as Partial<HorizonState>)
    return true
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
      if (error) throw new Error(await messageFonction(error))
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
  syncAgenda: async () => {
    try {
      const { data, error } = await supabase.functions.invoke('sync-agenda')
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      const propositions = (data?.propositions ?? []) as PropositionAgenda[]
      set({ propositionsAgenda: propositions })
      await get().loadAll()
      return { ok: true, propositions: propositions.length }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  },

  accepterProposition: async (p) => {
    const cree = await get().insert('tasks', {
      title: p.titre, scheduled_date: p.debut, end_date: p.fin,
      location: p.lieu, duration_min: p.duree, is_task: false, status: 'a_faire',
      // Même marqueur que la fonction de synchro : l'évènement est désormais
      // suivi (mis à jour, retiré s'il disparaît) et ne sera plus proposé.
      notes: `source:gcal:${p.feed_id}:${p.cle}`,
      domain_id: get().calendarFeeds.find((f) => f.id === p.feed_id)?.domain_id ?? null,
    })
    if (!cree) return false
    set({ propositionsAgenda: get().propositionsAgenda.filter((x) => x.cle !== p.cle) })
    return true
  },

  ignorerSerie: async (feedId, uid) => {
    const feed = get().calendarFeeds.find((f) => f.id === feedId)
    if (!feed) return
    const maj = await get().update('calendar_feeds', feedId, {
      ignored: [...new Set([...(feed.ignored ?? []), uid])],
    })
    if (!maj) return
    set({ propositionsAgenda: get().propositionsAgenda.filter((x) => x.uid !== uid) })
  },

  gospelQuiz: async (reference, passage, level, opts) => {
    try {
      const { data, error } = await supabase.functions.invoke('horizon-gospel', {
        body: {
          reference, passage, level,
          keyVerse: opts?.keyVerse, verseRef: opts?.verseRef, avoid: opts?.avoid,
          format: opts?.format ?? 'jour',
        },
      })
      if (error) throw new Error(await messageFonction(error))
      if (data?.error) throw new Error(data.error)
      return { ok: true, quiz: data?.quiz as GospelQuiz }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  },

  saveCelesteRules: async (values) => {
    const user_id = get().session?.user.id
    if (!user_id) return
    const { data, error } = await supabase.from('celeste_rules')
      .upsert({ ...values, user_id, updated_at: new Date().toISOString() }).select('*').single()
    if (error || !data) { set({ error: `Règles Céleste non enregistrées : ${error?.message ?? 'réponse vide'}` }); return }
    set({ celesteRules: data as CelesteRules })
  },

  // L'agent (fonction Edge) fait le travail auprès de Céleste ; on recharge
  // ensuite règles et propositions, qu'il a mises à jour lui-même.
  celesteAction: async (action, proposalId) => {
    try {
      const { data, error } = await supabase.functions.invoke('celeste', { body: { action, proposal_id: proposalId } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      const [{ data: regles }, { data: props }] = await Promise.all([
        supabase.from('celeste_rules').select('*').maybeSingle(),
        supabase.from('celeste_proposals').select('*').order('date'),
      ])
      set({ celesteRules: (regles as CelesteRules | null) ?? get().celesteRules, celesteProposals: (props as CelesteProposal[] | null) ?? get().celesteProposals })
      if (action !== 'scan') {
        // « Temps » a pu gagner ou perdre une vacation.
        const { data: tasks } = await supabase.from('tasks').select('*').order('created_at')
        if (tasks) set({ tasks: tasks as Task[] })
      }
      return { ok: data?.ok !== false, error: data?.error as string | undefined, result: data as Record<string, unknown> }
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

  loadFinances: async (force = false) => {
    if (get().finLoaded && !force) return
    const lectures: [keyof HorizonState, string, string, boolean?][] = [
      ['finLines', 'fin_lines', 'sort_order'], ['finAccounts', 'fin_accounts', 'sort_order'],
      ['finCategories', 'fin_categories', 'name'], ['finTransactions', 'fin_transactions', 'date', false],
      ['finBudgets', 'fin_budgets', 'month'], ['finNetworth', 'fin_networth', 'date'],
      ['finHoldings', 'fin_holdings', 'value', false], ['finTargets', 'fin_targets', 'asset_class'],
      ['finDca', 'fin_dca', 'sort_order'], ['finPlanned', 'fin_planned', 'due_date'],
      ['finLabels', 'fin_labels', 'pattern'],
    ]
    const res = await Promise.all(lectures.map(([, table, ordre, croissant]) => toutLire(table, ordre, croissant)))
    const maj: Partial<HorizonState> = {}
    const echecs: string[] = []
    res.forEach((r, i) => {
      const [cle, table] = lectures[i]!
      // Une table en échec garde ce qui était chargé : un écran incomplet et signalé
      // vaut mieux qu'un budget qui paraît vide.
      if (r.error) echecs.push(`${table} (${r.error})`)
      else (maj as Record<string, unknown>)[cle] = r.data
    })
    set({ ...maj, finLoaded: echecs.length === 0 || get().finLoaded })
    if (echecs.length) set({ error: `Finances : chargement incomplet — ${echecs.join(', ')}.` })
  },

  setFinBudget: async (lineId, kind, month, amount) => {
    const user_id = get().session?.user.id
    if (!user_id) return
    const autres = get().finBudgets.filter((b) => !(b.line_id === lineId && b.kind === kind && b.month === month))
    if (amount === null) {
      const { error } = await supabase.from('fin_budgets').delete()
        .eq('line_id', lineId).eq('kind', kind).eq('month', month)
      if (error) { set({ error: `Budget non effacé : ${error.message}` }); return }
      set({ finBudgets: autres })
      return
    }
    const { data, error } = await supabase.from('fin_budgets')
      .upsert({ user_id, line_id: lineId, kind, month, amount }, { onConflict: 'line_id,kind,month' })
      .select().single()
    if (error || !data) { set({ error: `Budget non enregistré : ${error?.message ?? 'réponse vide'}` }); return }
    set({ finBudgets: [...autres, data as FinBudget] })
  },

  clearRecovery: () => set({ recovery: false }),
  clearError: () => set({ error: null }),
  refreshEnAttente: () => set({ enAttente: capturesEnAttente().length }),

  flushCaptures: async () => {
    if (!get().session) return
    for (const c of capturesEnAttente()) {
      const cree = c.kind === 'idee'
        ? await get().insert('ideas', { title: c.title, domain_id: c.domain_id, status: 'active' })
        : await get().insert('tasks', { title: c.title, domain_id: c.domain_id, status: 'a_faire' })
      if (!cree) break // toujours hors ligne : on garde le reste pour plus tard
      depiler(c.id)
    }
    get().refreshEnAttente()
  },

  signOut: async () => { await supabase.auth.signOut() },
}))
