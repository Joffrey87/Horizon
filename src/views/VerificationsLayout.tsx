import { NavLink, Outlet } from 'react-router-dom'
import { ShieldCheck, ShoppingCart } from 'lucide-react'

const TABS = [
  { to: '/verifications', label: 'Garde-fous', icon: ShieldCheck, end: true },
  { to: '/verifications/listes', label: 'Listes', icon: ShoppingCart, end: false },
]

/** Onglet « Vérifications » : garde-fous (alertes/check-lists) + page Listes de courses. */
export function VerificationsLayout() {
  return (
    <div className="pt-4">
      <nav className="mb-2 flex flex-wrap gap-1.5 border-b border-line pb-3">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}
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
