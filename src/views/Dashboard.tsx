import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, AlertTriangle, Info, CheckCircle2, Circle,
  LayoutDashboard, X, Flag, FolderKanban, Repeat, Plus,
} from 'lucide-react'
import type { Project } from '../lib/types'
import { useHorizon } from '../lib/store'
import {
  computeAlerts, dayPhraseOfDay, domainBalance, eveningPhraseOfWeek, fmtDay,
  focusOfDay, greetingKind, habitStats, habitsForDay, quoteOfDay,
  suggestedReview, todayIso,
} from '../lib/logic'
import { Card, Badge, ProgressBar, DomainDot, EmptyState } from '../components/ui'
import { DomainRadar } from '../components/charts'

const DEFAULT_DOMAINS = [
  { name: 'Professionnel', color: '#d97706', icon: 'briefcase' },
  { name: 'Santé', color: '#0d9488', icon: 'heart' },
  { name: 'Spiritualité', color: '#8b5cf6', icon: 'flame' },
  { name: 'Famille & Amis', color: '#dc4a6b', icon: 'users' },
  { name: 'Finances', color: '#3987e5', icon: 'wallet' },
  { name: 'Personnel', color: '#65a30d', icon: 'sprout' },
]

const MORNING_GREETED_KEY = 'horizon.lastMorningGreetedDate'

export function Dashboard() {
  const s = useHorizon()
  const now = new Date()
  const today = todayIso()

  const [cockpitOpen, setCockpitOpen] = useState(false)

  const lastFocusReview = s.reviews.find((r) => (r.kind === 'confirmation' || r.kind === 'hebdo') && r.completed)
  const weekFocusIds = useMemo(() => lastFocusReview?.week_focus ?? [], [lastFocusReview])

  const focus = useMemo(() => focusOfDay(s.tasks, now, weekFocusIds), [s.tasks, weekFocusIds]) // eslint-disable-line react-hooks/exhaustive-deps
  const todaysHabits = useMemo(() => habitsForDay(s.habits, now), [s.habits]) // eslint-disable-line react-hooks/exhaustive-deps
  const alerts = useMemo(() => computeAlerts({
    projects: s.projects, habits: s.habits, logs: s.habitLogs, reviews: s.reviews, settings: s.settings,
  }), [s.projects, s.habits, s.habitLogs, s.reviews, s.settings])
  const balance = useMemo(() => domainBalance(s.domains, s.projects, s.tasks), [s.domains, s.projects, s.tasks])

  const actifs = s.projects.filter((p) => p.status === 'actif')
  const quote = quoteOfDay()
  const review = suggestedReview()
  const firstName = s.settings?.first_name
    ?? s.session?.user.email?.split('@')[0]?.replace(/^./, (c) => c.toUpperCase())

  // Habitudes tenues cette semaine (agrégé)
  const habitWeek = useMemo(() => {
    const active = s.habits.filter((h) => h.active)
    if (active.length === 0) return null
    let done = 0, target = 0
    for (const h of active) {
      const st = habitStats(h, s.habitLogs)
      done += Math.min(st.doneThisWeek, st.target); target += st.target
    }
    return target ? Math.round((100 * done) / target) : null
  }, [s.habits, s.habitLogs])

  const focusWeekTasks = s.tasks.filter((t) => weekFocusIds.includes(t.id))

  // ---- Salutation contextuelle ----
  // « Bonjour X » : seulement à la première ouverture du jour, avant 10h.
  // Journée : phrase du jour qui tourne. Soir (≥ 22h) : phrase inspirante hebdo.
  const [greeting] = useState(() => {
    const alreadyGreeted = (() => {
      try {
        return localStorage.getItem(MORNING_GREETED_KEY) === today
      } catch { return false }
    })()
    const kind = greetingKind(now, alreadyGreeted)
    if (kind === 'morning') {
      try { localStorage.setItem(MORNING_GREETED_KEY, today) } catch { /* noop */ }
    }
    return kind
  })

  const heroTitle = greeting === 'morning'
    ? `Bonjour ${firstName ?? ''}`.trim()
    : greeting === 'evening'
      ? eveningPhraseOfWeek(now)
      : dayPhraseOfDay(now)

  // ---- Premier lancement : proposer les domaines par défaut ----
  if (!s.loading && s.domains.length === 0) {
    return (
      <div className="rise mx-auto max-w-lg pt-16 text-center">
        <img src="/favicon.svg" alt="" className="mx-auto mb-4 h-16 w-16" />
        <h1 className="text-2xl font-semibold">Bienvenue dans Horizon</h1>
        <p className="mt-2 text-sm text-ink-2">
          Tout commence par tes <strong>domaines de vie</strong> : les grandes zones stables qui donnent
          leur contexte à tes objectifs, projets, habitudes et idées.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {DEFAULT_DOMAINS.map((d) => (
            <span key={d.name} className="flex items-center gap-1.5 rounded-full border border-line-2 px-3 py-1 text-sm text-ink-2">
              <DomainDot color={d.color} /> {d.name}
            </span>
          ))}
        </div>
        <button className="btn-sun mt-6 px-5 py-2.5"
          onClick={() => { DEFAULT_DOMAINS.forEach((d, i) => void s.insert('domains', { ...d, sort_order: i })) }}>
          Créer ces 6 domaines
        </button>
        <p className="mt-3 text-xs text-ink-3">Tu pourras les renommer, recolorer ou en ajouter dans « Domaines & objectifs ».</p>
      </div>
    )
  }

  // ---- Contenu du cockpit (drawer) ----
  const cockpitContent = (
    <div className="space-y-4">
      {/* Cartes cockpit */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard value={String(focus.length)} label="priorités aujourd'hui" to="/temps" />
        <StatCard value={String(actifs.length)} label="projets en cours" to="/projets"
          warn={actifs.length > (s.settings?.wip_limit ?? 5)} />
        <StatCard value={habitWeek === null ? '—' : `${habitWeek}%`} label="habitudes tenues cette semaine" to="/habitudes" />
        <StatCard value={String(focusWeekTasks.length || '—')} label="focus de la semaine" to="/revues" />
      </div>

      {review.kind && (
        <Link to="/revues" className="card card-hover flex items-center justify-between px-4 py-3">
          <p className="text-sm"><span className="text-sun-soft">Revue :</span> {review.label}</p>
          <ArrowRight size={16} className="text-ink-3" />
        </Link>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Aujourd'hui */}
        <Card title="Aujourd'hui" className="lg:col-span-2">
          {focus.length === 0 && todaysHabits.length === 0 ? (
            <EmptyState hint="Planifie des tâches dans « Temps » ou confirme ton focus le dimanche.">
              Rien d'imposé aujourd'hui. Cap libre.
            </EmptyState>
          ) : (
            <div className="space-y-1">
              {focus.map((t) => {
                const project = s.projects.find((p) => p.id === t.project_id)
                const domain = s.domains.find((d) => d.id === (t.domain_id ?? project?.domain_id))
                return (
                  <button key={t.id}
                    onClick={() => void s.update('tasks', t.id, { status: 'fait', done_at: new Date().toISOString() })}
                    className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-panel-2">
                    <Circle size={16} className="shrink-0 text-ink-3 group-hover:text-sun" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{t.title}</p>
                      <p className="truncate text-xs text-ink-3">
                        {project?.title ?? domain?.name ?? 'Tâche libre'}
                      </p>
                    </div>
                    {domain && <DomainDot color={domain.color} />}
                    {weekFocusIds.includes(t.id) && <Badge tone="sun">focus</Badge>}
                  </button>
                )
              })}
              {todaysHabits.length > 0 && (
                <>
                  <p className="block-title px-2 pb-1 pt-3">Habitudes du jour</p>
                  <div className="flex flex-wrap gap-1.5 px-2">
                    {todaysHabits.map((h) => {
                      const done = s.habitLogs.some((l) => l.habit_id === h.id && l.log_date === today && l.done)
                      const domain = s.domains.find((d) => d.id === h.domain_id)
                      return (
                        <button key={h.id} onClick={() => void s.toggleHabitToday(h.id, today)}
                          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                            done ? 'border-good/50 bg-good/10 text-[#4cc79a]' : 'border-line-2 text-ink-2 hover:border-line-2 hover:text-ink'
                          }`}>
                          {done ? <CheckCircle2 size={13} /> : <Circle size={13} className="text-ink-3" />}
                          {h.title}
                          {domain && <DomainDot color={domain.color} size={6} />}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </Card>

        {/* Équilibre */}
        <Card title="Équilibre des domaines"
          action={<Link to="/espace" className="text-xs text-ink-3 hover:text-sun-soft">Vue globale →</Link>}>
          <DomainRadar data={balance.map((b) => ({ label: b.domain.name, color: b.domain.color, value: b.value }))} />
          <p className="mt-1 text-center text-xs text-ink-3">Activité des 14 derniers jours</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Projets actifs */}
        <Card title="Projets actifs" className="lg:col-span-2"
          action={<Link to="/projets" className="text-xs text-ink-3 hover:text-sun-soft">Tous les projets →</Link>}>
          {actifs.length === 0 ? (
            <EmptyState hint="Choisis peu de projets, mais fais-les vraiment avancer.">Aucun projet actif.</EmptyState>
          ) : (
            <div className="space-y-3">
              {actifs.slice(0, 6).map((p) => {
                const domain = s.domains.find((d) => d.id === p.domain_id)
                return (
                  <div key={p.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        {domain && <DomainDot color={domain.color} />}
                        <p className="truncate text-sm">{p.title}</p>
                        {p.blocked && <Badge tone="bad">bloqué</Badge>}
                      </div>
                      <span className="text-xs tabular-nums text-ink-3">{p.progress}%</span>
                    </div>
                    <ProgressBar value={p.progress} color={domain?.color ?? 'var(--color-sun)'} />
                    <p className="truncate text-xs text-ink-3">
                      {p.next_action ? <>→ {p.next_action}</> : 'Pas de prochaine action définie'}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Alertes */}
        <Card title="Alertes">
          {alerts.length === 0 ? (
            <EmptyState>Tout est calme. Rien à signaler.</EmptyState>
          ) : (
            <ul className="space-y-2.5">
              {alerts.map((a) => (
                <li key={a.id}>
                  <Link to={a.link ?? '/'} className="group flex gap-2.5"
                    onClick={() => setCockpitOpen(false)}>
                    {a.severity === 'warn'
                      ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[#eda145]" />
                      : <Info size={15} className="mt-0.5 shrink-0 text-ink-3" />}
                    <div>
                      <p className="text-sm leading-snug text-ink-2 group-hover:text-ink">{a.label}</p>
                      {a.detail && <p className="mt-0.5 text-xs leading-snug text-ink-3">{a.detail}</p>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Focus de la semaine */}
      {focusWeekTasks.length > 0 && (
        <Card title="Focus de la semaine (confirmé dimanche)">
          <div className="flex flex-wrap gap-2">
            {focusWeekTasks.map((t) => (
              <Badge key={t.id} tone={t.status === 'fait' ? 'good' : 'sun'}>
                {t.status === 'fait' ? '✓ ' : ''}{t.title}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  )

  return (
    <div className="rise space-y-4">
      {/* ---- Accueil immersif : paysage seul, plus de contenu au scroll ---- */}
      <section className="relative mt-4 h-[calc(100vh-7rem)] min-h-[520px] overflow-hidden rounded-2xl border border-line">
        <img src="/horizon-bg.jpg" alt="" aria-hidden
          className="absolute inset-0 h-full w-full object-cover" />
        {/* voiles pour la lisibilité */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-black/50" />

        <div className="relative flex h-full flex-col p-6 lg:p-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-white drop-shadow-md lg:text-3xl">
                {heroTitle}
              </h1>
            </div>
            <span className="rounded-full border border-white/20 bg-black/30 px-3 py-1 text-xs capitalize text-white/85 backdrop-blur-md">
              {fmtDay(now)}
            </span>
          </div>

          {/* ---- Modules essentiels du cockpit, translucides sur le paysage ---- */}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {/* Priorités du jour */}
            <GlassTile icon={<Flag size={15} />} accent="#f59e0b" title="Priorités du jour">
              {focus.length === 0 ? (
                <p className="text-sm text-white/60">Cap libre aujourd'hui.</p>
              ) : (
                <ul className="space-y-1.5">
                  {focus.map((t) => (
                    <li key={t.id}>
                      <button onClick={() => void s.update('tasks', t.id, { status: 'fait', done_at: new Date().toISOString() })}
                        className="group flex w-full items-center gap-2 text-left">
                        <Circle size={15} className="shrink-0 text-white/50 transition-colors group-hover:text-sun" />
                        <span className="truncate text-sm text-white/90">{t.title}</span>
                        {weekFocusIds.includes(t.id) && <Badge tone="sun">focus</Badge>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </GlassTile>

            {/* Projets prioritaires */}
            <GlassTile icon={<FolderKanban size={15} />} accent="#3987e5" title="Projets prioritaires">
              {actifs.length === 0 ? (
                <p className="text-sm text-white/60">Aucun projet actif.</p>
              ) : (
                <ul className="space-y-2.5">
                  {actifs.slice(0, 3).map((p) => <ProjectRow key={p.id} project={p} />)}
                </ul>
              )}
            </GlassTile>

            {/* Habitudes du jour */}
            <GlassTile icon={<Repeat size={15} />} accent="#0d9488" title="Habitudes du jour">
              {todaysHabits.length === 0 ? (
                <p className="text-sm text-white/60">Rien de prévu.</p>
              ) : (
                <ul className="space-y-1.5">
                  {todaysHabits.map((h) => {
                    const done = s.habitLogs.some((l) => l.habit_id === h.id && l.log_date === today && l.done)
                    return (
                      <li key={h.id}>
                        <button onClick={() => void s.toggleHabitToday(h.id, today)}
                          className="group flex w-full items-center gap-2 text-left">
                          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border transition-colors ${
                            done ? 'border-good/70 bg-good/70 text-white' : 'border-white/40 group-hover:border-white/70'
                          }`}>
                            {done && <CheckCircle2 size={12} />}
                          </span>
                          <span className={`truncate text-sm ${done ? 'text-white/50 line-through' : 'text-white/90'}`}>{h.title}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </GlassTile>
          </div>

          {/* Citation discrète en bas, uniquement si activée */}
          {s.settings?.daily_quote !== false && (
            <div className="mt-auto text-center">
              <p className="text-xs italic text-white/70 drop-shadow">
                « {quote.text} »{quote.source && <span className="not-italic text-white/50"> — {quote.source}</span>}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ---- Bouton flottant : ouvre le cockpit ---- */}
      <button onClick={() => setCockpitOpen(true)}
        aria-label="Ouvrir le cockpit"
        className="fixed right-4 top-1/2 z-30 flex -translate-y-1/2 items-center gap-2 rounded-full border border-white/25 bg-black/55 px-4 py-2.5 text-white shadow-lg shadow-black/40 backdrop-blur-md transition-colors hover:bg-black/75">
        <LayoutDashboard size={16} />
        <span className="text-xs font-semibold uppercase tracking-[0.16em]">Cockpit</span>
      </button>

      {/* ---- Zone de clic-hors (transparente, laisse voir le paysage) ---- */}
      {cockpitOpen && (
        <button onClick={() => setCockpitOpen(false)}
          aria-label="Fermer le cockpit"
          className="fixed inset-0 z-30 cursor-default bg-transparent" />
      )}

      {/* ---- Drawer cockpit : glisse depuis la droite, semi-transparent ---- */}
      <aside
        aria-hidden={!cockpitOpen}
        style={{ transform: cockpitOpen ? 'translateX(0)' : 'translateX(120%)' }}
        className={`fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-white/15 bg-black/55 shadow-2xl shadow-black/60 backdrop-blur-2xl transition-transform duration-300 ease-out sm:w-[560px] lg:w-[720px] ${
          cockpitOpen ? '' : 'pointer-events-none'
        }`}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Cockpit</p>
            <p className="text-xs text-white/50">{fmtDay(now)}</p>
          </div>
          <button onClick={() => setCockpitOpen(false)}
            aria-label="Fermer"
            className="rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          {cockpitContent}
        </div>
      </aside>
    </div>
  )
}

/** Ligne d'un projet sur l'accueil : prochaine tâche + « + » pour dérouler les autres. */
function ProjectRow({ project }: { project: Project }) {
  const s = useHorizon()
  const [open, setOpen] = useState(false)
  const domain = s.domains.find((d) => d.id === project.domain_id)
  const openTasks = s.tasks.filter((t) => t.project_id === project.id && !t.is_recurring
    && (t.status === 'a_faire' || t.status === 'en_cours'))
  const next = openTasks[0]
  const rest = openTasks.slice(1)

  const toggle = (id: string) => void s.update('tasks', id, { status: 'fait', done_at: new Date().toISOString() })

  return (
    <li>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-white/90">{project.title}</span>
        <span className="shrink-0 text-xs tabular-nums text-white/60">{project.progress}%</span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/15">
        <div className="h-full rounded-full" style={{ width: `${project.progress}%`, background: domain?.color ?? '#f59e0b' }} />
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        {next ? (
          <button onClick={() => toggle(next.id)} className="group flex min-w-0 flex-1 items-center gap-1.5 text-left">
            <Circle size={13} className="shrink-0 text-white/50 group-hover:text-sun" />
            <span className="truncate text-xs text-white/80">{next.title}</span>
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate text-xs text-white/50">
            {project.next_action ?? 'Pas de tâche à faire'}
          </span>
        )}
        {rest.length > 0 && (
          <button onClick={() => setOpen((v) => !v)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-white/25 text-white/70 transition-colors hover:bg-white/10"
            title={open ? 'Masquer' : `Voir ${rest.length} autre${rest.length > 1 ? 's' : ''}`}
            aria-label="Voir les autres tâches">
            {open ? <X size={12} /> : <Plus size={12} />}
          </button>
        )}
      </div>
      {open && rest.length > 0 && (
        <ul className="mt-1 space-y-1 pl-4">
          {rest.map((t) => (
            <li key={t.id}>
              <button onClick={() => toggle(t.id)} className="group flex w-full items-center gap-1.5 text-left">
                <Circle size={12} className="shrink-0 text-white/40 group-hover:text-sun" />
                <span className="truncate text-xs text-white/70">{t.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** Tuile translucide de l'accueil : icône colorée, léger dégradé, halo teinté. */
function GlassTile({ icon, accent, title, to, children }: {
  icon: React.ReactNode; accent: string; title: string; to?: string; children: React.ReactNode
}) {
  const inner = (
    <>
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: `${accent}33`, color: accent, boxShadow: `0 0 16px ${accent}55` }}>
          {icon}
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">{title}</p>
      </div>
      {children}
    </>
  )
  const cls = 'group relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-white/12 to-black/35 p-4 text-white shadow-lg shadow-black/30 backdrop-blur-md transition-all'
  return to
    ? <Link to={to} className={`${cls} hover:-translate-y-0.5 hover:border-white/25`}>{inner}</Link>
    : <div className={cls}>{inner}</div>
}

function StatCard({ value, label, to, warn = false }: { value: string; label: string; to: string; warn?: boolean }) {
  return (
    <Link to={to} className="card card-hover p-4">
      <p className={`text-3xl font-semibold tabular-nums ${warn ? 'text-[#eda145]' : 'text-ink'}`}>{value}</p>
      <p className="mt-1 text-xs leading-snug text-ink-3">{label}</p>
    </Link>
  )
}
