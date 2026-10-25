import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  FolderKanban, ListTodo, Compass, CalendarDays, CalendarRange,
  Repeat, ClipboardCheck, Network, Settings, Plus, LogOut, Menu, ArrowLeft, ShieldCheck, Timer, Newspaper,
  AlertTriangle, X, RotateCw, Ellipsis, ChevronDown, ChevronRight, ArrowLeftRight, Wallet, Eye, Hourglass, ShoppingCart, Euro, Target,
} from 'lucide-react'
import { useHorizon, vueCourante } from '../lib/store'
import { ONGLETS_PARTAGE, pageAccueil, routeAutorisee } from '../lib/partage'
import { PAGES_GLISSANTES, pagesFinancesVisibles } from '../lib/financesNav'
import { todayIso, wallpaperOfDay } from '../lib/logic'
import { QuickAdd } from './QuickAdd'
import { CroixLatine, LivreCroix, PAGES_CHARITE } from './chariteNav'
import { useMediaQuery } from '../lib/useMediaQuery'
import { ROUTE_ACCUEIL, ROUTE_COURSES } from '../lib/navigation'

// Agendas externes : on resynchronise au plus une fois par demi-heure. Inutile
// d'aller plus vite — Google met son propre export iCal en cache.
const SYNC_KEY = 'horizon.agenda.sync'
const SYNC_MS = 30 * 60 * 1000

const NAV = [
  { to: '/temps', label: 'Agenda', icon: CalendarDays },
  { to: '/priorites', label: 'Priorités', icon: ListTodo },
  { to: '/finances', label: 'Finances', icon: Wallet },
  { to: '/charite', label: 'Charité', icon: CroixLatine },
  { to: '/verifications/listes', label: 'Listes', icon: ShoppingCart },
  // Rangés sous « Autres » (voir ROUTES_AUTRES) :
  { to: '/projets', label: 'Projets', icon: FolderKanban },
  { to: '/domaines', label: 'Domaines & objectifs', icon: Compass },
  { to: '/planification', label: 'Planification', icon: CalendarRange },
  { to: '/habitudes', label: 'Habitudes', icon: Repeat },
  { to: '/activites', label: 'Activités', icon: Newspaper },
  { to: '/revues', label: 'Revues', icon: ClipboardCheck },
  { to: '/verifications', label: 'Vérifications', icon: ShieldCheck },
  { to: '/heures-controle', label: 'Heures de contrôle', icon: Timer },
  { to: '/remplas', label: 'Remplas', icon: ArrowLeftRight },
  { to: '/espace', label: 'Espace visuel', icon: Network },
]

/** Pages rangées sous l'onglet « Autres » de la barre latérale. */
const ROUTES_AUTRES = ['/projets', '/domaines', '/planification', '/habitudes', '/revues', '/heures-controle', '/remplas', '/espace', '/verifications', '/activites']

/** Date du jour, remise à jour à minuit et au retour sur l'onglet : sans ça, un
 *  onglet laissé ouvert la nuit continue d'afficher la veille (les vues lisent
 *  `new Date()` au rendu, qui n'a pas lieu tant que rien ne bouge). */
function useDayKey(): string {
  const [day, setDay] = useState(todayIso)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const check = () => {
      setDay(todayIso())
      const now = new Date()
      const minuit = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
      clearTimeout(timer)
      timer = setTimeout(check, minuit.getTime() - now.getTime())
    }
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    check()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
    }
  }, [])
  return day
}

function BoutonPlus({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button onClick={onClick} title="Ajouter (tâche, idée, achat, rappel, courses)" aria-label="Ajouter" className={className}>
      <Plus size={18} strokeWidth={2.4} />
    </button>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const dayKey = useDayKey()
  const [capture, setCapture] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [autresOuvert, setAutresOuvert] = useState(false)
  const signOut = useHorizon((s) => s.signOut)
  const error = useHorizon((s) => s.error)
  const clearError = useHorizon((s) => s.clearError)
  const loadAll = useHorizon((s) => s.loadAll)
  const syncAgenda = useHorizon((s) => s.syncAgenda)
  const nbAgendas = useHorizon((s) => s.calendarFeeds.length)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // Vue partagée (compte invité, ou aperçu « Voir comme… ») : menu et pages limités.
  const vue = useHorizon((s) => vueCourante(s))
  const apercu = useHorizon((s) => s.apercu)
  const setApercu = useHorizon((s) => s.setApercu)
  const accueil = vue ? pageAccueil(vue) ?? '/' : ROUTE_ACCUEIL
  const nav = vue ? NAV.filter((n) => ONGLETS_PARTAGE.some((o) => vue.onglets.includes(o.cle) && o.route === n.to)) : NAV
  const navPrincipal = nav.filter((n) => !ROUTES_AUTRES.includes(n.to))
  const navAutres = nav.filter((n) => ROUTES_AUTRES.includes(n.to))
  const dans = (to: string) => pathname === to || pathname.startsWith(`${to}/`)
  // Listes est en accès direct : y être n'ouvre pas « Autres » (même si Vérifications, rangé dedans, partage le début de l'adresse).
  const surAutres = !navPrincipal.some((n) => dans(n.to)) && navAutres.some((n) => dans(n.to))
  const autresVisible = autresOuvert || surAutres
  useEffect(() => {
    // L'aperçu montre ce qu'elle verra une fois l'accès validé.
    const v = vue && apercu ? { ...vue, actif: true } : vue
    if (v?.actif && !routeAutorisee(pathname, v)) navigate(pageAccueil(v) ?? '/', { replace: true })
  }, [vue, apercu, pathname, navigate])
  // Raccourci « Courses » dans l'Agenda (pas en vue partagée : la liste est privée).
  const caddie = !vue && pathname.startsWith('/temps')
  // Agenda (téléphone) : le « + » quitte le coin de l'écran et rejoint la ligne du haut, à côté du caddie.
  // Téléphone seulement : sur ordinateur, le « + » reste en bas à droite comme avant.
  const telephone = useMediaQuery('(max-width: 767px)')
  // Téléphone : le « + » vit dans la barre de raccourcis du bas.
  const plusEnHaut = false
  const pleineLargeur = pathname === ROUTE_ACCUEIL || pathname.startsWith('/temps')

  useEffect(() => {
    if (nbAgendas === 0 || vue) return
    let dernier = 0
    try { dernier = Number(localStorage.getItem(SYNC_KEY) ?? 0) } catch { /* stockage indispo */ }
    if (Date.now() - dernier < SYNC_MS) return
    // Marqué AVANT l'appel : la synchro recharge le store, ce qui repasserait ici.
    try { localStorage.setItem(SYNC_KEY, String(Date.now())) } catch { /* stockage indispo */ }
    // L'échec ne doit PAS rester muet : sans ça, un agenda qui ne se synchronise
    // pas se présente comme un agenda vide.
    void syncAgenda().then((r) => {
      if (!r.ok) useHorizon.setState({ error: `Agenda non synchronisé : ${r.error}` })
    })
  }, [nbAgendas, syncAgenda, vue])

  return (
    <div className="flex min-h-dvh overflow-x-clip">
      {/* ---- Fond paysage du jour de l'accueil, répliqué en version très estompée (pages hors accueil) ---- */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-bg">
        <img src={wallpaperOfDay()} alt="" className="h-full w-full object-cover opacity-30" />
      </div>

      {/* ---- Barre latérale (style options 1/3) ---- */}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-52 flex-col border-r border-line bg-panel
        transition-transform lg:sticky lg:top-0 lg:h-dvh pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] lg:shrink-0 lg:self-start lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-1 px-5 py-5">
          <Link to={accueil} onClick={() => setMenuOpen(false)}
            className="flex items-center gap-3 transition-opacity hover:opacity-80"
            aria-label="Retour à l'accueil">
            <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-white/10">
              <img src="/logo.png" alt="Horizon" className="h-full w-full object-cover"
                style={{ transform: 'scale(2.1)', transformOrigin: '50% 41%' }} />
            </span>
            <div>
              <p className="text-sm font-bold tracking-[0.22em]">HORIZON</p>
            </div>
          </Link>
        </div>

        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3">
          {navPrincipal.map(({ to, label, icon: Icon }) => (
            <Fragment key={to}>
              <NavLink to={to} end={to === ROUTE_ACCUEIL || to === '/verifications'} onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                    isActive ? 'bg-panel-3 text-sun-soft' : 'text-ink-2 hover:bg-panel-2 hover:text-ink'
                  }`}>
                <Icon size={16} strokeWidth={1.8} />
                {label}
              </NavLink>
              {/* Sous-menu de Finances, déplié quand on y est. */}
              {to === '/finances' && pathname.startsWith('/finances') && (
                <div className="mb-1 ml-5 space-y-0.5 border-l border-line pl-2">
                  {pagesFinancesVisibles(vue).map((p) => (
                    <NavLink key={p.to} to={p.to} end={p.end} onClick={() => setMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
                          isActive ? 'bg-panel-2 text-sun-soft' : 'text-ink-3 hover:bg-panel-2 hover:text-ink'
                        }`}>
                      <p.icon size={14} strokeWidth={1.8} />
                      {p.label}
                    </NavLink>
                  ))}
                </div>
              )}
              {/* Sous-menu de Charité : toujours affiché. */}
              {to === '/charite' && (
                <div className="mb-1 ml-5 space-y-0.5 border-l border-line pl-2">
                  {PAGES_CHARITE.map((p) => (
                    <NavLink key={p.to} to={p.to} onClick={() => setMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
                          isActive ? 'bg-panel-2 text-sun-soft' : 'text-ink-3 hover:bg-panel-2 hover:text-ink'
                        }`}>
                      <p.icon size={14} strokeWidth={1.8} />
                      {p.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </Fragment>
          ))}
          {/* Autres : les pages moins courantes, repliées sous un seul onglet (dépliées quand on est dans l'une d'elles). */}
          {navAutres.length > 0 && (
            <div>
              <button type="button" onClick={() => setAutresOuvert((o) => !o)} aria-expanded={autresVisible} data-testid="onglet-autres"
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                  surAutres ? 'text-sun-soft' : 'text-ink-2 hover:bg-panel-2 hover:text-ink'}`}>
                <Ellipsis size={16} strokeWidth={1.8} />
                <span className="flex-1 text-left">Autres</span>
                {autresVisible ? <ChevronDown size={14} className="text-ink-3" /> : <ChevronRight size={14} className="text-ink-3" />}
              </button>
              {autresVisible && (
                <div className="mb-1 ml-5 space-y-0.5 border-l border-line pl-2">
                  {navAutres.map(({ to, label, icon: Icon }) => (
                    <NavLink key={to} to={to} onClick={() => setMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
                          isActive ? 'bg-panel-2 text-sun-soft' : 'text-ink-3 hover:bg-panel-2 hover:text-ink'
                        }`}>
                      <Icon size={14} strokeWidth={1.8} />
                      {label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="space-y-0.5 border-t border-line px-3 py-3">
          {/* Agenda : raccourcis courses et finances, en bas du menu. */}
          {caddie && (
            <div className="mb-1 flex items-center gap-1">
              <Link to={ROUTE_COURSES} onClick={() => setMenuOpen(false)} className="btn-ghost p-2"
                aria-label="Liste de courses" title="Liste de courses">
                <ShoppingCart size={18} strokeWidth={1.9} />
              </Link>
              <Link to="/finances" onClick={() => setMenuOpen(false)} className="btn-ghost p-2"
                aria-label="Résumé des finances" title="Résumé des finances">
                <Euro size={18} strokeWidth={1.9} />
              </Link>
            </div>
          )}
          {/* Assistant mis de côté (masqué) — voir AssistantPanel.tsx, réactivable plus tard. */}
          {!vue && (
            <NavLink to="/parametres" onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                  isActive ? 'bg-panel-3 text-sun-soft' : 'text-ink-2 hover:bg-panel-2 hover:text-ink'
                }`}>
              <Settings size={16} strokeWidth={1.8} />
              Paramètres
            </NavLink>
          )}
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
        {/* L'accueil (paysage de bord à bord) et Temps (grilles denses) prennent toute la
            largeur ; les autres pages restent centrées dans une colonne de lecture. */}
        <div className={`ios-marges mx-auto px-4 pt-4 lg:px-8 ${pathname.startsWith('/temps') ? 'pb-16 md:pb-3' : 'pb-16'} max-md:pb-[calc(76px+env(safe-area-inset-bottom))] ${pleineLargeur ? '' : 'max-w-6xl'}`}>
          {/* Barre mobile : menu + retour + logo (n'existe qu'en petit écran) */}
          <div className="mb-2 flex items-center justify-between gap-2 lg:hidden">
            <div className="flex shrink-0 items-center gap-1">
              <button onClick={() => setMenuOpen(true)} className="btn-ghost p-2" aria-label="Menu">
                <Menu size={18} />
              </button>
              <button onClick={() => navigate(-1)} className="btn-ghost p-2"
                aria-label="Revenir à la page précédente" title="Revenir à la page précédente">
                <ArrowLeft size={18} strokeWidth={2} />
              </button>
            </div>
            {/* Finances : ses pages sur la même ligne (défilent de côté si elles ne tiennent pas). */}
            {pathname.startsWith('/finances') && PAGES_GLISSANTES.includes(pathname.replace(/\/$/, '')) && (
              <div id="fin-barre-haut" className="flex min-w-0 flex-1 items-center justify-center" />
            )}
            {pathname.startsWith('/finances') && !PAGES_GLISSANTES.includes(pathname.replace(/\/$/, '')) && (
              <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {pagesFinancesVisibles(vue).map((p) => (
                  <NavLink key={p.to} to={p.to} end={p.end}
                    className={({ isActive }) => `flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors ${
                      isActive ? 'bg-panel-3 text-sun-soft' : 'text-ink-2 hover:bg-panel-2'}`}>
                    <p.icon size={13} strokeWidth={1.8} /> {p.label}
                  </NavLink>
                ))}
              </nav>
            )}
            <div className="flex shrink-0 items-center gap-1">
              {/* Agenda : raccourci vers la liste de courses, à côté du logo qui mène à l'accueil. */}
              {/* Téléphone : caddie et € sont dans la barre de raccourcis du bas. */}
              {plusEnHaut && <BoutonPlus onClick={() => setCapture(true)} className="btn-sun flex h-9 w-9 shrink-0 items-center justify-center rounded-full p-0 shadow shadow-black/40" />}
              {!pathname.startsWith('/finances') && <Link to={accueil} aria-label="Retour à l'accueil" className="shrink-0">
                <span className="block h-8 w-8 overflow-hidden rounded-full ring-1 ring-white/10">
                  <img src="/logo.png" alt="Horizon" className="h-full w-full object-cover"
                    style={{ transform: 'scale(2.1)', transformOrigin: '50% 41%' }} />
                </span>
              </Link>}
            </div>
          </div>
          {/* ---- Bandeau d'erreur : une panne réseau ou une écriture perdue se voit,
               au lieu de passer pour un compte vide ou un enregistrement réussi. ---- */}
          {error && (
            <div role="alert"
              className="mb-3 flex items-start gap-2 rounded-xl border border-[#ef4444]/50 bg-[#ef4444]/12 px-3 py-2 text-sm">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[#ff6b6b]" />
              <p className="min-w-0 flex-1 text-ink-2">{error}</p>
              <button onClick={() => { clearError(); void loadAll() }}
                className="btn-ghost flex shrink-0 items-center gap-1 px-2 py-1 text-xs" title="Recharger les données">
                <RotateCw size={12} /> Réessayer
              </button>
              <button onClick={clearError} className="btn-ghost shrink-0 p-1 text-ink-3 hover:text-ink" aria-label="Masquer">
                <X size={14} />
              </button>
            </div>
          )}
          {/* Aperçu « Voir comme… » : on le sait toujours, et on en sort d'un clic. */}
          {apercu && vue && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-sun/40 bg-sun/10 px-3 py-2 text-sm">
              <Eye size={16} className="shrink-0 text-sun" />
              <p className="min-w-0 flex-1 text-ink-2">
                Aperçu : Horizon tel que le voit <span className="font-medium text-ink">{vue.member_name || vue.member_email}</span>
                {vue.actif ? '' : ' (accès pas encore validé : elle ne voit rien pour l’instant)'}.
              </p>
              <button onClick={() => { void setApercu(null); navigate('/parametres') }} className="btn-ghost shrink-0 px-2 py-1 text-xs">
                Quitter l’aperçu
              </button>
            </div>
          )}
          {/* Nouvelle clé à minuit : les vues se remontent et relisent la date. */}
          {vue && !vue.actif && !apercu ? (
            <div className="card mx-auto mt-10 max-w-md p-6 text-center">
              <Hourglass size={22} className="mx-auto mb-2 text-sun" />
              <p className="font-medium">Accès en attente</p>
              <p className="mt-1 text-sm text-ink-2">Ton compte est bien relié : il reste à le faire valider dans Horizon. Reviens un peu plus tard.</p>
            </div>
          ) : <Fragment key={dayKey}>{children}</Fragment>}
        </div>
      </div>

      {/* ---- Capture rapide : toujours accessible, ne casse pas le focus (pas en vue partagée) ---- */}
      {!vue && !plusEnHaut && !telephone && pathname !== '/finances' && (
        <button onClick={() => setCapture(true)} title="Ajouter (tâche, idée, achat, rappel, courses)" aria-label="Ajouter"
          className={`btn-sun fixed bottom-6 right-6 max-md:bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 flex h-13 w-13 items-center justify-center rounded-full p-3.5 shadow-lg shadow-black/40 ${
            // Agenda (ordinateur) : plus petit et plus bas, à côté du volet de notes, pour ne pas couvrir la marge des mois.
            pathname.startsWith('/temps') ? 'md:bottom-2 md:h-10 md:w-10 md:p-2.5' : ''}`}>
          <Plus size={22} strokeWidth={2.4} />
        </button>
      )}

      {/* Téléphone : barre de raccourcis en bas, sur tous les onglets (pas en vue partagée). */}
      {telephone && !vue && <BarreRaccourcis pathname={pathname} onPlus={() => setCapture(true)} />}
      <QuickAdd open={capture} onClose={() => setCapture(false)} />
    </div>
  )
}

const RACCOURCIS = [
  { to: '/finances', label: 'Finances', icon: Euro, actif: (p: string) => p.startsWith('/finances') },
  { to: ROUTE_COURSES, label: 'Liste de courses', icon: ShoppingCart, actif: (p: string) => p.startsWith('/verifications/listes') },
  { to: '/temps', label: 'Agenda', icon: CalendarDays, actif: (p: string) => p.startsWith('/temps') },
  { to: '/charite/ecritures', label: 'Écritures', icon: LivreCroix, actif: (p: string) => p.startsWith('/charite') },
  { to: '/priorites', label: 'Priorités', icon: Target, actif: (p: string) => p.startsWith('/priorites') },
]

/** Téléphone : capsule flottante en bas ; l'onglet actif dans un rond ambre. */
function BarreRaccourcis({ pathname, onPlus }: { pathname: string; onPlus: () => void }) {
  return (
    <nav aria-label="Raccourcis" className="fixed inset-x-0 bottom-0 z-40 px-3"
      style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}>
      <div className="mx-auto flex h-13 items-center justify-around rounded-full border border-line bg-panel/95 px-2 shadow-lg shadow-black/40 backdrop-blur">
        {RACCOURCIS.map(({ to, label, icon: Icon, actif }) => {
          const a = actif(pathname)
          return (
            <Link key={to} to={to} aria-label={label} title={label} aria-current={a ? 'page' : undefined}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${a ? 'bg-[#eda145] text-bg' : 'text-ink-2'}`}>
              <Icon size={18} strokeWidth={1.9} />
            </Link>
          )
        })}
        <button onClick={onPlus} aria-label="Ajouter" title="Ajouter (tâche, idée, achat, rappel, courses)"
          className="btn-sun flex h-10 w-10 items-center justify-center rounded-full p-0">
          <Plus size={18} strokeWidth={2.4} />
        </button>
      </div>
    </nav>
  )
}
