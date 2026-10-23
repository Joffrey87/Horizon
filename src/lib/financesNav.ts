// Pages de l'onglet Finances : sous-menu de « Finances » dans la barre latérale (Shell).
// Module à part, sans dépendance aux vues : le Shell ne charge pas le code des Finances.
import { Wallet, LayoutDashboard, BarChart3, ListOrdered, Landmark, PieChart, CalendarClock, Settings2 } from 'lucide-react'
import { FINANCES_PARTAGEES } from './partage'
import type { Partage } from './types'

export const PAGES_FINANCES = [
  { to: '/finances', label: 'Résumé', icon: LayoutDashboard, end: true },
  { to: '/finances/budget', label: 'Budget', icon: Wallet, end: false },
  { to: '/finances/bilan', label: 'Bilan', icon: BarChart3, end: false },
  { to: '/finances/operations', label: 'Opérations', icon: ListOrdered, end: false },
  { to: '/finances/patrimoine', label: 'Patrimoine', icon: Landmark, end: false },
  { to: '/finances/investissements', label: 'Investissements', icon: PieChart, end: false },
  { to: '/finances/a-venir', label: 'À venir', icon: CalendarClock, end: false },
  { to: '/finances/reglages', label: 'Réglages', icon: Settings2, end: false },
]

/** Pages proposées : toutes, ou seulement celles ouvertes au partage (budget, bilan, patrimoine). */
export const pagesFinancesVisibles = (vue: Partage | null) =>
  vue ? PAGES_FINANCES.filter((p) => FINANCES_PARTAGEES.includes(p.to)) : PAGES_FINANCES
