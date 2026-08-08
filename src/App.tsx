import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useHorizon } from './lib/store'
import { Shell } from './components/Shell'
import { AuthView } from './views/AuthView'
import { SetPasswordView } from './views/SetPasswordView'
import { Dashboard } from './views/Dashboard'
import { ProjectsView } from './views/ProjectsView'
import { DomainsView } from './views/DomainsView'
import { PrioritiesView } from './views/PrioritiesView'
import { TimeView } from './views/TimeView'
import { PlanningView } from './views/PlanningView'
import { IdeasView } from './views/IdeasView'
import { HabitsView } from './views/HabitsView'
import { ReviewsView } from './views/ReviewsView'
import { WorkspaceView } from './views/WorkspaceView'
import { SettingsView } from './views/SettingsView'

export default function App() {
  const { session, ready, recovery, init } = useHorizon()

  useEffect(() => { void init() }, [init])

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-ink-3">Horizon se lève…</p>
      </div>
    )
  }

  if (recovery) return <SetPasswordView />
  if (!session) return <AuthView />

  return (
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
  )
}
