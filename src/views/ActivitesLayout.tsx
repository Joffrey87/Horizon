import { NavLink, Outlet } from 'react-router-dom'
import { Newspaper, BookOpen, Star } from 'lucide-react'

const TABS = [
  { to: '/activites/actualites', label: 'Actualités', icon: Newspaper },
  { to: '/activites/importantes', label: 'Actualités importantes', icon: Star },
  { to: '/activites/ecritures', label: 'Écritures', icon: BookOpen },
]

/** Onglet « Activités » : conteneur de plusieurs pages (Actualités, Évangile…),
 *  avec une sous-navigation en haut. */
export function ActivitesLayout() {
  return (
    <div className="pt-4">
      <nav className="mb-2 flex flex-wrap gap-1.5 border-b border-line pb-3">
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) =>
              `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                isActive ? 'bg-panel-3 text-sun-soft' : 'text-ink-2 hover:bg-panel-2 hover:text-ink'
              }`}>
            <Icon size={15} /> {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
