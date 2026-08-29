// ================================================================
// Arbre de routes unique — partagé par l'app (App.tsx) et le mode démo
// (demo/demo-main.tsx). Toute nouvelle page ne s'ajoute QU'ICI, sinon la
// démo divergeait silencieusement de l'app.
// ================================================================
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Dashboard } from './views/Dashboard'
import { ProjectsView } from './views/ProjectsView'
import { DomainsView } from './views/DomainsView'
import { PrioritiesView } from './views/PrioritiesView'
import { TimeView } from './views/TimeView'
import { PlanningView } from './views/PlanningView'
import { HabitsView } from './views/HabitsView'
import { ActivitesLayout } from './views/ActivitesLayout'
import { ActualitesView, ActualitesImportantesView } from './views/ActualitesView'
import { EvangileView } from './views/EvangileView'
import { ReviewsView } from './views/ReviewsView'
import { VerificationsLayout } from './views/VerificationsLayout'
import { VerificationsView } from './views/VerificationsView'
import { ListesView } from './views/ListesView'
import { HeuresControleView } from './views/HeuresControleView'
import { SettingsView } from './views/SettingsView'

// L'espace visuel embarque React Flow (~300 Ko) pour une seule route : il n'est
// chargé qu'à l'ouverture de /espace, plus au premier écran.
const WorkspaceView = lazy(() => import('./views/WorkspaceView').then((m) => ({ default: m.WorkspaceView })))

const Chargement = () => <p className="pt-8 text-center text-sm text-ink-3">Chargement…</p>

export function AppRoutes() {
  return (
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
        <Route path="importantes" element={<ActualitesImportantesView />} />
        <Route path="ecritures" element={<EvangileView />} />
      </Route>
      <Route path="/revues" element={<ReviewsView />} />
      <Route path="/verifications" element={<VerificationsLayout />}>
        <Route index element={<VerificationsView />} />
        <Route path="listes" element={<ListesView />} />
      </Route>
      <Route path="/heures-controle" element={<HeuresControleView />} />
      <Route path="/espace" element={<Suspense fallback={<Chargement />}><WorkspaceView /></Suspense>} />
      <Route path="/parametres" element={<SettingsView />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
