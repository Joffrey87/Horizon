// ================================================================
// Mode démo : l'app complète avec des données locales réalistes,
// sans connexion Supabase. Sert à visualiser l'ergonomie (npm run dev
// puis ouvrir /demo.html) — aucune écriture ne persiste.
// ================================================================
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useHorizon } from '../lib/store'
import { Shell } from '../components/Shell'
import { Dashboard } from '../views/Dashboard'
import { ProjectsView } from '../views/ProjectsView'
import { DomainsView } from '../views/DomainsView'
import { PrioritiesView } from '../views/PrioritiesView'
import { TimeView } from '../views/TimeView'
import { PlanningView } from '../views/PlanningView'
import { IdeasView } from '../views/IdeasView'
import { HabitsView } from '../views/HabitsView'
import { ReviewsView } from '../views/ReviewsView'
import { WorkspaceView } from '../views/WorkspaceView'
import { SettingsView } from '../views/SettingsView'
import '../index.css'

const uid = 'demo-user'
const now = new Date()
const iso = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number) => { const d = new Date(now); d.setDate(d.getDate() - n); return d }
const ts = (n: number) => daysAgo(n).toISOString()

const D = (id: string, name: string, color: string, i: number) =>
  ({ id, user_id: uid, name, color, icon: 'circle', sort_order: i, created_at: ts(90) })

const domains = [
  D('d1', 'Professionnel', '#d97706', 0), D('d2', 'Santé', '#0d9488', 1),
  D('d3', 'Spiritualité', '#8b5cf6', 2), D('d4', 'Famille & Amis', '#dc4a6b', 3),
  D('d5', 'Finances', '#3987e5', 4), D('d6', 'Personnel', '#65a30d', 5),
]

useHorizon.setState({
  ready: true, loading: false,
  session: { user: { id: uid, email: 'joffrey@demo.fr' } } as unknown as Session,
  domains,
  objectives: [
    { id: 'o1', user_id: uid, domain_id: 'd1', title: 'Lancer la formation LFEE', description: null, horizon: 'trimestriel', status: 'actif', target_date: iso(daysAgo(-25)), target_granularity: 'mois', criteria: [{ label: 'Support finalisé', done: true }, { label: 'Session animée', done: false }, { label: 'Retours collectés', done: false }], sort_order: 0, created_at: ts(60) },
    { id: 'o2', user_id: uid, domain_id: 'd2', title: 'Retrouver une forme durable', description: null, horizon: 'annuel', status: 'actif', target_date: iso(daysAgo(-120)), target_granularity: 'mois', criteria: [{ label: '3 séances/semaine pendant 2 mois', done: false }, { label: 'Bilan médical OK', done: true }], sort_order: 1, created_at: ts(60) },
    { id: 'o3', user_id: uid, domain_id: 'd5', title: 'Constituer 6 mois d’avance', description: null, horizon: 'long_terme', status: 'actif', target_date: null, target_granularity: null, criteria: [], sort_order: 2, created_at: ts(60) },
  ],
  projects: [
    { id: 'p1', user_id: uid, domain_id: 'd1', objective_id: 'o1', title: 'LFEE — module 1', description: null, status: 'actif', progress: 60, next_action: 'Préparer le topo d’instruction', blocked: false, blocked_reason: null, last_activity_at: ts(1), created_at: ts(45) },
    { id: 'p2', user_id: uid, domain_id: 'd1', objective_id: null, title: 'POS App Horizon', description: null, status: 'actif', progress: 30, next_action: 'Tester le prototype', blocked: false, blocked_reason: null, last_activity_at: ts(0), created_at: ts(30) },
    { id: 'p3', user_id: uid, domain_id: 'd6', objective_id: null, title: 'Maison Reims', description: null, status: 'actif', progress: 20, next_action: null, blocked: true, blocked_reason: 'attente retour notaire', last_activity_at: ts(12), created_at: ts(80) },
    { id: 'p4', user_id: uid, domain_id: 'd4', objective_id: null, title: 'Week-end famille', description: null, status: 'actif', progress: 80, next_action: 'Réserver le gîte', blocked: false, blocked_reason: null, last_activity_at: ts(2), created_at: ts(20) },
    { id: 'p5', user_id: uid, domain_id: 'd5', objective_id: 'o3', title: 'Optimiser épargne', description: null, status: 'pause', progress: 10, next_action: null, blocked: false, blocked_reason: null, last_activity_at: ts(25), created_at: ts(70) },
  ],
  steps: [
    { id: 's1', user_id: uid, project_id: 'p1', title: 'Concevoir le support', due_date: iso(daysAgo(-3)), scheduled_date: iso(daysAgo(-3)), status: 'actif', notable: false, sort_order: 0, created_at: ts(10) },
    { id: 's2', user_id: uid, project_id: 'p1', title: 'Animer la session', due_date: iso(daysAgo(-18)), scheduled_date: iso(daysAgo(-18)), status: 'actif', notable: true, sort_order: 1, created_at: ts(10) },
    { id: 's3', user_id: uid, project_id: 'p2', title: 'Prototype testable', due_date: iso(daysAgo(-2)), scheduled_date: iso(daysAgo(-2)), status: 'actif', notable: false, sort_order: 0, created_at: ts(8) },
  ],
  tasks: [
    { id: 't1', user_id: uid, project_id: 'p1', step_id: 's1', domain_id: null, title: 'Préparer topo instruction', notes: null, status: 'a_faire', importance: 3, urgence: 3, effort: 2, due_date: iso(now), scheduled_date: iso(now), duration_min: 90, is_recurring: false, recurrence_rule: null, notable: false, is_task: true, end_date: null, done_at: null, created_at: ts(3) },
    { id: 't2', user_id: uid, project_id: null, step_id: null, domain_id: 'd2', title: 'Séance de sport', notes: null, status: 'a_faire', importance: 2, urgence: 2, effort: 2, due_date: null, scheduled_date: iso(now), duration_min: 45, is_recurring: false, recurrence_rule: null, notable: false, is_task: true, end_date: null, done_at: null, created_at: ts(2) },
    { id: 't3', user_id: uid, project_id: null, step_id: null, domain_id: 'd6', title: 'Appeler l’avocat', notes: null, status: 'a_faire', importance: 2, urgence: 1, effort: 1, due_date: null, scheduled_date: iso(now), duration_min: 20, is_recurring: false, recurrence_rule: null, notable: false, is_task: true, end_date: null, done_at: null, created_at: ts(2) },
    { id: 't4', user_id: uid, project_id: 'p2', step_id: 's3', domain_id: null, title: 'Tester le prototype Horizon', notes: null, status: 'a_faire', importance: 3, urgence: 2, effort: 2, due_date: null, scheduled_date: iso(daysAgo(-1)), duration_min: 60, is_recurring: false, recurrence_rule: null, notable: false, is_task: true, end_date: null, done_at: null, created_at: ts(1) },
    { id: 't5', user_id: uid, project_id: 'p4', step_id: null, domain_id: null, title: 'Réserver le gîte', notes: null, status: 'a_faire', importance: 2, urgence: 3, effort: 1, due_date: iso(daysAgo(-2)), scheduled_date: iso(daysAgo(-5)), duration_min: 30, is_recurring: false, recurrence_rule: null, notable: true, is_task: true, end_date: null, done_at: null, created_at: ts(4) },
    { id: 't6', user_id: uid, project_id: null, step_id: null, domain_id: 'd5', title: 'Payer les factures', notes: null, status: 'a_faire', importance: 2, urgence: 2, effort: 1, due_date: null, scheduled_date: null, duration_min: 15, is_recurring: true, recurrence_rule: 'monthly:10', notable: false, is_task: true, end_date: null, done_at: null, created_at: ts(50) },
    { id: 't7', user_id: uid, project_id: null, step_id: null, domain_id: 'd6', title: 'Sortir les poubelles', notes: null, status: 'a_faire', importance: 1, urgence: 2, effort: 1, due_date: null, scheduled_date: null, duration_min: 5, is_recurring: true, recurrence_rule: 'weekly:2,5', notable: false, is_task: true, end_date: null, done_at: null, created_at: ts(50) },
    { id: 't8', user_id: uid, project_id: 'p1', step_id: 's1', domain_id: null, title: 'Relire le support', notes: null, status: 'fait', importance: 2, urgence: 2, effort: 1, due_date: null, scheduled_date: iso(daysAgo(1)), duration_min: 40, is_recurring: false, recurrence_rule: null, notable: false, is_task: true, end_date: null, done_at: ts(1), created_at: ts(5) },
    { id: 't9', user_id: uid, project_id: null, step_id: null, domain_id: 'd2', title: 'Prendre RDV médecin', notes: null, status: 'fait', importance: 2, urgence: 1, effort: 1, due_date: null, scheduled_date: null, duration_min: null, is_recurring: false, recurrence_rule: null, notable: false, is_task: true, end_date: null, done_at: ts(3), created_at: ts(8) },
    { id: 't10', user_id: uid, project_id: 'p1', step_id: 's2', domain_id: null, title: 'Réserver la salle', notes: null, status: 'a_faire', importance: 2, urgence: 2, effort: 1, due_date: null, scheduled_date: null, duration_min: 15, is_recurring: false, recurrence_rule: null, notable: false, is_task: true, end_date: null, done_at: null, created_at: ts(6) },
    { id: 't11', user_id: uid, project_id: 'p1', step_id: 's2', domain_id: null, title: 'Imprimer les supports', notes: null, status: 'a_faire', importance: 1, urgence: 1, effort: 1, due_date: null, scheduled_date: null, duration_min: 20, is_recurring: false, recurrence_rule: null, notable: false, is_task: true, end_date: null, done_at: null, created_at: ts(6) },
  ],
  ideas: [
    { id: 'i1', user_id: uid, domain_id: 'd1', project_id: null, title: 'Créer une chaîne de tutoriels vidéo', description: null, status: 'active', defer_until: null, importance: 2, urgence: 1, impact: 3, effort: 3, created_at: ts(6) },
    { id: 'i2', user_id: uid, domain_id: 'd6', project_id: null, title: 'Aménager un coin lecture', description: null, status: 'active', defer_until: null, importance: 1, urgence: 1, impact: 2, effort: 2, created_at: ts(10) },
    { id: 'i3', user_id: uid, domain_id: 'd2', project_id: null, title: 'Tester la course à pied le matin', description: null, status: 'reportee', defer_until: iso(daysAgo(-120)), importance: 2, urgence: 1, impact: 2, effort: 1, created_at: ts(20) },
    { id: 'i4', user_id: uid, domain_id: 'd1', project_id: 'p2', title: 'Ajouter un mode hors-ligne à Horizon', description: null, status: 'reportee', defer_until: iso(daysAgo(-150)), importance: 2, urgence: 1, impact: 2, effort: 3, created_at: ts(4) },
  ],
  habits: [
    { id: 'h1', user_id: uid, domain_id: 'd3', title: 'Prière du matin', description: null, frequency_type: 'daily', weekly_target: 7, weekdays: null, time_of_day: '07:00', anchor_state: 'stable', active: true, start_date: iso(daysAgo(120)), created_at: ts(120) },
    { id: 'h2', user_id: uid, domain_id: 'd2', title: 'Sport', description: null, frequency_type: 'weekly', weekly_target: 3, weekdays: '2,4,6', time_of_day: '18:00', anchor_state: 'consolidation', active: true, start_date: iso(daysAgo(45)), created_at: ts(45) },
    { id: 'h3', user_id: uid, domain_id: 'd6', title: 'Lecture (20 min)', description: null, frequency_type: 'daily', weekly_target: 7, weekdays: null, time_of_day: null, anchor_state: 'nouvelle', active: true, start_date: iso(daysAgo(10)), created_at: ts(10) },
    { id: 'h4', user_id: uid, domain_id: 'd6', title: 'Ménage', description: null, frequency_type: 'weekly', weekly_target: 1, weekdays: '2', time_of_day: null, anchor_state: 'stable', active: true, start_date: iso(daysAgo(60)), created_at: ts(60) },
  ],
  habitLogs: [
    // prière : quasi quotidienne sur 28 jours
    ...Array.from({ length: 26 }, (_, i) => ({
      id: `l1-${i}`, user_id: uid, habit_id: 'h1', log_date: iso(daysAgo(i + (i % 9 === 0 ? 1 : 0))), done: true,
    })),
    ...[0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 23, 26].map((n, i) => ({
      id: `l2-${i}`, user_id: uid, habit_id: 'h2', log_date: iso(daysAgo(n)), done: true,
    })),
    ...[0, 1, 2, 4, 5].map((n, i) => ({
      id: `l3-${i}`, user_id: uid, habit_id: 'h3', log_date: iso(daysAgo(n)), done: true,
    })),
  ],
  reviews: [
    { id: 'r1', user_id: uid, kind: 'confirmation', review_date: iso(daysAgo(4)), answers: { engagement: 'Semaine LFEE' }, week_focus: ['t1', 't4', 't5'], completed: true, created_at: ts(4) },
    { id: 'r2', user_id: uid, kind: 'hebdo', review_date: iso(daysAgo(5)), answers: { projets: 'LFEE prioritaire' }, week_focus: ['t1', 't4', 't5'], completed: true, created_at: ts(5) },
  ],
  layouts: [],
  settings: { user_id: uid, wip_limit: 5, first_name: 'Joffrey', daily_quote: true, updated_at: ts(0) },
})

// Mode démo pleinement interactif : les mutations restent locales (aucun réseau,
// rien n'est persisté après rechargement). On réécrit le CRUD du store.
const KEY: Record<string, keyof ReturnType<typeof useHorizon.getState>> = {
  domains: 'domains', objectives: 'objectives', projects: 'projects', steps: 'steps',
  tasks: 'tasks', ideas: 'ideas', habits: 'habits', habit_logs: 'habitLogs',
  reviews: 'reviews', layouts: 'layouts',
}
let seq = 1000
const genId = () => `demo-${seq++}`

useHorizon.setState({
  init: async () => {},
  loadAll: async () => {},

  insert: async (table, values) => {
    const key = KEY[table]
    const row = { id: genId(), user_id: uid, created_at: new Date().toISOString(), ...values }
    const list = useHorizon.getState()[key] as unknown[]
    useHorizon.setState({ [key]: [...list, row] } as never)
    return row as never
  },

  update: async (table, id, values) => {
    const key = KEY[table]
    const list = useHorizon.getState()[key] as { id: string }[]
    let updated: unknown = null
    useHorizon.setState({
      [key]: list.map((r) => (r.id === id ? (updated = { ...r, ...values }) : r)),
    } as never)
    return updated as never
  },

  remove: async (table, id) => {
    const key = KEY[table]
    const list = useHorizon.getState()[key] as { id: string }[]
    useHorizon.setState({ [key]: list.filter((r) => r.id !== id) } as never)
    const st = useHorizon.getState()
    if (table === 'projects') {
      useHorizon.setState({
        tasks: st.tasks.filter((t) => t.project_id !== id),
        steps: st.steps.filter((s) => s.project_id !== id),
      })
    }
    if (table === 'steps') {
      useHorizon.setState({ tasks: st.tasks.map((t) => (t.step_id === id ? { ...t, step_id: null } : t)) })
    }
  },

  saveSettings: async (values) => {
    const cur = useHorizon.getState().settings
    useHorizon.setState({
      settings: { ...(cur as object), ...values, updated_at: new Date().toISOString() } as never,
    })
  },

  toggleHabitToday: async (habitId, date) => {
    const logs = useHorizon.getState().habitLogs
    const existing = logs.find((l) => l.habit_id === habitId && l.log_date === date)
    if (existing) {
      useHorizon.setState({ habitLogs: logs.filter((l) => l.id !== existing.id) })
    } else {
      useHorizon.setState({
        habitLogs: [...logs, { id: genId(), user_id: uid, habit_id: habitId, log_date: date, done: true }],
      })
    }
  },
})

// Réutilise la racine React entre les rechargements à chaud (HMR) pour éviter
// l'erreur « createRoot appelé deux fois » qui rendait la démo non réactive.
const container = document.getElementById('root')!
const w = window as unknown as { __demoRoot?: ReturnType<typeof createRoot> }
const root = w.__demoRoot ?? (w.__demoRoot = createRoot(container))
root.render(
  <StrictMode>
    <BrowserRouter>
      <div>
        <Shell>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/projets" element={<ProjectsView />} />
            <Route path="/domaines" element={<DomainsView />} />
            <Route path="/priorites" element={<PrioritiesView />} />
            <Route path="/temps" element={<TimeView />} />
            <Route path="/planification" element={<PlanningView />} />
            <Route path="/idees" element={<IdeasView />} />
            <Route path="/habitudes" element={<HabitsView />} />
            <Route path="/revues" element={<ReviewsView />} />
            <Route path="/espace" element={<WorkspaceView />} />
            <Route path="/parametres" element={<SettingsView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Shell>
      </div>
    </BrowserRouter>
  </StrictMode>,
)
