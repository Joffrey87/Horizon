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
import { ChariteLayout } from './views/ChariteLayout'
import { PrieresView } from './views/PrieresView'
import { DiscussionsLayout } from './views/DiscussionsLayout'
import { DisputesView } from './views/DisputesView'
import { ReviewsView } from './views/ReviewsView'
import { VerificationsLayout } from './views/VerificationsLayout'
import { VerificationsView } from './views/VerificationsView'
import { ListesView } from './views/ListesView'
import { HeuresControleView } from './views/HeuresControleView'
import { RemplasView } from './views/RemplasView'
import { SettingsView } from './views/SettingsView'
import { CaptureView } from './views/CaptureView'
import { PAGE_OUVERTURE, ROUTE_ACCUEIL } from './lib/navigation'

// L'espace visuel embarque React Flow (~300 Ko) pour une seule route : il n'est
// chargé qu'à l'ouverture de /espace, plus au premier écran.
const WorkspaceView = lazy(() => import('./views/WorkspaceView').then((m) => ({ default: m.WorkspaceView })))

// Finances : tout l'onglet (vues + graphiques) n'est chargé qu'à sa première ouverture.
const fin = () => import('./views/finances')
const FinancesLayout = lazy(() => fin().then((m) => ({ default: m.FinancesLayout })))
const ResumeView = lazy(() => fin().then((m) => ({ default: m.ResumeView })))
const BudgetView = lazy(() => fin().then((m) => ({ default: m.BudgetView })))
const BilanView = lazy(() => fin().then((m) => ({ default: m.BilanView })))
const OperationsView = lazy(() => fin().then((m) => ({ default: m.OperationsView })))
const PatrimoineView = lazy(() => fin().then((m) => ({ default: m.PatrimoineView })))
const InvestissementsView = lazy(() => fin().then((m) => ({ default: m.InvestissementsView })))
const AVenirView = lazy(() => fin().then((m) => ({ default: m.AVenirView })))
const ReglagesFinancesView = lazy(() => fin().then((m) => ({ default: m.ReglagesView })))

// Entraînement : chargé à la première ouverture de l'onglet.
const EntrainementView = lazy(() => import('./views/entrainement/EntrainementView').then((m) => ({ default: m.EntrainementView })))

const Chargement = () => <p className="pt-8 text-center text-sm text-ink-3">Chargement…</p>

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={PAGE_OUVERTURE} replace />} />
      <Route path={ROUTE_ACCUEIL} element={<Dashboard />} />
      <Route path="/projets" element={<ProjectsView />} />
      <Route path="/domaines" element={<DomainsView />} />
      <Route path="/priorites" element={<PrioritiesView />} />
      {/* Cible du raccourci « Capturer » et du partage Android (manifest). */}
      <Route path="/capture" element={<CaptureView />} />
      <Route path="/temps" element={<TimeView />} />
      {/* Lien d'une notification de rempla : la date dans le chemin (le « ?date= »
          se perd quand Android ouvre le lien dans l'app installée). */}
      <Route path="/temps/:date" element={<TimeView />} />
      <Route path="/planification" element={<PlanningView />} />
      <Route path="/habitudes" element={<HabitsView />} />
      <Route path="/finances" element={<Suspense fallback={<Chargement />}><FinancesLayout /></Suspense>}>
        <Route index element={<ResumeView />} />
        <Route path="budget" element={<BudgetView />} />
        <Route path="bilan" element={<BilanView />} />
        <Route path="operations" element={<OperationsView />} />
        <Route path="patrimoine" element={<PatrimoineView />} />
        <Route path="investissements" element={<InvestissementsView />} />
        <Route path="a-venir" element={<AVenirView />} />
        <Route path="reglages" element={<ReglagesFinancesView />} />
      </Route>
      <Route path="/entrainement" element={<Suspense fallback={<Chargement />}><EntrainementView /></Suspense>} />
      <Route path="/activites" element={<ActivitesLayout />}>
        <Route index element={<Navigate to="actualites" replace />} />
        <Route path="actualites" element={<ActualitesView />} />
        <Route path="importantes" element={<ActualitesImportantesView />} />
        {/* Écritures a déménagé sous Charité : l'ancienne adresse y renvoie. */}
        <Route path="ecritures" element={<Navigate to="/charite/ecritures" replace />} />
      </Route>
      <Route path="/charite" element={<ChariteLayout />}>
        <Route index element={<Navigate to="ecritures" replace />} />
        <Route path="ecritures" element={<EvangileView />} />
        <Route path="prieres" element={<PrieresView />} />
      </Route>
      <Route path="/discussions" element={<DiscussionsLayout />}>
        <Route index element={<Navigate to="disputes" replace />} />
        <Route path="disputes" element={<DisputesView />} />
      </Route>
      <Route path="/revues"element={<ReviewsView />} />
      <Route path="/verifications" element={<VerificationsLayout />}>
        <Route index element={<VerificationsView />} />
        <Route path="listes" element={<ListesView />} />
      </Route>
      <Route path="/heures-controle" element={<HeuresControleView />} />
      <Route path="/remplas" element={<RemplasView />} />
      <Route path="/espace" element={<Suspense fallback={<Chargement />}><WorkspaceView /></Suspense>} />
      <Route path="/parametres" element={<SettingsView />} />
      <Route path="*" element={<Navigate to={PAGE_OUVERTURE} replace />} />
    </Routes>
  )
}
