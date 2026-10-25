import { NavLink, Outlet } from 'react-router-dom'
import { PAGES_DISCUSSIONS } from '../components/discussionsNav'

/** Onglet « Discussions » : Dispute. Sur grand écran, sous-menu de la barre latérale ; sur téléphone, boutons compacts en haut. */
export function DiscussionsLayout() {
  return (
    <div className="pt-1">
      <nav className="mb-2 flex gap-1 lg:hidden">
        {PAGES_DISCUSSIONS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) =>
              `flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm transition-colors ${
                isActive ? 'bg-panel-3 text-sun-soft' : 'text-ink-2 hover:bg-panel-2 hover:text-ink'}`}>
            <Icon size={15} /> {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
