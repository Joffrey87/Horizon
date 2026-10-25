import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useHorizon } from '../../lib/store'
import type { FiltreTitulaire } from '../../lib/finances'
import { PAGES_GLISSANTES, pagesFinancesVisibles } from '../../lib/financesNav'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { moisCourant, useVue, type FinContexte } from './contexte'
import { NavMois } from './partage'

const FILTRES: { value: FiltreTitulaire; label: string }[] = [
  { value: 'foyer', label: 'Foyer' }, { value: 'commun', label: 'Commun' },
  { value: 'joffrey', label: 'Joffrey' }, { value: 'honorine', label: 'Honorine' },
]

/** Le toucher a-t-il commencé dans une zone qui défile elle-même de côté (tableau, rayons) ? Alors on ne change pas de page. */
function dansZoneDefilante(cible: EventTarget | null): boolean {
  for (let el = cible instanceof HTMLElement ? cible : null; el; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) return true
  }
  return false
}

/** Onglet « Finances » : chargement des données (à la première ouverture seulement),
 *  et mois + titulaire partagés entre les pages. Les pages sont dans le sous-menu
 *  « Finances » de la barre latérale (lib/financesNav.ts). Téléphone : mois et titulaire
 *  vont dans la barre du haut (un seul bouton-liste pour le titulaire) et Résumé, Budget
 *  et Bilan se parcourent en glissant le doigt de côté. */
export function FinancesLayout() {
  const loadFinances = useHorizon((s) => s.loadFinances)
  const dejaCharge = useHorizon((s) => s.finLoaded)
  const [essaye, setEssaye] = useState(false)
  const [mois, setMois] = useState(moisCourant)
  const [filtre, setFiltre] = useState<FiltreTitulaire>('foyer')
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const vue = useVue()
  // Même en échec on affiche les pages : le bandeau d'erreur du Shell dit ce qui manque.
  useEffect(() => { void loadFinances().finally(() => setEssaye(true)) }, [loadFinances])
  const charge = dejaCharge || essaye

  const chemin = pathname.replace(/\/$/, '') || '/finances'
  const etroit = useMediaQuery('(max-width: 1023px)')
  const pages = PAGES_GLISSANTES.filter((to) => pagesFinancesVisibles(vue).some((p) => p.to === to))
  const position = pages.indexOf(chemin)
  const [emplacement, setEmplacement] = useState<HTMLElement | null>(null)
  useEffect(() => { setEmplacement(document.getElementById('fin-barre-haut')) }, [chemin, etroit])
  const barreHaute = etroit && position >= 0 && emplacement !== null
  const contexte: FinContexte = { mois, setMois, filtre, setFiltre, barreHaute }

  const depart = useRef<{ x: number; y: number; ok: boolean } | null>(null)
  const glisser = position >= 0 && etroit ? {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0]
      depart.current = t ? { x: t.clientX, y: t.clientY, ok: !dansZoneDefilante(e.target) } : null
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const d = depart.current, t = e.changedTouches[0]
      depart.current = null
      if (!d || !d.ok || !t) return
      const dx = t.clientX - d.x, dy = t.clientY - d.y
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return
      const cible = pages[position + (dx < 0 ? 1 : -1)]
      if (cible) navigate(cible)
    },
  } : {}

  return (
    <div className="fin-voile pt-1 lg:pt-4" {...glisser}>
      {barreHaute && emplacement && createPortal(
        <div className="flex min-w-0 items-center justify-center gap-1.5" data-testid="barre-finances">
          <NavMois mois={mois} onChange={setMois} />
          <select value={filtre} onChange={(e) => setFiltre(e.target.value as FiltreTitulaire)} aria-label="Compte affiché"
            className="field !w-auto !py-1 !pl-2 !pr-6 text-xs">
            {FILTRES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>, emplacement)}
      {charge ? <Outlet context={contexte} /> : <p className="pt-8 text-center text-sm text-ink-3">Chargement des finances…</p>}
      {barreHaute && pages.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
          {pages.map((to) => <span key={to} className={`h-1.5 w-1.5 rounded-full ${to === chemin ? 'bg-sun-soft' : 'bg-white/20'}`} />)}
        </div>
      )}
    </div>
  )
}
