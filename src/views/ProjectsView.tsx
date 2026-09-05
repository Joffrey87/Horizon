import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Plus, Circle, GripVertical, NotebookPen, Pin } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { STATUS_LABEL } from '../lib/logic'
import { Card, Badge, ProgressBar, DomainDot, EmptyState, Seg } from '../components/ui'
import { FicheProjet, ProjectForm } from './FicheProjet'
import type { Project } from '../lib/types'


const fmtDate = (d: string) => format(parseISO(d), 'd MMM', { locale: fr })

export function ProjectsView() {
  const s = useHorizon()
  const [tab, setTab] = useState<'actif' | 'pause' | 'clos'>('actif')
  const [creating, setCreating] = useState(false)
  const [fiche, setFiche] = useState<{ id: string; vue: 'detail' | 'note' } | null>(null)
  const location = useLocation()
  const navigate = useNavigate()

  // Ouverture directe d'un projet depuis une autre page (clic sur son titre
  // depuis l'accueil). L'intention est CONSOMMÉE aussitôt : sans ça, la moindre
  // mise à jour du store rouvrirait la fiche, y compris après fermeture.
  useEffect(() => {
    const id = (location.state as { openProjectId?: string } | null)?.openProjectId
    if (!id) return
    if (s.projects.some((x) => x.id === id)) setFiche({ id, vue: 'detail' })
    navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, navigate, s.projects])

  const wip = s.settings?.wip_limit ?? 5
  const actifs = s.projects.filter((p) => p.status === 'actif')

  const shown = useMemo(() => {
    if (tab === 'actif') return actifs
    if (tab === 'pause') return s.projects.filter((p) => p.status === 'pause')
    return s.projects.filter((p) => p.status === 'termine' || p.status === 'abandonne')
  }, [tab, s.projects, actifs])

  return (
    <div className="rise space-y-4 pt-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Projets</h1>
      </div>
        <button onClick={() => setCreating(true)} className="btn-sun flex items-center gap-1.5 px-4 py-2 text-sm">
          <Plus size={15} /> Nouveau projet
        </button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Seg value={tab} onChange={setTab} options={[
          { value: 'actif', label: `Actifs (${actifs.length})` },
          { value: 'pause', label: 'En pause' },
          { value: 'clos', label: 'Clos' },
        ]} />
        <Badge tone={actifs.length > wip ? 'warn' : 'neutral'}>
          {actifs.length} / {wip} projets actifs
        </Badge>
      </div>

      {actifs.length > wip && tab === 'actif' && (
        <p className="text-xs text-[#eda145]">
          Au-delà du seuil de {wip} : rien d'interdit, mais peut-être qu'un projet peut attendre 6 mois ?
        </p>
      )}

      {shown.length === 0 ? (
        <Card><EmptyState>Aucun projet dans cette catégorie.</EmptyState></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((p) => {
            const domain = s.domains.find((d) => d.id === p.domain_id)
            const objective = s.objectives.find((o) => o.id === p.objective_id)
            const openTasks = s.tasks.filter((t) => t.project_id === p.id && (t.status === 'a_faire' || t.status === 'en_cours'))
            const stepCount = s.steps.filter((st) => st.project_id === p.id).length
            const calmDays = differenceInCalendarDays(new Date(), parseISO(p.last_activity_at))
            return (
              <Card key={p.id}
                className="card-hover cursor-pointer"
                onClick={() => setFiche({ id: p.id, vue: 'detail' })}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {domain && <DomainDot color={domain.color} />}
                      <h3 className="truncate font-medium">{p.title}</h3>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-3">
                      {domain?.name}{objective && <> · sert « {objective.title} »</>}
                    </p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setFiche({ id: p.id, vue: 'note' }) }}
                    className="btn-ghost shrink-0 p-1.5" aria-label="Note du projet" title="Note du projet">
                    <NotebookPen size={14} />
                  </button>
                </div>

                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between text-xs text-ink-3">
                    <span>Avancement</span><span className="tabular-nums">{p.progress}%</span>
                  </div>
                  <ProgressBar value={p.progress} color={domain?.color ?? 'var(--color-sun)'} />
                </div>

                <ProjectNextTasks project={p} />

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {p.blocked && <Badge tone="bad">bloqué{p.blocked_reason ? ` — ${p.blocked_reason}` : ''}</Badge>}
                  {p.status === 'actif' && calmDays >= 10 && <Badge tone="warn">calme depuis {calmDays} j</Badge>}
                  {openTasks.length > 0 && <Badge>{openTasks.length} tâche{openTasks.length > 1 ? 's' : ''} ouverte{openTasks.length > 1 ? 's' : ''}</Badge>}
                  {stepCount > 0 && <Badge tone="info">{stepCount} étape{stepCount > 1 ? 's' : ''}</Badge>}
                  {p.status !== 'actif' && <Badge>{STATUS_LABEL[p.status]}</Badge>}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <ProjectForm open={creating} project={null} onClose={() => setCreating(false)} />

      {fiche && (
        <FicheProjet projectId={fiche.id} vueInitiale={fiche.vue} onClose={() => setFiche(null)} />
      )}
    </div>
  )
}

/** Les 5 prochaines tâches d'un projet, réordonnables par glisser-déposer (met à jour sort_order). */
function ProjectNextTasks({ project }: { project: Project }) {
  const s = useHorizon()
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const fullOrdered = useMemo(
    () => s.tasks
      .filter((t) => t.project_id === project.id && !t.step_id && t.is_task !== false
        && (t.status === 'a_faire' || t.status === 'en_cours'))
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [s.tasks, project.id])
  const visible = fullOrdered.slice(0, 5)

  // Réordonne visuellement puis réindexe sort_order de toutes les tâches ouvertes du projet.
  const reorder = (from: number, to: number) => {
    if (from === to) return
    const v = [...visible]
    const moved = v.splice(from, 1)[0]
    if (!moved) return
    v.splice(to, 0, moved)
    const newFull = [...v, ...fullOrdered.slice(5)]
    newFull.forEach((t, i) => { if (t.sort_order !== i) void s.update('tasks', t.id, { sort_order: i }) })
  }

  if (visible.length === 0) {
    return <p className="mt-3 text-xs text-ink-3">Aucune tâche ouverte. Ouvre le projet pour en ajouter.</p>
  }

  return (
    <ul className="mt-3 space-y-0.5" onClick={(e) => e.stopPropagation()}>
      {visible.map((t, i) => (
        <li key={t.id} draggable
          onDragStart={(e) => { e.stopPropagation(); setDragIdx(i); e.dataTransfer.effectAllowed = 'move' }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (dragIdx !== null) reorder(dragIdx, i); setDragIdx(null) }}
          onDragEnd={() => setDragIdx(null)}
          className={`group flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:bg-panel-2/60 ${dragIdx === i ? 'opacity-50' : ''}`}>
          <GripVertical size={13} className="shrink-0 cursor-grab text-ink-3" />
          <button onClick={() => void s.update('tasks', t.id, { status: 'fait', done_at: new Date().toISOString() })}
            className="shrink-0" aria-label="Marquer fait" title="Marquer fait">
            <Circle size={15} className="text-ink-3 transition-colors hover:text-sun" />
          </button>
          <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{t.title}</span>
          {t.scheduled_date && <span className="shrink-0 text-[10px] text-ink-3">{fmtDate(t.scheduled_date)}</span>}
          <button onClick={() => void s.update('tasks', t.id, { home_pinned: !t.home_pinned })}
            className={`shrink-0 transition-opacity ${t.home_pinned ? 'text-sun' : 'text-ink-3 opacity-0 hover:text-ink-2 group-hover:opacity-100'}`}
            aria-label={t.home_pinned ? 'Retirer de l’accueil' : 'Épingler sur l’accueil'}
            title={t.home_pinned ? 'Épinglée sur l’accueil' : 'Épingler sur l’accueil'}>
            <Pin size={12} fill={t.home_pinned ? 'currentColor' : 'none'} />
          </button>
        </li>
      ))}
      {fullOrdered.length > 5 && (
        <li className="px-1 pt-0.5 text-[10px] text-ink-3">+ {fullOrdered.length - 5} autre{fullOrdered.length - 5 > 1 ? 's' : ''}</li>
      )}
    </ul>
  )
}

