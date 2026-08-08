import { useMemo, useState } from 'react'
import {
  addMonths, addWeeks, eachDayOfInterval, endOfWeek, format, getDate, getDaysInMonth,
  isSameMonth, isToday, parseISO, startOfMonth, startOfWeek,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, CheckCircle2, Circle, RotateCw, Layers, Star, Target } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { compareTasksByTitleTime, extractHourMinute, iso, tasksForDay, recurrenceLabel, timeQuoteOfDay } from '../lib/logic'
import { Card, Seg, Modal } from '../components/ui'
import { TaskForm } from '../components/TaskForm'
import type { Objective, Step, Task } from '../lib/types'

type View = '4sem' | 'semaine' | 'trimestre' | 'annee'
type Kind = 'task' | 'step' | 'objective'

export function TimeView() {
  const s = useHorizon()
  const [view, setView] = useState<View>('4sem')
  const [anchor, setAnchor] = useState(new Date())
  const [editing, setEditing] = useState<Task | null>(null)
  const [createDate, setCreateDate] = useState<string | null>(null)
  const [overrideScheduled, setOverrideScheduled] = useState<string | undefined>(undefined)
  const [openStep, setOpenStep] = useState<Step | null>(null)

  const shift = (dir: 1 | -1) => {
    if (view === '4sem') setAnchor(addWeeks(anchor, dir * 4))
    else if (view === 'semaine') setAnchor(addWeeks(anchor, dir))
    else if (view === 'trimestre') setAnchor(addMonths(anchor, dir * 3))
    else setAnchor(addMonths(anchor, dir * 12))
  }

  // Déplacer un item : on ne change que la date. Cohérence : si une tâche
  // atterrit après son échéance, on ouvre le formulaire (date pré-remplie) et
  // la validation reste bloquée tant que ce n'est pas cohérent.
  const handleMove = (kind: Kind, id: string, dayIso: string) => {
    if (kind === 'task') {
      const t = s.tasks.find((x) => x.id === id)
      if (t?.due_date && dayIso > t.due_date) { setEditing(t); setOverrideScheduled(dayIso); return }
      void s.update('tasks', id, { scheduled_date: dayIso })
    } else if (kind === 'step') {
      const st = s.steps.find((x) => x.id === id)
      const patch: Record<string, unknown> = { scheduled_date: dayIso }
      if (st?.due_date && dayIso > st.due_date) patch.due_date = dayIso // garde l'étape cohérente
      void s.update('steps', id, patch)
    } else {
      void s.update('objectives', id, { target_date: dayIso })
    }
  }

  const closeTask = () => { setEditing(null); setCreateDate(null); setOverrideScheduled(undefined) }
  const common = { onEdit: setEditing, onCreate: setCreateDate, onStep: setOpenStep, onMove: handleMove }
  const timeQuote = timeQuoteOfDay()

  return (
    <div className="rise flex h-[calc(100vh-5.5rem)] flex-col gap-3 pt-4">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Temps</h1>
          <p className="text-sm italic text-ink-3">
            « {timeQuote.text} »{timeQuote.source && <span className="not-italic"> — {timeQuote.source}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Seg value={view} onChange={setView} options={[
            { value: 'semaine', label: 'Semaine' },
            { value: '4sem', label: 'Mois' },
            { value: 'trimestre', label: 'Trimestre' },
            { value: 'annee', label: 'Année' },
          ]} />
          <button onClick={() => shift(-1)} className="btn-ghost p-2" aria-label="Précédent"><ChevronLeft size={15} /></button>
          <button onClick={() => setAnchor(new Date())} className="btn-ghost px-3 py-2 text-xs">
            {view === 'semaine' ? 'Cette semaine' : view === '4sem' ? 'Ce mois-ci' : view === 'trimestre' ? 'Ce trimestre' : 'Cette année'}
          </button>
          <button onClick={() => shift(1)} className="btn-ghost p-2" aria-label="Suivant"><ChevronRight size={15} /></button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
        {view === '4sem' && <FourWeeks anchor={anchor} {...common} />}
        {view === 'semaine' && <WeekHours anchor={anchor} {...common} />}
        {view === 'trimestre' && <MultiMonth anchor={anchor} months={3} {...common} />}
        {view === 'annee' && <MultiMonth anchor={anchor} months={12} yearMode {...common} />}
      </div>

      <TaskForm open={editing !== null || createDate !== null} task={editing}
        defaultDate={createDate ?? undefined} overrideScheduled={overrideScheduled}
        onClose={closeTask} />

      {openStep && <StepTasksModal step={openStep} onEditTask={setEditing} onClose={() => setOpenStep(null)} />}
    </div>
  )
}

// ---- helpers partagés -----------------------------------------------------

type MoveFn = (kind: Kind, id: string, dayIso: string) => void

function stepsForDay(steps: Step[], day: Date): Step[] {
  const d = iso(day)
  return steps.filter((st) => st.scheduled_date === d || st.due_date === d)
}

const dragData = (kind: Kind, id: string) => (e: React.DragEvent) => {
  e.dataTransfer.setData('application/horizon', JSON.stringify({ kind, id }))
  e.dataTransfer.effectAllowed = 'move'
}

function readDrag(e: React.DragEvent): { kind: Kind; id: string } | null {
  const raw = e.dataTransfer.getData('application/horizon')
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

// ---- Cellule d'un jour (partagée par 4 semaines) --------------------------

function DayCell({ day, tint, onEdit, onCreate, onStep, onMove }: {
  day: Date; tint?: string
  onEdit: (t: Task) => void; onCreate: (d: string) => void; onStep: (st: Step) => void; onMove: MoveFn
}) {
  const s = useHorizon()
  const [over, setOver] = useState(false)
  const list = [...tasksForDay(s.tasks, day)].sort(compareTasksByTitleTime)
  const steps = stepsForDay(s.steps, day)
  const today = isToday(day)

  const handleVoid = (e: React.MouseEvent<HTMLElement>) => {
    if (e.target === e.currentTarget) onCreate(iso(day))
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setOver(false)
    const d = readDrag(e); if (d) onMove(d.kind, d.id, iso(day))
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      onClick={handleVoid}
      style={{ backgroundColor: !today && !over ? tint : undefined }}
      className={`flex min-h-28 cursor-pointer flex-col rounded-lg border p-1.5 transition-colors ${
        today ? 'border-sun/50 bg-sun/5' : over ? 'border-sun/70 bg-sun/10' : 'border-line-2/60 hover:bg-panel-2/40'
      }`}>
      <header className="mb-1 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
        <p className={`text-xs font-medium ${today ? 'text-sun-soft' : 'text-ink-3'}`}>
          {format(day, 'EEE d', { locale: fr })}
        </p>
        <button onClick={() => onCreate(iso(day))} className="text-ink-3 transition-colors hover:text-sun" aria-label="Ajouter une tâche">
          <Plus size={13} />
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-1" onClick={handleVoid}>
        {steps.map((st) => (
          <button key={st.id} draggable onDragStart={dragData('step', st.id)}
            onClick={(e) => { e.stopPropagation(); onStep(st) }}
            title={`Étape : ${st.title}`}
            className="flex w-full items-center gap-1 truncate rounded bg-info/15 px-1 py-0.5 text-left text-[10px] text-[#6ea8ee] transition-colors hover:bg-info/25">
            <Layers size={10} className="shrink-0" />
            <span className="truncate font-medium">{st.title}</span>
          </button>
        ))}
        {list.map((t) => {
          const done = !t.is_recurring && t.status === 'fait'
          const domain = s.domains.find((d) => d.id === (t.domain_id ?? s.projects.find((p) => p.id === t.project_id)?.domain_id))
          return (
            <div key={t.id} className="group flex items-start gap-1 rounded px-1 py-0.5"
              style={{ background: domain ? `${domain.color}2b` : 'var(--color-panel-3)', borderLeft: domain ? `3px solid ${domain.color}` : undefined }}
              draggable={!t.is_recurring} onDragStart={dragData('task', t.id)}
              onClick={(e) => e.stopPropagation()}>
              <button className="mt-0.5 shrink-0"
                onClick={() => {
                  if (t.is_recurring) return
                  void s.update('tasks', t.id, done ? { status: 'a_faire', done_at: null } : { status: 'fait', done_at: new Date().toISOString() })
                }}
                aria-label={done ? 'Marquer à faire' : 'Marquer fait'}>
                {t.is_recurring ? <RotateCw size={11} className="text-ink-3" />
                  : done ? <CheckCircle2 size={12} className="text-[#4cc79a]" />
                    : <Circle size={12} className="text-ink-3 group-hover:text-sun" />}
              </button>
              <button onClick={() => onEdit(t)} className="min-w-0 flex-1 text-left" title={t.is_recurring ? recurrenceLabel(t.recurrence_rule) : t.title}>
                <span className={`block truncate text-[11px] leading-tight ${done ? 'text-ink-3 line-through' : 'text-ink'}`}>
                  {t.notable && <Star size={9} className="mr-0.5 inline text-sun" />}{t.title}
                </span>
              </button>
            </div>
          )
        })}
        {list.length === 0 && steps.length === 0 && <p className="pt-1 text-center text-[10px] text-ink-3">—</p>}
      </div>
    </div>
  )
}

// ---- Vue 4 semaines (défaut) ---------------------------------------------

function FourWeeks({ anchor, onEdit, onCreate, onStep, onMove }: {
  anchor: Date; onEdit: (t: Task) => void; onCreate: (d: string) => void; onStep: (st: Step) => void; onMove: MoveFn
}) {
  const weeks = useMemo(() => {
    const first = startOfWeek(anchor, { weekStartsOn: 1 })
    return [0, 1, 2, 3].map((w) => {
      const start = addWeeks(first, w)
      return eachDayOfInterval({ start, end: endOfWeek(start, { weekStartsOn: 1 }) })
    })
  }, [anchor])

  // Mois dominant : celui qui a le plus de jours dans la fenêtre de 4 semaines.
  const dominantMonth = useMemo(() => {
    const counts = new Map<string, { date: Date; n: number }>()
    weeks.flat().forEach((d) => {
      const key = format(d, 'yyyy-MM')
      const cur = counts.get(key)
      if (cur) cur.n++
      else counts.set(key, { date: d, n: 1 })
    })
    return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.date ?? anchor
  }, [weeks, anchor])

  // Teinte de fond par mois : distingue visuellement les mois qui se chevauchent.
  const monthTints = useMemo(() => {
    const keys = [...new Set(weeks.flat().map((d) => format(d, 'yyyy-MM')))]
    const TINTS = ['rgba(120,140,190,0.00)', 'rgba(140,120,190,0.10)', 'rgba(120,170,150,0.10)']
    const map = new Map<string, string>()
    keys.forEach((k, i) => map.set(k, TINTS[i % TINTS.length]))
    return map
  }, [weeks])

  return (
    <>
      <p className="text-center text-sm font-medium capitalize">{format(dominantMonth, 'MMMM yyyy', { locale: fr })}</p>
      <div className="space-y-2">
        {weeks.map((days, i) => (
          <div key={i} className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-7">
            {days.map((day) => (
              <DayCell key={day.toISOString()} day={day} tint={monthTints.get(format(day, 'yyyy-MM'))}
                onEdit={onEdit} onCreate={onCreate} onStep={onStep} onMove={onMove} />
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

// ---- Vue Semaine : grille horaire verticale -------------------------------

const HOUR_START = 6
const HOUR_END = 22
const ROW_H = 44

function WeekHours({ anchor, onEdit, onCreate, onStep, onMove }: {
  anchor: Date; onEdit: (t: Task) => void; onCreate: (d: string) => void; onStep: (st: Step) => void; onMove: MoveFn
}) {
  const days = useMemo(() => {
    const start = startOfWeek(anchor, { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end: endOfWeek(start, { weekStartsOn: 1 }) })
  }, [anchor])
  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i)

  return (
    <Card className="!p-2">
      <div className="overflow-x-auto">
        <div className="grid min-w-[720px]" style={{ gridTemplateColumns: `44px repeat(7, 1fr)` }}>
          <div />
          {days.map((day) => (
            <div key={day.toISOString()} className={`px-1 pb-1 text-center text-xs font-medium ${isToday(day) ? 'text-sun-soft' : 'text-ink-3'}`}>
              {format(day, 'EEE d', { locale: fr })}
            </div>
          ))}

          <div className="pr-1 text-right text-[9px] uppercase tracking-wider text-ink-3">jour</div>
          {days.map((day) => (
            <AllDayBand key={day.toISOString()} day={day} onEdit={onEdit} onStep={onStep} onMove={onMove} onCreate={onCreate} />
          ))}

          <div className="relative" style={{ height: hours.length * ROW_H }}>
            {hours.map((h) => (
              <div key={h} className="absolute right-1 text-[10px] text-ink-3" style={{ top: (h - HOUR_START) * ROW_H - 5 }}>
                {h}h
              </div>
            ))}
          </div>
          {days.map((day) => (
            <HourColumn key={day.toISOString()} day={day} hours={hours} onEdit={onEdit} onCreate={onCreate} onMove={onMove} />
          ))}
        </div>
      </div>
    </Card>
  )
}

function AllDayBand({ day, onEdit, onStep, onMove, onCreate }: {
  day: Date; onEdit: (t: Task) => void; onStep: (st: Step) => void; onMove: MoveFn; onCreate: (d: string) => void
}) {
  const s = useHorizon()
  const [over, setOver] = useState(false)
  const steps = stepsForDay(s.steps, day)
  const untimed = [...tasksForDay(s.tasks, day)].filter((t) => !extractHourMinute(t.title))
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setOver(false)
    const d = readDrag(e); if (d) onMove(d.kind, d.id, iso(day))
  }
  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}
      onClick={(e) => { if (e.target === e.currentTarget) onCreate(iso(day)) }}
      className={`min-h-8 space-y-0.5 border-b border-line-2/60 p-0.5 ${over ? 'bg-sun/10' : ''} ${isToday(day) ? 'bg-sun/5' : ''}`}>
      {steps.map((st) => (
        <button key={st.id} draggable onDragStart={dragData('step', st.id)} onClick={() => onStep(st)}
          className="flex w-full items-center gap-1 truncate rounded bg-info/15 px-1 py-0.5 text-left text-[10px] text-[#6ea8ee]">
          <Layers size={10} className="shrink-0" /><span className="truncate font-medium">{st.title}</span>
        </button>
      ))}
      {untimed.map((t) => (
        <button key={t.id} draggable={!t.is_recurring} onDragStart={dragData('task', t.id)} onClick={() => onEdit(t)}
          className="block w-full truncate rounded bg-panel-3 px-1 py-0.5 text-left text-[10px] text-ink-2">
          {t.title}
        </button>
      ))}
    </div>
  )
}

function HourColumn({ day, hours, onEdit, onCreate, onMove }: {
  day: Date; hours: number[]
  onEdit: (t: Task) => void; onCreate: (d: string) => void; onMove: MoveFn
}) {
  const s = useHorizon()
  const [over, setOver] = useState(false)
  const timed = [...tasksForDay(s.tasks, day)]
    .map((t) => ({ t, hm: extractHourMinute(t.title) }))
    .filter((x): x is { t: Task; hm: { hour: number; minute: number } } => x.hm !== null)

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setOver(false)
    const d = readDrag(e); if (d) onMove(d.kind, d.id, iso(day))
  }

  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}
      className={`relative border-l border-line-2/40 ${isToday(day) ? 'bg-sun/5' : ''} ${over ? 'bg-sun/10' : ''}`}
      style={{ height: hours.length * ROW_H }}
      onClick={() => onCreate(iso(day))}>
      {hours.map((h) => <div key={h} className="absolute left-0 right-0 border-t border-line-2/30" style={{ top: (h - HOUR_START) * ROW_H }} />)}
      {timed.map(({ t, hm }) => {
        const top = (hm.hour - HOUR_START + hm.minute / 60) * ROW_H
        const height = Math.max(20, (t.duration_min ?? 30) / 60 * ROW_H)
        const done = !t.is_recurring && t.status === 'fait'
        const domain = s.domains.find((d) => d.id === (t.domain_id ?? s.projects.find((p) => p.id === t.project_id)?.domain_id))
        return (
          <button key={t.id} draggable={!t.is_recurring} onDragStart={dragData('task', t.id)}
            onClick={(e) => { e.stopPropagation(); onEdit(t) }}
            className="absolute left-0.5 right-0.5 overflow-hidden rounded-md border border-sun/30 bg-panel-2 px-1 py-0.5 text-left"
            style={{ top, height, borderLeftColor: domain?.color, borderLeftWidth: 3 }}>
            <span className={`block truncate text-[10px] leading-tight ${done ? 'text-ink-3 line-through' : 'text-ink'}`}>{t.title}</span>
          </button>
        )
      })}
    </div>
  )
}

// ---- Vues Trimestre / Année : seulement les items "notable" + objectifs ---

function MultiMonth({ anchor, months, yearMode, onEdit, onStep, onMove }: {
  anchor: Date; months: number; yearMode?: boolean
  onEdit: (t: Task) => void; onCreate: (d: string) => void; onStep: (st: Step) => void; onMove: MoveFn
}) {
  const s = useHorizon()
  const first = yearMode ? startOfMonth(new Date(anchor.getFullYear(), 0, 1)) : startOfMonth(anchor)
  const monthList = Array.from({ length: months }, (_, i) => addMonths(first, i))

  const notableTasks = s.tasks.filter((t) => t.notable && (t.scheduled_date || t.due_date))
  const notableSteps = s.steps.filter((st) => st.notable && (st.scheduled_date || st.due_date))
  const objectives = s.objectives.filter((o) => o.target_date && o.status !== 'abandonne')

  const itemsInMonth = (m: Date) => {
    const inM = (d: string | null) => d != null && isSameMonth(parseISO(d), m)
    const tks = notableTasks.filter((t) => inM(t.scheduled_date) || inM(t.due_date))
      .map((t) => ({ kind: 'task' as const, id: t.id, title: t.title, date: t.scheduled_date ?? t.due_date!, task: t }))
    const sts = notableSteps.filter((st) => inM(st.scheduled_date) || inM(st.due_date))
      .map((st) => ({ kind: 'step' as const, id: st.id, title: st.title, date: st.scheduled_date ?? st.due_date!, step: st }))
    const obs = objectives.filter((o) => inM(o.target_date))
      .map((o) => ({ kind: 'objective' as const, id: o.id, title: o.title, date: o.target_date!, objective: o }))
    return [...obs, ...tks, ...sts].sort((a, b) => a.date.localeCompare(b.date))
  }

  return (
    <>
      <p className="text-xs text-ink-3">
        {yearMode ? 'Vue annuelle' : 'Vue trimestrielle'} — objectifs (échéance) et items marqués <Star size={11} className="inline text-sun" /> « notable ». Glisse entre les mois pour changer la date.
      </p>
      <div className={`grid gap-3 ${yearMode ? 'sm:grid-cols-2 lg:grid-cols-3' : 'md:grid-cols-3'}`}>
        {monthList.map((m) => (
          <MonthColumn key={m.toISOString()} month={m} items={itemsInMonth(m)} onEdit={onEdit} onStep={onStep} onMove={onMove} />
        ))}
      </div>
    </>
  )
}

type MonthItem =
  | { kind: 'task'; id: string; title: string; date: string; task: Task }
  | { kind: 'step'; id: string; title: string; date: string; step: Step }
  | { kind: 'objective'; id: string; title: string; date: string; objective: Objective }

function MonthColumn({ month, items, onEdit, onStep, onMove }: {
  month: Date; items: MonthItem[]
  onEdit: (t: Task) => void; onStep: (st: Step) => void; onMove: MoveFn
}) {
  const [over, setOver] = useState(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setOver(false)
    const d = readDrag(e); if (!d) return
    // conserve le jour du mois d'origine, borné au nb de jours du mois cible
    const src = items.find((it) => it.id === d.id)
    const day = src ? getDate(parseISO(src.date)) : 1
    const target = new Date(month.getFullYear(), month.getMonth(), Math.min(day, getDaysInMonth(month)))
    onMove(d.kind, d.id, iso(target))
  }
  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}
      className={`card p-4 transition-colors ${over ? 'ring-2 ring-sun/60' : ''}`}>
      <p className="mb-2 text-sm font-medium capitalize">{format(month, 'MMMM yyyy', { locale: fr })}</p>
      {items.length === 0 ? (
        <p className="text-xs text-ink-3">—</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.kind + it.id}>
              <button
                draggable onDragStart={dragData(it.kind, it.id)}
                onClick={() => it.kind === 'task' ? onEdit(it.task) : it.kind === 'step' ? onStep(it.step) : undefined}
                className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-ink-2 transition-colors hover:bg-panel-3">
                <span className="w-9 shrink-0 tabular-nums text-ink-3">{format(parseISO(it.date), 'd MMM', { locale: fr })}</span>
                {it.kind === 'step' && <Layers size={11} className="shrink-0 text-[#6ea8ee]" />}
                {it.kind === 'objective' && <Target size={11} className="shrink-0 text-sun" />}
                <span className="truncate">{it.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---- Modale : tâches d'une étape (au clic depuis le calendrier) -----------

function StepTasksModal({ step, onEditTask, onClose }: {
  step: Step; onEditTask: (t: Task) => void; onClose: () => void
}) {
  const s = useHorizon()
  const tasks = s.tasks.filter((t) => t.step_id === step.id)
  const project = s.projects.find((p) => p.id === step.project_id)
  return (
    <Modal open onClose={onClose} title={step.title}>
      <div className="space-y-3">
        <p className="text-xs text-ink-3">
          {project && <>Projet : {project.title}. </>}
          {step.due_date && <>Échéance {format(parseISO(step.due_date), 'd MMMM', { locale: fr })}.</>}
        </p>
        <div>
          <p className="block-title mb-1">Tâches à faire</p>
          {tasks.length === 0 ? <p className="text-xs text-ink-3">Aucune tâche pour cette étape.</p> : (
            <ul className="space-y-1">
              {tasks.map((t) => {
                const done = t.status === 'fait'
                return (
                  <li key={t.id} className="flex items-center gap-2">
                    <button onClick={() => void s.update('tasks', t.id, done ? { status: 'a_faire', done_at: null } : { status: 'fait', done_at: new Date().toISOString() })}
                      className="shrink-0" aria-label={done ? 'Marquer à faire' : 'Marquer fait'}>
                      {done ? <CheckCircle2 size={16} className="text-[#4cc79a]" /> : <Circle size={16} className="text-ink-3 hover:text-sun" />}
                    </button>
                    <button onClick={() => { onEditTask(t); onClose() }} className="min-w-0 flex-1 text-left">
                      <span className={`block truncate text-sm ${done ? 'text-ink-3 line-through' : 'text-ink-2'}`}>{t.title}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
