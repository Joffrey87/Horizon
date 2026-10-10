import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useHorizon } from '../../lib/store'
import type { FiltreTitulaire } from '../../lib/finances'
import { moisCourant, type FinContexte } from './contexte'

/** Onglet « Finances » : chargement des données (à la première ouverture seulement),
 *  et mois + titulaire partagés entre les pages. Les pages sont dans le sous-menu
 *  « Finances » de la barre latérale (lib/financesNav.ts). */
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
      {charge ? <Outlet context={contexte} /> : <p className="pt-8 text-center text-sm text-ink-3">Chargement des finances…</p>}
    </div>
  )
}
