import { useMemo, useState } from 'react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { Plus, Pencil } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { Card, Badge, ProgressBar, DomainDot, Modal, EmptyState, Seg } from '../components/ui'
import type { Project, ProjectStatus } from '../lib/types'

const STATUS_LABEL: Record<ProjectStatus, string> = {
  actif: 'Actif', pause: 'En pause', termine: 'Terminé', abandonne: 'Abandonné',
}

export function ProjectsView() {
  const s = useHorizon()
  const [tab, setTab] = useState<'actif' | 'pause' | 'clos'>('actif')
  const [editing, setEditing] = useState<Project | null>(null)
  const [creating, setCreating] = useState(false)

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
          <p className="text-sm text-ink-3">Où en sont mes projets ? Peu de projets, mais qui avancent.</p>
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
            const calmDays = differenceInCalendarDays(new Date(), parseISO(p.last_activity_at))
            return (
              <Card key={p.id} className="card-hover">
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
                  <button onClick={() => setEditing(p)} className="btn-ghost shrink-0 p-1.5" aria-label="Modifier">
                    <Pencil size={14} />
                  </button>
                </div>

                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between text-xs text-ink-3">
                    <span>Avancement</span><span className="tabular-nums">{p.progress}%</span>
                  </div>
                  <ProgressBar value={p.progress} color={domain?.color ?? 'var(--color-sun)'} />
                </div>

                <p className="mt-3 text-sm text-ink-2">
                  {p.next_action
                    ? <><span className="text-ink-3">Prochaine action : </span>{p.next_action}</>
                    : <span className="text-[#eda145]">Aucune prochaine action définie</span>}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {p.blocked && <Badge tone="bad">bloqué{p.blocked_reason ? ` — ${p.blocked_reason}` : ''}</Badge>}
                  {p.status === 'actif' && calmDays >= 10 && <Badge tone="warn">calme depuis {calmDays} j</Badge>}
                  {openTasks.length > 0 && <Badge>{openTasks.length} tâche{openTasks.length > 1 ? 's' : ''} ouverte{openTasks.length > 1 ? 's' : ''}</Badge>}
                  {p.status !== 'actif' && <Badge>{STATUS_LABEL[p.status]}</Badge>}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <ProjectForm open={creating || editing !== null} project={editing}
        onClose={() => { setCreating(false); setEditing(null) }} />
    </div>
  )
}

function ProjectForm({ open, project, onClose }: { open: boolean; project: Project | null; onClose: () => void }) {
  const s = useHorizon()
  const [form, setForm] = useState<Record<string, unknown> | null>(null)

  // initialisation paresseuse à l'ouverture
  const current = form ?? {
    title: project?.title ?? '',
    domain_id: project?.domain_id ?? s.domains[0]?.id ?? '',
    objective_id: project?.objective_id ?? '',
    description: project?.description ?? '',
    status: project?.status ?? 'actif',
    progress: project?.progress ?? 0,
    next_action: project?.next_action ?? '',
    blocked: project?.blocked ?? false,
    blocked_reason: project?.blocked_reason ?? '',
  }
  const setF = (k: string, v: unknown) => setForm({ ...current, [k]: v })

  const close = () => { setForm(null); onClose() }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const values = {
      ...current,
      objective_id: current.objective_id || null,
      next_action: (current.next_action as string).trim() || null,
      blocked_reason: current.blocked ? ((current.blocked_reason as string).trim() || null) : null,
      description: (current.description as string).trim() || null,
      last_activity_at: new Date().toISOString(),
    }
    if (project) await s.update('projects', project.id, values)
    else await s.insert('projects', values)
    close()
  }

  const domainObjectives = s.objectives.filter((o) => o.domain_id === current.domain_id && o.status === 'actif')

  return (
    <Modal open={open} onClose={close} title={project ? 'Modifier le projet' : 'Nouveau projet'} wide>
      <form onSubmit={save} className="space-y-3">
        <input required value={current.title as string} onChange={(e) => setF('title', e.target.value)}
          placeholder="Titre du projet" className="field" autoFocus />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-ink-3">
            Domaine
            <select value={current.domain_id as string} onChange={(e) => setF('domain_id', e.target.value)} className="field">
              {s.domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-ink-3">
            Objectif servi (optionnel)
            <select value={current.objective_id as string} onChange={(e) => setF('objective_id', e.target.value)} className="field">
              <option value="">—</option>
              {domainObjectives.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
          </label>
        </div>
        <textarea value={current.description as string} onChange={(e) => setF('description', e.target.value)}
          placeholder="Description (optionnelle)" rows={2} className="field" />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-ink-3">
            Statut
            <select value={current.status as string} onChange={(e) => setF('status', e.target.value)} className="field">
              {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((k) => (
                <option key={k} value={k}>{STATUS_LABEL[k]}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-ink-3">
            Avancement : {current.progress as number}%
            <input type="range" min={0} max={100} step={5} value={current.progress as number}
              onChange={(e) => setF('progress', Number(e.target.value))} className="w-full accent-[#f59e0b]" />
          </label>
        </div>
        <input value={current.next_action as string} onChange={(e) => setF('next_action', e.target.value)}
          placeholder="Prochaine action concrète (fortement recommandé)" className="field" />
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={current.blocked as boolean}
            onChange={(e) => setF('blocked', e.target.checked)} className="accent-[#dc4a6b]" />
          Ce projet est bloqué
        </label>
        {(current.blocked as boolean) && (
          <input value={current.blocked_reason as string} onChange={(e) => setF('blocked_reason', e.target.value)}
            placeholder="Pourquoi ? (ex. en attente d'une réponse)" className="field" />
        )}
        <div className="flex justify-between gap-2 pt-1">
          {project ? (
            <button type="button" onClick={() => { void s.remove('projects', project.id); close() }}
              className="btn-ghost px-3 py-2 text-sm text-[#ec7f97]">Supprimer</button>
          ) : <span />}
          <button type="submit" className="btn-sun px-5 py-2">{project ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </form>
    </Modal>
  )
}
