import { Outlet } from 'react-router-dom'

/** Onglet « Vérifications » : garde-fous (alertes/check-lists). La page Listes de courses a son propre bouton dans le menu. */
export function VerificationsLayout() {
  return (
    <div className="pt-1">
      <Outlet />
    </div>
  )
}
