import { NavLink, Outlet } from 'react-router-dom'
import { ShieldCheck, ShoppingCart } from 'lucide-react'

const TABS = [
  { to: '/verifications', label: 'Garde-fous', icon: ShieldCheck, end: true },
  { to: '/verifications/listes', label: 'Listes', icon: ShoppingCart, end: false },
]

/** Onglet « Vérifications » : garde-fous (alertes/check-lists) + page Listes de courses. Boutons compacts, tout en haut (icône seule sur téléphone si inactif). */
export function VerificationsLayout() {
  return (
    <div className="pt-1">
      <nav className="mb-1.5 flex gap-1">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} title={label} aria-label={label}
            className={({ isActive }) =>
              `flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm transition-colors ${
                isActive ? 'bg-panel-3 text-sun-soft' : 'text-ink-2 hover:bg-panel-2 hover:text-ink'
              }`}>
            {({ isActive }) => (<><Icon size={15} /> <span className={isActive ? '' : 'max-sm:hidden'}>{label}</span></>)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
