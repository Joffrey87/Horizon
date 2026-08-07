import { useMemo, useState } from 'react'
import {
  addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameMonth, isToday, startOfMonth, startOfWeek, subDays, subMonths,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, CheckCircle2, Circle, RotateCw } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { iso, tasksForDay, recurrenceLabel } from '../lib/logic'
import { Card, DomainDot, Seg } from '../components/ui'
import { TaskForm } from '../components/TaskForm'
import type { Task } from '../lib/types'

export function TimeView() {
  const [mode, setMode] = useState<'semaine' | 'mois'>('semaine')
  const [anchor, setAnchor] = useState(new Date())
  const [editing, setEditing] = useState<Task | null>(null)
  const [createDate, setCreateDate] = useState<string | null>(null)

  const shift = (dir: 1 | -1) => {
    setAnchor(mode === 'semaine' ? (dir === 1 ? addDays(anchor, 7) : subDays(anchor, 7))
      : (dir === 1 ? addMonths(anchor, 1) : subMonths(anchor, 1)))
  }

  return (
    <div className="rise space-y-4 pt-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Temps</h1>
          <p className="text-sm text-ink-3">Comment mon temps est-il occupé ?</p>
        </div>
        <div className="flex items-center gap-2">
          <Seg value={mode} onChange={setMode} options={[
            { value: 'semaine', label: 'Semaine' }, { value: 'mois', label: 'Mois' },
          ]} />
          <button onClick={() => shift(-1)} className="btn-ghost p-2" aria-label="Précédent"><ChevronLeft size={15} /></button>
          <button onClick={() => setAnchor(new Date())} className="btn-ghost px-3 py-2 text-xs">Aujourd'hui</button>
          <button onClick={() => shift(1)} className="btn-ghost p-2" aria-label="Suivant"><ChevronRight size={15} /></button>
        </div>
      </header>

      {mode === 'semaine' ? (
        <WeekGrid anchor={anchor} onEdit={setEditing} onCreate={setCreateDate} />
      ) : (
        <MonthGrid anchor={anchor} onPick={(d) => { setAnchor(d); setMode('semaine') }} />
      )}

      <TaskForm open={editing !== null || createDate !== null} task={editing}
        defaultDate={createDate ?? undefined}
        onClose={() => { setEditing(null); setCreateDate(null) }} />
    </div>
  )
}

function WeekGrid({ anchor, onEdit, onCreate }: {
  anchor: Date; onEdit: (t: Task) => void; onCreate: (d: string) => void
}) {
  const s = useHorizon()
  const days = useMemo(() => {
    const start = startOfWeek(anchor, { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end: endOfWeek(anchor, { weekStartsOn: 1 }) })
  }, [anchor])

  // Charge estimée de la semaine (si les durées sont renseignées)
  const load = days.reduce((acc, d) => acc + tasksForDay(s.tasks, d)
    .filter((t) => t.status !== 'fait')
    .reduce((a, t) => a + (t.duration_min ?? 0), 0), 0)

  return (
    <>
      {load > 0 && (
        <p className="text-xs text-ink-3">
          Charge estimée restante : ~{Math.round(load / 60 * 10) / 10} h planifiées cette semaine.
        </p>
      )}
      <div className="grid gap-2 md:grid-cols-7">
        {days.map((day) => {
          const list = tasksForDay(s.tasks, day)
          const today = isToday(day)
          return (
            <Card key={day.toISOString()} className={`min-h-36 !p-2.5 ${today ? '!border-sun/50' : ''}`}>
              <header className="mb-1.5 flex items-center justify-between">
                <p className={`text-xs font-medium ${today ? 'text-sun-soft' : 'text-ink-3'}`}>
                  {format(day, 'EEE d', { locale: fr })}
                </p>
                <button onClick={() => onCreate(iso(day))} className="text-ink-3 transition-colors hover:text-sun"
                  aria-label="Ajouter une tâche"><Plus size={13} /></button>
              </header>
              <div className="space-y-1">
                {list.map((t) => {
                  const done = t.is_recurring
                    ? false // l'état « fait » d'une récurrente est journalier : simplification v1 → clic = fait aujourd'hui
                    : t.status === 'fait'
                  const domain = s.domains.find((d) => d.id ===
                    (t.domain_id ?? s.projects.find((p) => p.id === t.project_id)?.domain_id))
                  return (
                    <div key={t.id} className="group flex items-start gap-1.5">
                      <button className="mt-0.5 shrink-0"
                        onClick={() => {
                          if (t.is_recurring) return
                          void s.update('tasks', t.id, done
                            ? { status: 'a_faire', done_at: null }
                            : { status: 'fait', done_at: new Date(day).toISOString() })
                        }}
                        aria-label={done ? 'Marquer à faire' : 'Marquer fait'}>
                        {t.is_recurring
                          ? <RotateCw size={12} className="text-ink-3" />
                          : done
                            ? <CheckCircle2 size={13} className="text-[#4cc79a]" />
                            : <Circle size={13} className="text-ink-3 group-hover:text-sun" />}
                      </button>
                      <button onClick={() => onEdit(t)} className="min-w-0 flex-1 text-left" title={t.is_recurring ? recurrenceLabel(t.recurrence_rule) : t.title}>
                        <span className={`block truncate text-xs leading-tight ${done ? 'text-ink-3 line-through' : 'text-ink-2'}`}>
                          {t.title}
                        </span>
                      </button>
                      {domain && <DomainDot color={domain.color} size={5} />}
                    </div>
                  )
                })}
                {list.length === 0 && <p className="pt-2 text-center text-[10px] text-ink-3">—</p>}
              </div>
            </Card>
          )
        })}
      </div>
    </>
  )
}

function MonthGrid({ anchor, onPick }: { anchor: Date; onPick: (d: Date) => void }) {
  const s = useHorizon()
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [anchor])

  return (
    <Card>
      <p className="mb-3 text-center text-sm font-medium capitalize">{format(anchor, 'MMMM yyyy', { locale: fr })}</p>
      <div className="grid grid-cols-7 gap-1 text-center">
        {['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].map((d) => (
          <p key={d} className="pb-1 text-[10px] uppercase tracking-wider text-ink-3">{d}</p>
        ))}
        {days.map((day) => {
          const count = tasksForDay(s.tasks, day).filter((t) => t.status !== 'fait').length
          return (
            <button key={day.toISOString()} onClick={() => onPick(day)}
              className={`flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition-colors hover:bg-panel-2 ${
                isToday(day) ? 'bg-sun/15 text-sun-soft'
                  : isSameMonth(day, anchor) ? 'text-ink-2' : 'text-ink-3/50'
              }`}>
              {format(day, 'd')}
              <span className="mt-0.5 flex h-1.5 gap-0.5">
                {count > 0 && Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                  <span key={i} className="h-1 w-1 rounded-full bg-sun/70" />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}
