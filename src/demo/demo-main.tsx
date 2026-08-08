// ================================================================
// Mode démo : l'app complète SANS aucune donnée fictive. Elle démarre
// vierge (comme un compte neuf) et reste pleinement interactive — les
// créations restent locales (aucun réseau) et ne persistent pas après
// rechargement. Ouvrir /demo.html après `npm run dev`.
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

// Démo vierge : aucune donnée fictive. Session simulée pour ne pas passer par
// l'écran de connexion ; toutes les collections sont vides au départ.
useHorizon.setState({
  ready: true, loading: false,
  session: { user: { id: uid, email: 'demo@horizon.local' } } as unknown as Session,
  domains: [], objectives: [], projects: [], steps: [], tasks: [], ideas: [],
  habits: [], habitLogs: [], reviews: [], layouts: [], birthdays: [], settings: null,
})

// Mode démo pleinement interactif : les mutations restent locales (aucun réseau,
// rien n'est persisté après rechargement). On réécrit le CRUD du store.
const KEY: Record<string, keyof ReturnType<typeof useHorizon.getState>> = {
  domains: 'domains', objectives: 'objectives', projects: 'projects', steps: 'steps',
  tasks: 'tasks', ideas: 'ideas', habits: 'habits', habit_logs: 'habitLogs',
  reviews: 'reviews', layouts: 'layouts', birthdays: 'birthdays',
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
      settings: { user_id: uid, wip_limit: 5, first_name: null, daily_quote: true, ...(cur ?? {}), ...values, updated_at: new Date().toISOString() } as never,
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
