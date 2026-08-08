import { useMemo, useState } from 'react'
import {
  addWeeks, eachDayOfInterval, endOfWeek, format, isToday, startOfWeek, subWeeks,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Inbox, CheckCircle2, Circle } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { iso, tasksForDay, compareTasksByTitleTime } from '../lib/logic'
import { Card, DomainDot } from '../components/ui'
import { TaskForm } from '../components/TaskForm'
import type { Task } from '../lib/types'

/** Planification : à gauche les tâches non planifiées, à droite la semaine.
 *  On glisse une tâche vers un jour pour la planifier (ou l'inverse pour la retirer). */
export function PlanningView() {
  const s = useHorizon()
  const [anchor, setAnchor] = useState(new Date())
  const [editing, setEditing] = useState<Task | null>(null)
  const [creating, setCreating] = useState(false)

  const days = useMemo(() => {
    const start = startOfWeek(anchor, { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end: endOfWeek(start, { weekStartsOn: 1 }) })
  }, [anchor])

  // « À planifier » : vraies tâches, à faire, non récurrentes, sans date planifiée.
  const unplanned = s.tasks.filter((t) =>
    t.is_task !== false && !t.is_recurring
    && (t.status === 'a_faire' || t.status === 'en_cours')
    && !t.scheduled_date)

  const domainOf = (t: Task) => s.domains.find((d) => d.id === (t.domain_id ?? s.projects.find((p) => p.id === t.project_id)?.domain_id))

  const plan = (id: string, dayIso: string | null) => void s.update('tasks', id, { scheduled_date: dayIso })
  const onDropTo = (dayIso: string | null) => (e: React.DragEvent) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData('application/horizon-plan')
    if (raw) plan(raw, dayIso)
  }
  const drag = (id: string) => (e: React.DragEvent) => {
    e.dataTransfer.setData('application/horizon-plan', id); e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="rise flex h-[calc(100vh-5.5rem)] flex-col gap-3 pt-4">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Planification</h1>
          <p className="text-sm text-ink-3">Glisse tes tâches en attente vers un jour de la semaine.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAnchor(subWeeks(anchor, 1))} className="btn-ghost p-2" aria-label="Semaine précédente"><ChevronLeft size={15} /></button>
          <button onClick={() => setAnchor(new Date())} className="btn-ghost px-3 py-2 text-xs">Cette semaine</button>
          <button onClick={() => setAnchor(addWeeks(anchor, 1))} className="btn-ghost p-2" aria-label="Semaine suivante"><ChevronRight size={15} /></button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* ---- Colonne « À planifier » ---- */}
        <div onDragOver={(e) => e.preventDefault()} onDrop={onDropTo(null)}
          className="flex w-64 shrink-0 flex-col rounded-xl border border-line bg-panel-2/40 p-2">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="flex items-center gap-1.5 text-sm font-medium"><Inbox size={15} /> À planifier</span>
            <button onClick={() => setCreating(true)} className="text-ink-3 transition-colors hover:text-sun" aria-label="Nouvelle tâche"><Plus size={16} /></button>
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
            {unplanned.length === 0 ? (
              <p className="px-1 py-4 text-center text-xs text-ink-3">Tout est planifié. 🎉</p>
            ) : unplanned.map((t) => {
              const domain = domainOf(t)
              return (
                <button key={t.id} draggable onDragStart={drag(t.id)} onClick={() => setEditing(t)}
                  className="flex w-full cursor-grab items-center gap-2 rounded-lg border border-line-2/60 bg-panel px-2 py-1.5 text-left transition-colors hover:bg-panel-2 active:cursor-grabbing">
                  {domain && <DomainDot color={domain.color} size={7} />}
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{t.title}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ---- Semaine ---- */}
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-4 lg:grid-cols-7">
          {days.map((day) => {
            const list = [...tasksForDay(s.tasks, day)].filter((t) => !t.is_recurring).sort(compareTasksByTitleTime)
            const today = isToday(day)
            return (
              <DayColumn key={day.toISOString()} today={today} label={format(day, 'EEE d', { locale: fr })}
                onDrop={onDropTo(iso(day))}>
                {list.length === 0 ? (
                  <p className="pt-2 text-center text-[10px] text-ink-3">—</p>
                ) : list.map((t) => {
                  const domain = domainOf(t)
                  const done = t.status === 'fait'
                  return (
                    <div key={t.id} draggable onDragStart={drag(t.id)}
                      className="group flex items-start gap-1 rounded bg-panel px-1 py-0.5">
                      <button className="mt-0.5 shrink-0"
                        onClick={() => void s.update('tasks', t.id, done ? { status: 'a_faire', done_at: null } : { status: 'fait', done_at: new Date().toISOString() })}
                        aria-label={done ? 'Décocher' : 'Cocher'}>
                        {done ? <CheckCircle2 size={12} className="text-[#4cc79a]" /> : <Circle size={12} className="text-ink-3 group-hover:text-sun" />}
                      </button>
                      <button onClick={() => setEditing(t)} className="min-w-0 flex-1 text-left">
                        <span className={`block truncate text-[11px] leading-tight ${done ? 'text-ink-3 line-through' : 'text-ink-2'}`}>{t.title}</span>
                      </button>
                      {domain && <DomainDot color={domain.color} size={5} />}
                    </div>
                  )
                })}
              </DayColumn>
            )
          })}
        </div>
      </div>

      <TaskForm open={editing !== null || creating} task={editing} defaultIsTask
        onClose={() => { setEditing(null); setCreating(false) }} />
    </div>
  )
}

function DayColumn({ today, label, onDrop, children }: {
  today: boolean; label: string; onDrop: (e: React.DragEvent) => void; children: React.ReactNode
}) {
  const [over, setOver] = useState(false)
  return (
    <Card className={`!p-0 ${today ? '!border-sun/50' : ''}`}>
      <div onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { setOver(false); onDrop(e) }}
        className={`flex min-h-32 flex-col rounded-2xl p-2 transition-colors ${over ? 'bg-sun/10' : today ? 'bg-sun/5' : ''}`}>
        <p className={`mb-1.5 text-xs font-medium ${today ? 'text-sun-soft' : 'text-ink-3'}`}>{label}</p>
        <div className="min-h-0 flex-1 space-y-1">{children}</div>
      </div>
    </Card>
  )
}
