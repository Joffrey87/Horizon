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
    { id: 'o1', user_id: uid, domain_id: 'd1', title: 'Lancer la formation LFEE', description: null, horizon: 'trimestriel', status: 'actif', sort_order: 0, created_at: ts(60) },
    { id: 'o2', user_id: uid, domain_id: 'd2', title: 'Retrouver une forme durable', description: null, horizon: 'annuel', status: 'actif', sort_order: 1, created_at: ts(60) },
    { id: 'o3', user_id: uid, domain_id: 'd5', title: 'Constituer 6 mois d’avance', description: null, horizon: 'long_terme', status: 'actif', sort_order: 2, created_at: ts(60) },
  ],
  projects: [
    { id: 'p1', user_id: uid, domain_id: 'd1', objective_id: 'o1', title: 'LFEE — module 1', description: null, status: 'actif', progress: 60, next_action: 'Préparer le topo d’instruction', blocked: false, blocked_reason: null, last_activity_at: ts(1), created_at: ts(45) },
    { id: 'p2', user_id: uid, domain_id: 'd1', objective_id: null, title: 'POS App Horizon', description: null, status: 'actif', progress: 30, next_action: 'Tester le prototype', blocked: false, blocked_reason: null, last_activity_at: ts(0), created_at: ts(30) },
    { id: 'p3', user_id: uid, domain_id: 'd6', objective_id: null, title: 'Maison Reims', description: null, status: 'actif', progress: 20, next_action: null, blocked: true, blocked_reason: 'attente retour notaire', last_activity_at: ts(12), created_at: ts(80) },
    { id: 'p4', user_id: uid, domain_id: 'd4', objective_id: null, title: 'Week-end famille', description: null, status: 'actif', progress: 80, next_action: 'Réserver le gîte', blocked: false, blocked_reason: null, last_activity_at: ts(2), created_at: ts(20) },
    { id: 'p5', user_id: uid, domain_id: 'd5', objective_id: 'o3', title: 'Optimiser épargne', description: null, status: 'pause', progress: 10, next_action: null, blocked: false, blocked_reason: null, last_activity_at: ts(25), created_at: ts(70) },
  ],
  tasks: [
    { id: 't1', user_id: uid, project_id: 'p1', domain_id: null, title: 'Préparer topo instruction', notes: null, status: 'a_faire', importance: 3, urgence: 3, effort: 2, due_date: iso(now), scheduled_date: iso(now), duration_min: 90, is_recurring: false, recurrence_rule: null, done_at: null, created_at: ts(3) },
    { id: 't2', user_id: uid, project_id: null, domain_id: 'd2', title: 'Séance de sport', notes: null, status: 'a_faire', importance: 2, urgence: 2, effort: 2, due_date: null, scheduled_date: iso(now), duration_min: 45, is_recurring: false, recurrence_rule: null, done_at: null, created_at: ts(2) },
    { id: 't3', user_id: uid, project_id: null, domain_id: 'd6', title: 'Appeler l’avocat', notes: null, status: 'a_faire', importance: 2, urgence: 1, effort: 1, due_date: null, scheduled_date: iso(now), duration_min: 20, is_recurring: false, recurrence_rule: null, done_at: null, created_at: ts(2) },
    { id: 't4', user_id: uid, project_id: 'p2', domain_id: null, title: 'Tester le prototype Horizon', notes: null, status: 'a_faire', importance: 3, urgence: 2, effort: 2, due_date: null, scheduled_date: iso(daysAgo(-1)), duration_min: 60, is_recurring: false, recurrence_rule: null, done_at: null, created_at: ts(1) },
    { id: 't5', user_id: uid, project_id: 'p4', domain_id: null, title: 'Réserver le gîte', notes: null, status: 'a_faire', importance: 2, urgence: 3, effort: 1, due_date: iso(daysAgo(-2)), scheduled_date: null, duration_min: 30, is_recurring: false, recurrence_rule: null, done_at: null, created_at: ts(4) },
    { id: 't6', user_id: uid, project_id: null, domain_id: 'd5', title: 'Payer les factures', notes: null, status: 'a_faire', importance: 2, urgence: 2, effort: 1, due_date: null, scheduled_date: null, duration_min: 15, is_recurring: true, recurrence_rule: 'monthly:10', done_at: null, created_at: ts(50) },
    { id: 't7', user_id: uid, project_id: null, domain_id: 'd6', title: 'Sortir les poubelles', notes: null, status: 'a_faire', importance: 1, urgence: 2, effort: 1, due_date: null, scheduled_date: null, duration_min: 5, is_recurring: true, recurrence_rule: 'weekly:2,5', done_at: null, created_at: ts(50) },
    { id: 't8', user_id: uid, project_id: 'p1', domain_id: null, title: 'Relire le support', notes: null, status: 'fait', importance: 2, urgence: 2, effort: 1, due_date: null, scheduled_date: iso(daysAgo(1)), duration_min: 40, is_recurring: false, recurrence_rule: null, done_at: ts(1), created_at: ts(5) },
    { id: 't9', user_id: uid, project_id: null, domain_id: 'd2', title: 'Prendre RDV médecin', notes: null, status: 'fait', importance: 2, urgence: 1, effort: 1, due_date: null, scheduled_date: null, duration_min: null, is_recurring: false, recurrence_rule: null, done_at: ts(3), created_at: ts(8) },
  ],
  ideas: [
    { id: 'i1', user_id: uid, domain_id: 'd1', project_id: null, title: 'Créer une chaîne de tutoriels vidéo', description: null, status: 'active', defer_until: null, importance: 2, urgence: 1, impact: 3, effort: 3, created_at: ts(6) },
    { id: 'i2', user_id: uid, domain_id: 'd6', project_id: null, title: 'Aménager un coin lecture', description: null, status: 'active', defer_until: null, importance: 1, urgence: 1, impact: 2, effort: 2, created_at: ts(10) },
    { id: 'i3', user_id: uid, domain_id: 'd2', project_id: null, title: 'Tester la course à pied le matin', description: null, status: 'reportee', defer_until: iso(daysAgo(-120)), importance: 2, urgence: 1, impact: 2, effort: 1, created_at: ts(20) },
    { id: 'i4', user_id: uid, domain_id: 'd1', project_id: 'p2', title: 'Ajouter un mode hors-ligne à Horizon', description: null, status: 'reportee', defer_until: iso(daysAgo(-150)), importance: 2, urgence: 1, impact: 2, effort: 3, created_at: ts(4) },
  ],
  habits: [
    { id: 'h1', user_id: uid, domain_id: 'd3', title: 'Prière du matin', description: null, frequency_type: 'daily', weekly_target: 7, anchor_state: 'stable', active: true, start_date: iso(daysAgo(120)), created_at: ts(120) },
    { id: 'h2', user_id: uid, domain_id: 'd2', title: 'Sport', description: null, frequency_type: 'weekly', weekly_target: 3, anchor_state: 'consolidation', active: true, start_date: iso(daysAgo(45)), created_at: ts(45) },
    { id: 'h3', user_id: uid, domain_id: 'd6', title: 'Lecture (20 min)', description: null, frequency_type: 'daily', weekly_target: 7, anchor_state: 'nouvelle', active: true, start_date: iso(daysAgo(10)), created_at: ts(10) },
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

// Neutraliser les mutations réseau en mode démo (lecture seule assumée)
useHorizon.setState({
  init: async () => {},
  loadAll: async () => {},
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <div>
        <p className="bg-sun/15 py-1 text-center text-[11px] text-sun-soft">
          Mode démo — données locales fictives, rien n'est enregistré
        </p>
        <Shell>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/projets" element={<ProjectsView />} />
            <Route path="/domaines" element={<DomainsView />} />
            <Route path="/priorites" element={<PrioritiesView />} />
            <Route path="/temps" element={<TimeView />} />
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
