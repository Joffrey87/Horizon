import { useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import {
  Home, FolderKanban, ListTodo, Compass, CalendarDays, Lightbulb,
  Repeat, ClipboardCheck, Network, Settings, Sparkles, Plus, LogOut, Menu,
} from 'lucide-react'
import { useHorizon } from '../lib/store'
import { QuickCapture } from './QuickCapture'
import { AssistantPanel } from './AssistantPanel'

const NAV = [
  { to: '/', label: 'Accueil', icon: Home },
  { to: '/projets', label: 'Projets', icon: FolderKanban },
  { to: '/priorites', label: 'Priorités', icon: ListTodo },
  { to: '/domaines', label: 'Domaines & objectifs', icon: Compass },
  { to: '/temps', label: 'Temps', icon: CalendarDays },
  { to: '/idees', label: 'Idées', icon: Lightbulb },
  { to: '/habitudes', label: 'Habitudes', icon: Repeat },
  { to: '/revues', label: 'Revues', icon: ClipboardCheck },
  { to: '/espace', label: 'Espace visuel', icon: Network },
]

export function Shell({ children }: { children: ReactNode }) {
  const [capture, setCapture] = useState(false)
  const [assistant, setAssistant] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const signOut = useHorizon((s) => s.signOut)

  return (
    <div className="flex min-h-screen overflow-x-hidden">
      {/* ---- Barre latérale (style options 1/3) ---- */}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-panel
        transition-transform lg:static lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Link to="/" onClick={() => setMenuOpen(false)}
          className="flex items-center gap-3 px-5 py-5 transition-opacity hover:opacity-80"
          aria-label="Retour à l'accueil">
          <img src="/favicon.svg" alt="" className="h-9 w-9" />
          <div>
            <p className="text-sm font-bold tracking-[0.22em]">HORIZON</p>
            <p className="text-[10px] uppercase tracking-wider text-ink-3">Cap · Clarté · Focus</p>
          </div>
        </Link>

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
          <button onClick={() => { setAssistant(true); setMenuOpen(false) }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink">
            <Sparkles size={16} strokeWidth={1.8} className="text-sun" />
            Assistant
          </button>
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
          <div className="mb-2 flex items-center justify-between lg:hidden">
            <button onClick={() => setMenuOpen(true)} className="btn-ghost p-2" aria-label="Menu">
              <Menu size={18} />
            </button>
            <Link to="/" aria-label="Retour à l'accueil">
              <img src="/favicon.svg" alt="Horizon" className="h-8 w-8" />
            </Link>
          </div>
          {children}
        </div>
      </div>

      {/* ---- Capture rapide : toujours accessible, ne casse pas le focus ---- */}
      <button onClick={() => setCapture(true)} title="Capturer une idée (sans interrompre)"
        className="btn-sun fixed bottom-6 right-6 z-40 flex h-13 w-13 items-center justify-center rounded-full p-3.5 shadow-lg shadow-black/40">
        <Plus size={22} strokeWidth={2.4} />
      </button>

      <QuickCapture open={capture} onClose={() => setCapture(false)} />
      <AssistantPanel open={assistant} onClose={() => setAssistant(false)} />
    </div>
  )
}
