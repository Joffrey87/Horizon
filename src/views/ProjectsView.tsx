import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Plus, Pencil, CheckCircle2, Circle, Trash2, Layers, CalendarClock, NotebookPen, GripVertical } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { Card, Badge, ProgressBar, DomainDot, Modal, EmptyState, Seg, NoteArea } from '../components/ui'
import { TaskForm } from '../components/TaskForm'
import type { Project, ProjectStatus, Step, Task } from '../lib/types'

const STATUS_LABEL: Record<ProjectStatus, string> = {
  actif: 'Actif', pause: 'En pause', termine: 'Terminé', abandonne: 'Abandonné',
}

const fmtDate = (d: string) => format(parseISO(d), 'd MMM', { locale: fr })

export function ProjectsView() {
  const s = useHorizon()
  const [tab, setTab] = useState<'actif' | 'pause' | 'clos'>('actif')
  const [editing, setEditing] = useState<Project | null>(null)
  const [creating, setCreating] = useState(false)
  const [openProject, setOpenProject] = useState<Project | null>(null)
  const [noteProject, setNoteProject] = useState<Project | null>(null)
  const location = useLocation()

  // Ouverture directe d'un projet depuis une autre page (ex. double-clic sur l'accueil).
  useEffect(() => {
    const id = (location.state as { openProjectId?: string } | null)?.openProjectId
    if (!id) return
    const p = s.projects.find((x) => x.id === id)
    if (p) setOpenProject(p)
  }, [location.state, s.projects])

  const wip = s.settings?.wip_limit ?? 5
  const actifs = s.projects.filter((p) => p.status === 'actif')

  const shown = useMemo(() => {
    if (tab === 'actif') return actifs
    if (tab === 'pause') return s.projects.filter((p) => p.status === 'pause')
    return s.projects.filter((p) => p.status === 'termine' || p.status === 'abandonne')
  }, [tab, s.projects, actifs])

  // le projet ouvert, toujours pris depuis le store (pour refléter les ajouts)
  const openLive = openProject ? s.projects.find((p) => p.id === openProject.id) ?? null : null

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
                onClick={() => setOpenProject(p)}>
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
                  <button onClick={(e) => { e.stopPropagation(); setNoteProject(p) }}
                    className="btn-ghost shrink-0 p-1.5" aria-label="Note du projet" title="Note du projet">
                    <Pencil size={14} />
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

      <ProjectForm open={creating || editing !== null} project={editing}
        onClose={() => { setCreating(false); setEditing(null) }} />

      {openLive && (
        <ProjectDetail project={openLive}
          onEdit={() => { setEditing(openLive); setOpenProject(null) }}
          onNote={() => { setNoteProject(openLive); setOpenProject(null) }}
          onClose={() => setOpenProject(null)} />
      )}

      {noteProject && <NoteModal project={noteProject} onClose={() => setNoteProject(null)} />}
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
        </li>
      ))}
      {fullOrdered.length > 5 && (
        <li className="px-1 pt-0.5 text-[10px] text-ink-3">+ {fullOrdered.length - 5} autre{fullOrdered.length - 5 > 1 ? 's' : ''}</li>
      )}
    </ul>
  )
}

/** Note libre d'un projet : idées du moment, texte avec puces. */
function NoteModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const s = useHorizon()
  const live = s.projects.find((p) => p.id === project.id) ?? project
  const [text, setText] = useState(live.notes ?? '')
  const save = () => { void s.update('projects', project.id, { notes: text.trim() || null }); onClose() }
  return (
    <Modal open onClose={save} title={`Note — ${project.title}`} wide>
      <div className="space-y-3">
        <p className="text-xs text-ink-3">Tes idées du moment sur ce projet. « Entrée » continue la puce.</p>
        <NoteArea value={text} onChange={setText} rows={12}
          placeholder="• Une idée&#10;• Une autre…" />
        <div className="flex justify-end">
          <button onClick={save} className="btn-sun px-5 py-2">Enregistrer</button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Détail d'un projet : tâches directes + étapes (avec leurs tâches)
// ---------------------------------------------------------------------------
function ProjectDetail({ project, onEdit, onNote, onClose }: {
  project: Project; onEdit: () => void; onNote: () => void; onClose: () => void
}) {
  const s = useHorizon()
  const domain = s.domains.find((d) => d.id === project.domain_id)
  const [taskEdit, setTaskEdit] = useState<Task | null>(null)

  const directTasks = s.tasks.filter((t) => t.project_id === project.id && !t.step_id)
  const steps = s.steps.filter((st) => st.project_id === project.id)

  const addTask = (title: string, step_id: string | null) => {
    void s.insert('tasks', {
      title, project_id: project.id, step_id, domain_id: null, status: 'a_faire',
      importance: null, urgence: null, effort: null, due_date: null, scheduled_date: null,
      duration_min: null, is_recurring: false, recurrence_rule: null, notable: false,
      is_task: true, end_date: null, notes: null, done_at: null,
    })
    void s.update('projects', project.id, { last_activity_at: new Date().toISOString() })
  }

  const addStep = (title: string, due_date: string | null) => {
    const order = steps.length
    void s.insert('steps', {
      title, project_id: project.id, due_date, scheduled_date: due_date,
      status: 'actif', notable: false, sort_order: order,
    })
  }

  return (
    <Modal open onClose={onClose} title={project.title} wide>
      <div className="space-y-5">
        {/* Résumé */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm text-ink-2">
              {domain && <DomainDot color={domain.color} />}
              <span>{domain?.name}</span>
              <Badge tone={project.status === 'actif' ? 'good' : 'neutral'}>{STATUS_LABEL[project.status]}</Badge>
            </div>
            {project.description && <p className="mt-1 text-sm text-ink-3">{project.description}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button onClick={onNote} className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-sm">
              <NotebookPen size={14} /> Note
            </button>
            <button onClick={onEdit} className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-sm">
              <Pencil size={14} /> Modifier
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span>Avancement</span><span className="tabular-nums">{project.progress}%</span>
          </div>
          <ProgressBar value={project.progress} color={domain?.color ?? 'var(--color-sun)'} />
        </div>

        {/* Tâches directes */}
        <section className="space-y-2">
          <h3 className="block-title flex items-center gap-1.5">Tâches</h3>
          <TaskList tasks={directTasks} onToggle={(t) => toggle(s, t)} onOpen={setTaskEdit} onDelete={(t) => void s.remove('tasks', t.id)} />
          <QuickAdd placeholder="Ajouter une tâche…" onAdd={(v) => addTask(v, null)} />
        </section>

        {/* Étapes */}
        <section className="space-y-2">
          <h3 className="block-title flex items-center gap-1.5"><Layers size={14} /> Étapes</h3>
          {steps.length === 0 && <p className="text-xs text-ink-3">Aucune étape. Une étape est un sous-projet avec sa propre échéance et ses tâches.</p>}
          <div className="space-y-2">
            {steps.map((st) => (
              <StepBlock key={st.id} step={st} onOpenTask={setTaskEdit} />
            ))}
          </div>
          <AddStep onAdd={addStep} />
        </section>
      </div>

      <TaskForm open={taskEdit !== null} task={taskEdit} onClose={() => setTaskEdit(null)} />
    </Modal>
  )
}

function toggle(s: ReturnType<typeof useHorizon.getState>, t: Task) {
  const done = t.status === 'fait'
  void s.update('tasks', t.id, done ? { status: 'a_faire', done_at: null } : { status: 'fait', done_at: new Date().toISOString() })
}

function TaskList({ tasks, onToggle, onOpen, onDelete }: {
  tasks: Task[]; onToggle: (t: Task) => void; onOpen: (t: Task) => void; onDelete: (t: Task) => void
}) {
  if (tasks.length === 0) return <p className="text-xs text-ink-3">—</p>
  return (
    <ul className="space-y-1">
      {tasks.map((t) => {
        const done = t.status === 'fait'
        return (
          <li key={t.id} className="group flex items-center gap-2">
            <button onClick={() => onToggle(t)} className="shrink-0" aria-label={done ? 'Marquer à faire' : 'Marquer fait'}>
              {done ? <CheckCircle2 size={16} className="text-[#4cc79a]" /> : <Circle size={16} className="text-ink-3 hover:text-sun" />}
            </button>
            <button onClick={() => onOpen(t)} className="min-w-0 flex-1 text-left">
              <span className={`block truncate text-sm ${done ? 'text-ink-3 line-through' : 'text-ink-2'}`}>{t.title}</span>
            </button>
            {t.scheduled_date && <span className="shrink-0 text-[10px] text-ink-3">{fmtDate(t.scheduled_date)}</span>}
            <button onClick={() => onDelete(t)} className="shrink-0 text-ink-3 opacity-0 transition-opacity hover:text-[#ec7f97] group-hover:opacity-100" aria-label="Supprimer">
              <Trash2 size={13} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function StepBlock({ step, onOpenTask }: { step: Step; onOpenTask: (t: Task) => void }) {
  const s = useHorizon()
  const tasks = s.tasks.filter((t) => t.step_id === step.id)
  const doneCount = tasks.filter((t) => t.status === 'fait').length

  const addTask = (title: string) => {
    void s.insert('tasks', {
      title, project_id: step.project_id, step_id: step.id, domain_id: null, status: 'a_faire',
      importance: null, urgence: null, effort: null, due_date: null, scheduled_date: null,
      duration_min: null, is_recurring: false, recurrence_rule: null, notable: false,
      is_task: true, end_date: null, notes: null, done_at: null,
    })
  }

  return (
    <div className="rounded-xl border border-line bg-panel-2/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{step.title}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
            {step.due_date && <span className="inline-flex items-center gap-1"><CalendarClock size={11} /> échéance {fmtDate(step.due_date)}</span>}
            <span>· {doneCount}/{tasks.length} tâche{tasks.length > 1 ? 's' : ''}</span>
          </div>
        </div>
        <button onClick={() => void s.remove('steps', step.id)}
          className="shrink-0 text-ink-3 transition-colors hover:text-[#ec7f97]" aria-label="Supprimer l'étape">
          <Trash2 size={14} />
        </button>
      </div>
      <div className="mt-2 space-y-1">
        <TaskList tasks={tasks} onToggle={(t) => toggle(s, t)} onOpen={onOpenTask} onDelete={(t) => void s.remove('tasks', t.id)} />
        <QuickAdd placeholder="Ajouter une tâche à l'étape…" onAdd={addTask} small />
      </div>
    </div>
  )
}

function QuickAdd({ placeholder, onAdd, small = false }: {
  placeholder: string; onAdd: (v: string) => void; small?: boolean
}) {
  const [v, setV] = useState('')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!v.trim()) return
    onAdd(v.trim()); setV('')
  }
  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder}
        className={`field flex-1 ${small ? 'py-1.5 text-sm' : ''}`} />
      <button type="submit" className="btn-ghost flex shrink-0 items-center gap-1 px-2.5 py-2 text-sm" aria-label="Ajouter">
        <Plus size={15} />
      </button>
    </form>
  )
}

function AddStep({ onAdd }: { onAdd: (title: string, due: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onAdd(title.trim(), due || null)
    setTitle(''); setDue(''); setOpen(false)
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-sm">
        <Plus size={15} /> Ajouter une étape
      </button>
    )
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-xl border border-line p-3">
      <label className="flex-1 space-y-1 text-xs text-ink-3">
        Titre de l'étape
        <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
          placeholder="ex. Concevoir le support" className="field" />
      </label>
      <label className="space-y-1 text-xs text-ink-3">
        Échéance
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="field" />
      </label>
      <div className="flex gap-1.5">
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost px-3 py-2 text-sm">Annuler</button>
        <button type="submit" className="btn-sun px-4 py-2 text-sm">Créer</button>
      </div>
    </form>
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
