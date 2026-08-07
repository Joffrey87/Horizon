import { useMemo, useState } from 'react'
import {
  addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameMonth, isToday, startOfMonth, startOfWeek, subDays, subMonths,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, CheckCircle2, Circle, RotateCw } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { compareTasksByTitleTime, iso, tasksForDay, recurrenceLabel } from '../lib/logic'
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
        <MonthGrid anchor={anchor} onEdit={setEditing} onCreate={setCreateDate}
          onPick={(d) => { setAnchor(d); setMode('semaine') }} />
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
          const list = [...tasksForDay(s.tasks, day)].sort(compareTasksByTitleTime)
          const today = isToday(day)
          // Clic dans le vide de la case = créer une tâche pour ce jour.
          const handleVoidClick = (e: React.MouseEvent<HTMLElement>) => {
            if (e.target === e.currentTarget) onCreate(iso(day))
          }
          return (
            <Card key={day.toISOString()} className={`min-h-36 cursor-pointer !p-2.5 ${today ? '!border-sun/50' : ''}`}>
              <div onClick={handleVoidClick}>
                <header className="mb-1.5 flex items-center justify-between"
                  onClick={(e) => e.stopPropagation()}>
                  <p className={`text-xs font-medium ${today ? 'text-sun-soft' : 'text-ink-3'}`}>
                    {format(day, 'EEE d', { locale: fr })}
                  </p>
                  <button onClick={() => onCreate(iso(day))} className="text-ink-3 transition-colors hover:text-sun"
                    aria-label="Ajouter une tâche"><Plus size={13} /></button>
                </header>
                <div className="space-y-1" onClick={handleVoidClick}>
                  {list.map((t) => {
                    const done = t.is_recurring
                      ? false // l'état « fait » d'une récurrente est journalier : simplification v1 → clic = fait aujourd'hui
                      : t.status === 'fait'
                    const domain = s.domains.find((d) => d.id ===
                      (t.domain_id ?? s.projects.find((p) => p.id === t.project_id)?.domain_id))
                    return (
                      <div key={t.id} className="group flex items-start gap-1.5"
                        onClick={(e) => e.stopPropagation()}>
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
                  {list.length === 0 && (
                    <p className="pt-2 text-center text-[10px] text-ink-3">—</p>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </>
  )
}

function MonthGrid({ anchor, onEdit, onCreate, onPick }: {
  anchor: Date
  onEdit: (t: Task) => void
  onCreate: (d: string) => void
  onPick: (d: Date) => void
}) {
  const s = useHorizon()
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [anchor])

  return (
    <Card>
      <p className="mb-3 text-center text-sm font-medium capitalize">{format(anchor, 'MMMM yyyy', { locale: fr })}</p>
      <div className="grid grid-cols-7 gap-1">
        {['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].map((d) => (
          <p key={d} className="pb-1 text-center text-[10px] uppercase tracking-wider text-ink-3">{d}</p>
        ))}
        {days.map((day) => {
          const list = [...tasksForDay(s.tasks, day)].sort(compareTasksByTitleTime)
          const inMonth = isSameMonth(day, anchor)
          const today = isToday(day)
          // Clic dans le vide de la case = créer une tâche pour ce jour.
          const handleVoidClick = (e: React.MouseEvent<HTMLElement>) => {
            if (e.target === e.currentTarget) onCreate(iso(day))
          }
          return (
            <div key={day.toISOString()}
              onClick={handleVoidClick}
              className={`group flex min-h-[92px] cursor-pointer flex-col rounded-lg border p-1.5 transition-colors ${
                today ? 'border-sun/50 bg-sun/5'
                  : inMonth ? 'border-transparent hover:border-line-2 hover:bg-panel-2/40'
                    : 'border-transparent opacity-45'
              }`}>
              <div className="mb-1 flex items-center justify-between"
                onClick={(e) => e.stopPropagation()}>
                <button onClick={() => onPick(day)}
                  className={`rounded px-1 text-xs tabular-nums transition-colors hover:bg-panel-3 hover:text-sun ${
                    today ? 'font-semibold text-sun-soft'
                      : inMonth ? 'text-ink-2' : 'text-ink-3'
                  }`}
                  title="Voir la semaine">
                  {format(day, 'd')}
                </button>
                <button onClick={() => onCreate(iso(day))}
                  className="text-ink-3 opacity-0 transition-opacity hover:text-sun group-hover:opacity-100"
                  aria-label="Ajouter une tâche">
                  <Plus size={12} />
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-0.5" onClick={handleVoidClick}>
                {list.slice(0, 3).map((t) => {
                  const domain = s.domains.find((d2) => d2.id ===
                    (t.domain_id ?? s.projects.find((p) => p.id === t.project_id)?.domain_id))
                  const done = !t.is_recurring && t.status === 'fait'
                  return (
                    <button key={t.id} onClick={(e) => { e.stopPropagation(); onEdit(t) }}
                      title={t.title}
                      className="flex w-full items-center gap-1 truncate rounded px-1 py-px text-left text-[10px] leading-tight text-ink-2 transition-colors hover:bg-panel-3">
                      {domain && <DomainDot color={domain.color} size={5} />}
                      <span className={`truncate ${done ? 'text-ink-3 line-through' : ''}`}>
                        {t.title}
                      </span>
                    </button>
                  )
                })}
                {list.length > 3 && (
                  <button onClick={(e) => { e.stopPropagation(); onPick(day) }}
                    className="w-full px-1 text-left text-[10px] text-ink-3 transition-colors hover:text-sun">
                    +{list.length - 3} de plus
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-center text-[11px] text-ink-3">
        Clique dans le vide d'un jour pour créer une tâche. Clique sur le numéro pour zoomer sur la semaine.
      </p>
    </Card>
  )
}
