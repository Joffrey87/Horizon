import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Wallet, BarChart3, ListOrdered, Landmark, PieChart, CalendarClock, Settings2 } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import type { FiltreTitulaire } from '../../lib/finances'
import { moisCourant, type FinContexte } from './contexte'

const TABS = [
  { to: '/finances', label: 'Budget', icon: Wallet, end: true },
  { to: '/finances/bilan', label: 'Bilan', icon: BarChart3, end: false },
  { to: '/finances/operations', label: 'Opérations', icon: ListOrdered, end: false },
  { to: '/finances/patrimoine', label: 'Patrimoine', icon: Landmark, end: false },
  { to: '/finances/investissements', label: 'Investissements', icon: PieChart, end: false },
  { to: '/finances/a-venir', label: 'À venir', icon: CalendarClock, end: false },
  { to: '/finances/reglages', label: 'Réglages', icon: Settings2, end: false },
]

/** Onglet « Finances » : sous-navigation, chargement des données (à la première
 *  ouverture seulement), et mois + titulaire partagés entre les pages. */
export function FinancesLayout() {
  const loadFinances = useHorizon((s) => s.loadFinances)
  const dejaCharge = useHorizon((s) => s.finLoaded)
  const [essaye, setEssaye] = useState(false)
  const [mois, setMois] = useState(moisCourant)
  const [filtre, setFiltre] = useState<FiltreTitulaire>('foyer')
  // Même en échec on affiche les pages : le bandeau d'erreur du Shell dit ce qui manque.
  useEffect(() => { void loadFinances().finally(() => setEssaye(true)) }, [loadFinances])
  const charge = dejaCharge || essaye
  const contexte: FinContexte = { mois, setMois, filtre, setFiltre }

  return (
    <div className="fin-voile pt-4">
      <nav className="mb-3 flex flex-wrap gap-1.5 border-b border-line pb-3">
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
      {charge ? <Outlet context={contexte} /> : <p className="pt-8 text-center text-sm text-ink-3">Chargement des finances…</p>}
    </div>
  )
}
