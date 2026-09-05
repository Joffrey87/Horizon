// ================================================================
// La FICHE d'un projet : son détail, son formulaire d'édition et sa note.
//
// Elle vit dans un composant à part pour pouvoir s'ouvrir DEPUIS N'IMPORTE
// QUELLE PAGE sans y naviguer : on l'ouvre sur l'accueil, on la ferme, et on
// est toujours sur l'accueil.
// ================================================================
import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Plus, Pencil, CheckCircle2, Circle, Trash2, Layers, CalendarClock, NotebookPen, GripVertical, Pin } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { STATUS_LABEL } from '../lib/logic'
import { Badge, ProgressBar, DomainDot, Modal, NoteArea } from '../components/ui'
import { TaskForm } from '../components/TaskForm'
import type { Project, ProjectStatus, Step, Task } from '../lib/types'

const fmtDate = (d: string) => format(parseISO(d), 'd MMM', { locale: fr })

/** Fiche complète d'un projet : détail, édition et note s'enchaînent ici, sans
 *  que la page hôte ait à s'en occuper. `onClose` la referme, point. */
export function FicheProjet({ projectId, vueInitiale = 'detail', onClose }: {
  projectId: string; vueInitiale?: 'detail' | 'note'; onClose: () => void
}) {
  const s = useHorizon()
  const [vue, setVue] = useState<'detail' | 'edition' | 'note'>(vueInitiale)
  // Toujours relu depuis le store, pour refléter les ajouts en direct.
  const projet = s.projects.find((p) => p.id === projectId) ?? null

  useEffect(() => { if (!projet) onClose() }, [projet, onClose])
  if (!projet) return null

  if (vue === 'edition') {
    return <ProjectForm open project={projet} onClose={() => setVue('detail')} />
  }
  if (vue === 'note') {
    return <NoteModal project={projet} onClose={() => setVue('detail')} />
  }
  return (
    <ProjectDetail project={projet}
      onEdit={() => setVue('edition')} onNote={() => setVue('note')} onClose={onClose} />
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

  // Ordre MANUEL du projet : c'est lui que l'accueil reprend pour les épinglées.
  const directTasks = s.tasks.filter((t) => t.project_id === project.id && !t.step_id)
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))

  const reorder = (from: number, to: number) => {
    if (from === to) return
    const v = [...directTasks]
    const moved = v.splice(from, 1)[0]
    if (!moved) return
    v.splice(to, 0, moved)
    v.forEach((t, i) => { if (t.sort_order !== i) void s.update('tasks', t.id, { sort_order: i }) })
  }
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
          <p className="text-xs text-ink-3">
            Glisse pour fixer l’ordre. L’épingle choisit ce qui remonte sur l’accueil.
          </p>
          <TaskList tasks={directTasks} onToggle={(t) => toggle(s, t)} onOpen={setTaskEdit}
            onDelete={(t) => void s.remove('tasks', t.id)}
            onTogglePin={(t) => void s.update('tasks', t.id, { home_pinned: !t.home_pinned })}
            onReorder={reorder} />
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

/** Liste de tâches d'un projet. Quand `onReorder` est fourni, les lignes se
 *  glissent pour fixer l'ordre du projet — c'est cet ordre que l'accueil
 *  reprend. L'épingle choisit ce qui remonte sur l'accueil. */
function TaskList({ tasks, onToggle, onOpen, onDelete, onTogglePin, onReorder }: {
  tasks: Task[]; onToggle: (t: Task) => void; onOpen: (t: Task) => void; onDelete: (t: Task) => void
  onTogglePin?: (t: Task) => void
  onReorder?: (from: number, to: number) => void
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  if (tasks.length === 0) return <p className="text-xs text-ink-3">—</p>
  return (
    <ul className="space-y-1">
      {tasks.map((t, i) => {
        const done = t.status === 'fait'
        const glissable = !!onReorder
        return (
          <li key={t.id} draggable={glissable}
            onDragStart={glissable ? (e) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move' } : undefined}
            onDragOver={glissable ? (e) => e.preventDefault() : undefined}
            onDrop={glissable ? (e) => { e.preventDefault(); if (dragIdx !== null) onReorder(dragIdx, i); setDragIdx(null) } : undefined}
            onDragEnd={glissable ? () => setDragIdx(null) : undefined}
            className={`group flex items-center gap-2 rounded-md px-1 transition-colors hover:bg-panel-2/50 ${dragIdx === i ? 'opacity-50' : ''}`}>
            {glissable && <GripVertical size={13} className="shrink-0 cursor-grab text-ink-3" />}
            <button onClick={() => onToggle(t)} className="shrink-0" aria-label={done ? 'Marquer à faire' : 'Marquer fait'}>
              {done ? <CheckCircle2 size={16} className="text-[#4cc79a]" /> : <Circle size={16} className="text-ink-3 hover:text-sun" />}
            </button>
            <button onClick={() => onOpen(t)} className="min-w-0 flex-1 text-left">
              <span className={`block truncate text-sm ${done ? 'text-ink-3 line-through' : 'text-ink-2'}`}>{t.title}</span>
            </button>
            {t.scheduled_date && <span className="shrink-0 text-[10px] text-ink-3">{fmtDate(t.scheduled_date)}</span>}
            {onTogglePin && !done && (
              <button onClick={() => onTogglePin(t)}
                className={`shrink-0 transition-opacity ${t.home_pinned ? 'text-sun' : 'text-ink-3 opacity-0 hover:text-ink-2 group-hover:opacity-100'}`}
                aria-label={t.home_pinned ? 'Retirer de l’accueil' : 'Épingler sur l’accueil'}
                title={t.home_pinned ? 'Épinglée sur l’accueil' : 'Épingler sur l’accueil'}>
                <Pin size={13} fill={t.home_pinned ? 'currentColor' : 'none'} />
              </button>
            )}
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

export function ProjectForm({ open, project, onClose }: { open: boolean; project: Project | null; onClose: () => void }) {
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
