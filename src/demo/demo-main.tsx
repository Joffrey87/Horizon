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
import { HabitsView } from '../views/HabitsView'
import { ActivitesLayout } from '../views/ActivitesLayout'
import { ActualitesView } from '../views/ActualitesView'
import { EvangileView } from '../views/EvangileView'
import { ReviewsView } from '../views/ReviewsView'
import { VerificationsView } from '../views/VerificationsView'
import { HeuresControleView } from '../views/HeuresControleView'
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
  habits: [], habitLogs: [], reviews: [], layouts: [], birthdays: [], checks: [], olafatcoJobs: [],
  newsTopics: [], newsDigests: [], settings: null,
})

// Mode démo pleinement interactif : les mutations restent locales (aucun réseau,
// rien n'est persisté après rechargement). On réécrit le CRUD du store.
const KEY: Record<string, keyof ReturnType<typeof useHorizon.getState>> = {
  domains: 'domains', objectives: 'objectives', projects: 'projects', steps: 'steps',
  tasks: 'tasks', ideas: 'ideas', habits: 'habits', habit_logs: 'habitLogs',
  reviews: 'reviews', layouts: 'layouts', birthdays: 'birthdays', checks: 'checks',
  olafatco_jobs: 'olafatcoJobs', news_topics: 'newsTopics', news_digests: 'newsDigests',
}
let seq = 1000
const genId = () => `demo-${seq++}`

useHorizon.setState({
  init: async () => {},
  loadAll: async () => {},

  insert: async (table, values) => {
    const key = KEY[table]
    // Supabase applique des valeurs par défaut côté serveur : on réplique celles
    // indispensables au rendu (ex. habits.start_date, sinon parseISO plante).
    const defaults: Record<string, unknown> = table === 'habits'
      ? { start_date: new Date().toISOString().slice(0, 10) }
      : table === 'news_topics'
        ? { active: true, sort_order: 0 }
        : {}
    const row = { id: genId(), user_id: uid, created_at: new Date().toISOString(), ...defaults, ...values }
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

  cycleHabitDay: async (habitId, date) => {
    const logs = useHorizon.getState().habitLogs
    const existing = logs.find((l) => l.habit_id === habitId && l.log_date === date)
    if (!existing) {
      useHorizon.setState({
        habitLogs: [...logs, { id: genId(), user_id: uid, habit_id: habitId, log_date: date, done: true }],
      })
    } else if (existing.done) {
      useHorizon.setState({ habitLogs: logs.map((l) => (l.id === existing.id ? { ...l, done: false } : l)) })
    } else {
      useHorizon.setState({ habitLogs: logs.filter((l) => l.id !== existing.id) })
    }
  },

  // Démo : pas de réseau ni d'IA — on fabrique une synthèse factice par sujet
  // pour montrer le rendu (contenu + sources + horodatage).
  refreshNews: async () => {
    const st = useHorizon.getState()
    const now = new Date().toISOString()
    const digests = st.newsTopics.filter((t) => t.active).map((t) => ({
      id: genId(), user_id: uid, topic_id: t.id, generated_at: now,
      content: `— (démo) Exemple de synthèse pour « ${t.label} » : ceci illustre le rendu.\n`
        + '— En vrai, Claude cherche sur le web les nouvelles des ~15 derniers jours et les résume ici.\n'
        + '— Chaque puce correspond à une actualité datée et sourcée.',
      sources: [
        { title: 'Source exemple 1', url: 'https://example.com/actu-1' },
        { title: 'Source exemple 2', url: 'https://example.org/actu-2' },
      ],
    }))
    const others = st.newsDigests.filter((d) => !st.newsTopics.some((t) => t.active && t.id === d.topic_id))
    useHorizon.setState({ newsDigests: [...others, ...digests] })
    return { ok: true, updated: digests.length }
  },

  // Démo : quiz factice (le passage, lui, vient vraiment de getbible.net).
  // 4 questions ; QCM aux niveaux 1-2, textes à trous aux niveaux 3-4.
  gospelQuiz: async (_reference, _passage, level) => ({
    ok: true,
    quiz: {
      level,
      intro: `Quiz de démonstration — niveau ${level}.`,
      questions: level <= 2 ? [
        { id: 'q1', type: 'qcm', question: 'Quel est le message central du passage ?', choices: ['Mettre sa confiance en Dieu', 'Décrire la nature', 'Raconter une bataille'], answer: 'Mettre sa confiance en Dieu' },
        { id: 'q2', type: 'qcm', question: 'À quoi ce passage nous invite-t-il concrètement ?', choices: ['Persévérer sans nous épuiser', 'Fuir toute épreuve', 'Chercher la richesse'], answer: 'Persévérer sans nous épuiser' },
        { id: 'q3', type: 'qcm', question: 'Formulation exacte du verset clé ?', choices: ['renouvellent leur force', 'retrouvent leur courage', 'gardent leur calme'], answer: 'renouvellent leur force' },
        { id: 'q4', type: 'qcm', question: 'Ils prennent leur vol comme les… ?', choices: ['aigles', 'oiseaux', 'anges'], answer: 'aigles' },
      ] : [
        { id: 'q1', type: 'qcm', question: '« Ne se fatigue point » souligne surtout…', choices: ['Que Dieu ne s’épuise jamais', 'Que l’homme ne se fatigue plus', 'Que la fatigue est un péché'], answer: 'Que Dieu ne s’épuise jamais' },
        { id: 'q2', type: 'qcm', question: 'Quelle leçon de fond pour ta vie de foi ?', choices: ['L’endurance vient de la confiance en Dieu', 'Les forts réussissent toujours', 'Il faut éviter tout effort'], answer: 'L’endurance vient de la confiance en Dieu' },
        { id: 'q3', type: 'texte', question: 'Complète : « Ils prennent leur vol comme les ___ ».', answer: 'aigles', hint: 'un rapace' },
        { id: 'q4', type: 'texte', question: 'Complète : « ils courent, et ne se ___ point ; ils marchent, et ne se ___ point ».', answer: 'lassent fatiguent' },
      ],
    },
  }),
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
            <Route path="/habitudes" element={<HabitsView />} />
            <Route path="/activites" element={<ActivitesLayout />}>
              <Route index element={<Navigate to="actualites" replace />} />
              <Route path="actualites" element={<ActualitesView />} />
              <Route path="ecritures" element={<EvangileView />} />
            </Route>
            <Route path="/revues" element={<ReviewsView />} />
            <Route path="/verifications" element={<VerificationsView />} />
            <Route path="/heures-controle" element={<HeuresControleView />} />
            <Route path="/espace" element={<WorkspaceView />} />
            <Route path="/parametres" element={<SettingsView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Shell>
      </div>
    </BrowserRouter>
  </StrictMode>,
)
