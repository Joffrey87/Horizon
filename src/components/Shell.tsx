import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import {
  Home, FolderKanban, ListTodo, Compass, CalendarDays, CalendarRange,
  Repeat, ClipboardCheck, Network, Settings, Plus, LogOut, Menu, ArrowLeft, ShieldCheck, Timer, Newspaper,
  AlertTriangle, X, RotateCw,
} from 'lucide-react'
import { useHorizon } from '../lib/store'
import { wallpaperOfDay } from '../lib/logic'
import { QuickCapture } from './QuickCapture'

// Agendas externes : on resynchronise au plus une fois par demi-heure. Inutile
// d'aller plus vite — Google met son propre export iCal en cache.
const SYNC_KEY = 'horizon.agenda.sync'
const SYNC_MS = 30 * 60 * 1000

const NAV = [
  { to: '/', label: 'Accueil', icon: Home },
  { to: '/projets', label: 'Projets', icon: FolderKanban },
  { to: '/priorites', label: 'Priorités', icon: ListTodo },
  { to: '/domaines', label: 'Domaines & objectifs', icon: Compass },
  { to: '/temps', label: 'Temps', icon: CalendarDays },
  { to: '/planification', label: 'Planification', icon: CalendarRange },
  { to: '/habitudes', label: 'Habitudes', icon: Repeat },
  { to: '/activites', label: 'Activités', icon: Newspaper },
  { to: '/revues', label: 'Revues', icon: ClipboardCheck },
  { to: '/verifications', label: 'Vérifications', icon: ShieldCheck },
  { to: '/heures-controle', label: 'Heures de contrôle', icon: Timer },
  { to: '/espace', label: 'Espace visuel', icon: Network },
]

export function Shell({ children }: { children: ReactNode }) {
  const [capture, setCapture] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const signOut = useHorizon((s) => s.signOut)
  const error = useHorizon((s) => s.error)
  const clearError = useHorizon((s) => s.clearError)
  const loadAll = useHorizon((s) => s.loadAll)
  const syncAgenda = useHorizon((s) => s.syncAgenda)
  const nbAgendas = useHorizon((s) => s.calendarFeeds.length)
  const navigate = useNavigate()

  useEffect(() => {
    if (nbAgendas === 0) return
    let dernier = 0
    try { dernier = Number(localStorage.getItem(SYNC_KEY) ?? 0) } catch { /* stockage indispo */ }
    if (Date.now() - dernier < SYNC_MS) return
    // Marqué AVANT l'appel : la synchro recharge le store, ce qui repasserait ici.
    try { localStorage.setItem(SYNC_KEY, String(Date.now())) } catch { /* stockage indispo */ }
    // L'échec ne doit PAS rester muet : sans ça, un agenda qui ne se synchronise
    // pas se présente comme un agenda vide.
    void syncAgenda().then((r) => {
      if (!r.ok) useHorizon.setState({ error: `Agenda non synchronisé : ${r.error}` })
    })
  }, [nbAgendas, syncAgenda])

  return (
    <div className="flex min-h-screen overflow-x-hidden">
      {/* ---- Fond paysage du jour de l'accueil, répliqué en version très estompée (pages hors accueil) ---- */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-bg">
        <img src={wallpaperOfDay()} alt="" className="h-full w-full object-cover opacity-30" />
      </div>

      {/* ---- Barre latérale (style options 1/3) ---- */}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-panel
        transition-transform lg:static lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-1 px-3 py-5">
          <button onClick={() => navigate(-1)}
            className="btn-ghost hidden shrink-0 p-2 lg:flex"
            aria-label="Revenir à la page précédente" title="Revenir à la page précédente">
            <ArrowLeft size={18} strokeWidth={2} />
          </button>
          <Link to="/" onClick={() => setMenuOpen(false)}
            className="flex items-center gap-3 transition-opacity hover:opacity-80"
            aria-label="Retour à l'accueil">
            <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-white/10">
              <img src="/logo.png" alt="Horizon" className="h-full w-full object-cover"
                style={{ transform: 'scale(2.1)', transformOrigin: '50% 41%' }} />
            </span>
            <div>
              <p className="text-sm font-bold tracking-[0.22em]">HORIZON</p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                  isActive ? 'bg-panel-3 text-sun-soft' : 'text-ink-2 hover:bg-panel-2 hover:text-ink'
                }`}>
              <Icon size={16} strokeWidth={1.8} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-0.5 border-t border-line px-3 py-3">
          {/* Assistant mis de côté (masqué) — voir AssistantPanel.tsx, réactivable plus tard. */}
          <NavLink to="/parametres" onClick={() => setMenuOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                isActive ? 'bg-panel-3 text-sun-soft' : 'text-ink-2 hover:bg-panel-2 hover:text-ink'
              }`}>
            <Settings size={16} strokeWidth={1.8} />
            Paramètres
          </NavLink>
          <button onClick={() => void signOut()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink-2">
            <LogOut size={16} strokeWidth={1.8} />
            Se déconnecter
          </button>
        </div>
      </aside>

      {menuOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setMenuOpen(false)} />}

      {/* ---- Contenu ---- */}
      <div className="sunrise-veil min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-4 lg:px-8">
          {/* Barre mobile : menu + retour + logo (n'existe qu'en petit écran) */}
          <div className="mb-2 flex items-center justify-between gap-2 lg:hidden">
            <div className="flex items-center gap-1">
              <button onClick={() => setMenuOpen(true)} className="btn-ghost p-2" aria-label="Menu">
                <Menu size={18} />
              </button>
              <button onClick={() => navigate(-1)} className="btn-ghost p-2"
                aria-label="Revenir à la page précédente" title="Revenir à la page précédente">
                <ArrowLeft size={18} strokeWidth={2} />
              </button>
            </div>
            <Link to="/" aria-label="Retour à l'accueil">
              <span className="block h-8 w-8 overflow-hidden rounded-full ring-1 ring-white/10">
                <img src="/logo.png" alt="Horizon" className="h-full w-full object-cover"
                  style={{ transform: 'scale(2.1)', transformOrigin: '50% 41%' }} />
              </span>
            </Link>
          </div>
          {/* ---- Bandeau d'erreur : une panne réseau ou une écriture perdue se voit,
               au lieu de passer pour un compte vide ou un enregistrement réussi. ---- */}
          {error && (
            <div role="alert"
              className="mb-3 flex items-start gap-2 rounded-xl border border-[#ef4444]/50 bg-[#ef4444]/12 px-3 py-2 text-sm">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[#ff6b6b]" />
              <p className="min-w-0 flex-1 text-ink-2">{error}</p>
              <button onClick={() => { clearError(); void loadAll() }}
                className="btn-ghost flex shrink-0 items-center gap-1 px-2 py-1 text-xs" title="Recharger les données">
                <RotateCw size={12} /> Réessayer
              </button>
              <button onClick={clearError} className="btn-ghost shrink-0 p-1 text-ink-3 hover:text-ink" aria-label="Masquer">
                <X size={14} />
              </button>
            </div>
          )}
          {children}
        </div>
      </div>

      {/* ---- Capture rapide : toujours accessible, ne casse pas le focus ---- */}
      <button onClick={() => setCapture(true)} title="Capturer une idée (sans interrompre)"
        className="btn-sun fixed bottom-6 right-6 z-40 flex h-13 w-13 items-center justify-center rounded-full p-3.5 shadow-lg shadow-black/40">
        <Plus size={22} strokeWidth={2.4} />
      </button>

      <QuickCapture open={capture} onClose={() => setCapture(false)} />
    </div>
  )
}
