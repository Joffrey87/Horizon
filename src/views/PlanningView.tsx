import { useMemo, useState } from 'react'
import {
  addMonths, addWeeks, eachDayOfInterval, endOfWeek, format, getDate, getDaysInMonth,
  isSameMonth, isToday, parseISO, startOfMonth, startOfWeek, subWeeks,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Inbox, CheckCircle2, Circle, Sparkles } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { iso, tasksForDay, compareTasksByTitleTime, quadrant, spanPart } from '../lib/logic'
import { Card, DomainDot, Seg } from '../components/ui'
import { TaskForm } from '../components/TaskForm'
import type { Task } from '../lib/types'

type Mode = 'planifie' | 'ideal'
type CalView = 'semaine' | 'mois' | 'trimestre' | 'annee'

const QUAD_COLOR: Record<1 | 2 | 3 | 4, string> = {
  1: '#eda145', 2: '#fbbf24', 3: '#6ea8ee', 4: '#857c6d',
}
const QUAD_LABEL: Record<1 | 2 | 3 | 4, string> = {
  1: 'Important & urgent', 2: 'Important, pas urgent', 3: 'Urgent, peu important', 4: 'Ni urgent ni important',
}
type LeftView = 'matrice' | 'cadran' | 'echeance'

export function PlanningView() {
  const s = useHorizon()
  const [anchor, setAnchor] = useState(new Date())
  const [view, setView] = useState<CalView>('semaine')
  const [mode, setMode] = useState<Mode>('planifie')
  const [leftView, setLeftView] = useState<LeftView>('matrice')
  const [quad, setQuad] = useState<1 | 2 | 3 | 4>(1)
  const [editing, setEditing] = useState<Task | null>(null)
  const [creating, setCreating] = useState(false)

  const domainOf = (t: Task) => s.domains.find((d) => d.id === (t.domain_id ?? s.projects.find((p) => p.id === t.project_id)?.domain_id))

  // Colonne gauche = tâches de Priorités non encore placées (ni planifiées ni idéalisées).
  const backlog = useMemo(() => s.tasks
    .filter((t) => t.is_task !== false && !t.is_recurring
      && (t.status === 'a_faire' || t.status === 'en_cours')
      && !t.scheduled_date && !t.ideal_date)
    .sort((a, b) => {
      const sc = (t: Task) => (t.importance ?? 2) * 3 + (t.urgence ?? 2) * 2
      return sc(b) - sc(a)
    }), [s.tasks])

  const weeks = useMemo(() => {
    const first = startOfWeek(anchor, { weekStartsOn: 1 })
    const n = view === 'semaine' ? 1 : 4
    return Array.from({ length: n }, (_, w) => {
      const start = addWeeks(first, w)
      return eachDayOfInterval({ start, end: endOfWeek(start, { weekStartsOn: 1 }) })
    })
  }, [anchor, view])

  const months = useMemo(() => {
    const n = view === 'trimestre' ? 3 : 12
    const first = view === 'annee' ? startOfMonth(new Date(anchor.getFullYear(), 0, 1)) : startOfMonth(anchor)
    return Array.from({ length: n }, (_, i) => addMonths(first, i))
  }, [anchor, view])

  const shift = (dir: 1 | -1) => {
    if (view === 'semaine') setAnchor(dir === 1 ? addWeeks(anchor, 1) : subWeeks(anchor, 1))
    else if (view === 'mois') setAnchor(dir === 1 ? addWeeks(anchor, 4) : subWeeks(anchor, 4))
    else if (view === 'trimestre') setAnchor(addMonths(anchor, dir * 3))
    else setAnchor(addMonths(anchor, dir * 12))
  }

  const place = (id: string, dayIso: string | null) => {
    if (dayIso === null) { void s.update('tasks', id, { scheduled_date: null, ideal_date: null }); return }
    if (mode === 'planifie') void s.update('tasks', id, { scheduled_date: dayIso, ideal_date: null })
    else void s.update('tasks', id, { ideal_date: dayIso, scheduled_date: null })
  }
  // dépose sur un mois (vues trim/année) : garde le jour d'origine si connu, sinon le 1er.
  const placeMonth = (id: string, month: Date) => {
    const t = s.tasks.find((x) => x.id === id)
    const src = t?.scheduled_date ?? t?.ideal_date ?? t?.due_date
    const day = src ? getDate(parseISO(src)) : 1
    const target = new Date(month.getFullYear(), month.getMonth(), Math.min(day, getDaysInMonth(month)))
    place(id, iso(target))
  }
  const drag = (id: string) => (e: React.DragEvent) => {
    e.dataTransfer.setData('application/horizon-plan', id); e.dataTransfer.effectAllowed = 'move'
  }
  const readId = (e: React.DragEvent) => e.dataTransfer.getData('application/horizon-plan')

  return (
    <div className="rise flex h-[calc(100vh-5.5rem)] flex-col gap-3 pt-4">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Planification</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Seg value={mode}
            onChange={(v) => setMode(v === mode ? (mode === 'planifie' ? 'ideal' : 'planifie') : v)}
            options={[{ value: 'planifie', label: 'Planifié' }, { value: 'ideal', label: 'Idéal' }]} />
          <Seg value={view} onChange={setView} options={[
            { value: 'semaine', label: 'Semaine' }, { value: 'mois', label: 'Mois' },
            { value: 'trimestre', label: 'Trimestre' }, { value: 'annee', label: 'Année' },
          ]} />
          <button onClick={() => shift(-1)} className="btn-ghost p-2" aria-label="Précédent"><ChevronLeft size={15} /></button>
          <button onClick={() => setAnchor(new Date())} className="btn-ghost px-3 py-2 text-xs">Aujourd'hui</button>
          <button onClick={() => shift(1)} className="btn-ghost p-2" aria-label="Suivant"><ChevronRight size={15} /></button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* ---- Gauche : tâches à planifier (Priorités), 3 vues ---- */}
        <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = readId(e); if (id) place(id, null) }}
          className="flex w-72 shrink-0 flex-col rounded-xl border border-line bg-panel-2/40 p-2">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="flex items-center gap-1.5 text-sm font-medium"><Inbox size={15} /> À planifier</span>
            <button onClick={() => setCreating(true)} className="text-ink-3 transition-colors hover:text-sun" aria-label="Nouvelle tâche"><Plus size={16} /></button>
          </div>

          <div className="mb-2 px-0.5">
            <Seg value={leftView} onChange={setLeftView} options={[
              { value: 'matrice', label: 'Matrice' }, { value: 'cadran', label: 'Cadran' }, { value: 'echeance', label: 'Échéance' },
            ]} />
          </div>
          {leftView === 'cadran' && (
            <div className="mb-2 grid grid-cols-2 gap-1 px-0.5">
              {([1, 2, 3, 4] as const).map((q) => (
                <button key={q} onClick={() => setQuad(q)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] transition-colors ${
                    quad === q ? 'border-sun/60 bg-sun/10 text-ink' : 'border-line-2 text-ink-3'
                  }`}>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: QUAD_COLOR[q] }} />
                  <span className="truncate">{QUAD_LABEL[q]}</span>
                </button>
              ))}
            </div>
          )}

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
            {backlog.length === 0 ? (
              <p className="px-1 py-4 text-center text-xs text-ink-3">Tout est placé. 🎉</p>
            ) : leftView === 'matrice' ? (
              ([1, 2, 3, 4] as const).map((q) => {
                const list = backlog.filter((t) => quadrant(t.importance, t.urgence) === q)
                if (list.length === 0) return null
                return (
                  <div key={q}>
                    <p className="mb-1 flex items-center gap-1.5 px-0.5 text-[10px] uppercase tracking-wide text-ink-3">
                      <span className="h-2 w-2 rounded-full" style={{ background: QUAD_COLOR[q] }} /> {QUAD_LABEL[q]}
                    </p>
                    <div className="space-y-1">{list.map((t) => <TaskChip key={t.id} t={t} q={q} drag={drag} onEdit={setEditing} domainOf={domainOf} />)}</div>
                  </div>
                )
              })
            ) : leftView === 'cadran' ? (
              <div className="space-y-1">
                {backlog.filter((t) => quadrant(t.importance, t.urgence) === quad)
                  .map((t) => <TaskChip key={t.id} t={t} q={quad} drag={drag} onEdit={setEditing} domainOf={domainOf} />)}
                {backlog.filter((t) => quadrant(t.importance, t.urgence) === quad).length === 0 &&
                  <p className="px-1 py-3 text-center text-xs text-ink-3">Rien dans ce cadran.</p>}
              </div>
            ) : (
              <div className="space-y-1">
                {backlog.filter((t) => t.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!))
                  .map((t) => <TaskChip key={t.id} t={t} q={quadrant(t.importance, t.urgence)} drag={drag} onEdit={setEditing} domainOf={domainOf} showDue />)}
                {backlog.filter((t) => t.due_date).length === 0 &&
                  <p className="px-1 py-3 text-center text-xs text-ink-3">Aucune tâche avec échéance.</p>}
              </div>
            )}
          </div>
        </div>

        {/* ---- Droite : calendrier ---- */}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
          {(view === 'semaine' || view === 'mois') && weeks.map((days, i) => (
            <div key={i} className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-7">
              {days.map((day) => (
                <DayBox key={day.toISOString()} day={day} big={view === 'semaine'}
                  onDropId={(id) => place(id, iso(day))} readId={readId} drag={drag}
                  onEdit={setEditing} domainOf={domainOf} />
              ))}
            </div>
          ))}
          {(view === 'trimestre' || view === 'annee') && (
            <div className={`grid gap-2 ${view === 'annee' ? 'sm:grid-cols-2 lg:grid-cols-3' : 'md:grid-cols-3'}`}>
              {months.map((m) => (
                <MonthBox key={m.toISOString()} month={m}
                  onDropId={(id) => placeMonth(id, m)} readId={readId} drag={drag}
                  onEdit={setEditing} domainOf={domainOf} />
              ))}
            </div>
          )}
        </div>
      </div>

      <TaskForm open={editing !== null || creating} task={editing} defaultIsTask
        onClose={() => { setEditing(null); setCreating(false) }} />
    </div>
  )
}

function TaskChip({ t, q, drag, onEdit, domainOf, showDue }: {
  t: Task; q: 1 | 2 | 3 | 4
  drag: (id: string) => (e: React.DragEvent) => void
  onEdit: (t: Task) => void
  domainOf: (t: Task) => { color: string } | undefined
  showDue?: boolean
}) {
  const domain = domainOf(t)
  return (
    <button draggable onDragStart={drag(t.id)} onClick={() => onEdit(t)}
      className="flex w-full cursor-grab items-center gap-2 rounded-lg border border-line-2/60 bg-panel px-2 py-1.5 text-left transition-colors hover:bg-panel-2 active:cursor-grabbing">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: QUAD_COLOR[q] }} title={`Priorité ${q}`} />
      <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{t.title}</span>
      {showDue && t.due_date && <span className="shrink-0 text-[10px] text-ink-3">{format(parseISO(t.due_date), 'd MMM', { locale: fr })}</span>}
      {domain && <DomainDot color={domain.color} size={6} />}
    </button>
  )
}

function DayBox({ day, big, onDropId, readId, drag, onEdit, domainOf }: {
  day: Date; big: boolean
  onDropId: (id: string) => void
  readId: (e: React.DragEvent) => string
  drag: (id: string) => (e: React.DragEvent) => void
  onEdit: (t: Task) => void
  domainOf: (t: Task) => { color: string } | undefined
}) {
  const s = useHorizon()
  const [over, setOver] = useState(false)
  const today = isToday(day)
  const d = iso(day)

  const planned = [...tasksForDay(s.tasks, day)]
    .filter((t) => t.is_task !== false && !t.is_recurring)
    .sort(compareTasksByTitleTime)
  const ideal = s.tasks.filter((t) => t.ideal_date === d && t.is_task !== false && !t.is_recurring)

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setOver(false)
    const id = readId(e); if (id) onDropId(id)
  }

  return (
    <Card className={`!p-0 ${today ? '!border-sun/50' : ''}`}>
      <div onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}
        className={`flex flex-col rounded-2xl p-2 transition-colors ${big ? 'min-h-40' : 'min-h-24'} ${over ? 'bg-sun/10' : today ? 'bg-sun/5' : ''}`}>
        <p className={`mb-1.5 text-xs font-medium ${today ? 'text-sun-soft' : 'text-ink-3'}`}>{format(day, 'EEE d', { locale: fr })}</p>
        <div className="min-h-0 flex-1 space-y-1">
          {planned.map((t) => {
            const done = t.status === 'fait'
            const c = domainOf(t)?.color
            const part = spanPart(t, d)
            // Jours intermédiaires / fin d'un item multi-jours : barre fine continue, sans coche.
            if (part === 'middle' || part === 'end') {
              return (
                <button key={t.id} draggable onDragStart={drag(t.id)} onClick={() => onEdit(t)} title={t.title}
                  style={{ background: c ? `${c}59` : 'var(--color-line-2)' }}
                  className="block h-1.5 w-full rounded-full" />
              )
            }
            return (
              <div key={t.id} draggable onDragStart={drag(t.id)}
                style={{ background: c ? `${c}2b` : 'var(--color-panel-3)', borderLeft: c ? `3px solid ${c}` : undefined }}
                className="group flex items-start gap-1 rounded px-1 py-0.5">
                <button className="mt-0.5 shrink-0"
                  onClick={() => void s.update('tasks', t.id, done ? { status: 'a_faire', done_at: null } : { status: 'fait', done_at: new Date().toISOString() })}
                  aria-label={done ? 'Décocher' : 'Cocher'}>
                  {done ? <CheckCircle2 size={12} className="text-[#4cc79a]" /> : <Circle size={12} className="text-ink-3 group-hover:text-sun" />}
                </button>
                <button onClick={() => onEdit(t)} className="min-w-0 flex-1 text-left">
                  <span className={`block truncate text-[11px] leading-tight ${done ? 'text-ink-3 line-through' : 'text-ink'}`}>{t.title}</span>
                </button>
              </div>
            )
          })}
          {ideal.map((t) => {
            const c = domainOf(t)?.color
            return (
              <button key={t.id} draggable onDragStart={drag(t.id)} onClick={() => onEdit(t)}
                title="Idéal (souhait — non planifié)"
                style={{ background: c ? `${c}14` : undefined, borderColor: c ? `${c}80` : undefined }}
                className="flex w-full items-center gap-1 rounded border border-dashed px-1 py-0.5 text-left">
                <Sparkles size={10} className="shrink-0 text-teal-soft" />
                <span className="min-w-0 flex-1 truncate text-[11px] italic leading-tight text-ink-2">{t.title}</span>
              </button>
            )
          })}
          {planned.length === 0 && ideal.length === 0 && <p className="pt-1 text-center text-[10px] text-ink-3">—</p>}
        </div>
      </div>
    </Card>
  )
}

function MonthBox({ month, onDropId, readId, drag, onEdit, domainOf }: {
  month: Date
  onDropId: (id: string) => void
  readId: (e: React.DragEvent) => string
  drag: (id: string) => (e: React.DragEvent) => void
  onEdit: (t: Task) => void
  domainOf: (t: Task) => { color: string } | undefined
}) {
  const s = useHorizon()
  const [over, setOver] = useState(false)
  const inM = (d: string | null | undefined) => !!d && isSameMonth(parseISO(d), month)
  const items = s.tasks.filter((t) => t.is_task !== false && !t.is_recurring && (inM(t.scheduled_date) || inM(t.ideal_date)))
    .map((t) => ({ t, ideal: !t.scheduled_date && inM(t.ideal_date), date: t.scheduled_date ?? t.ideal_date! }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setOver(false)
    const id = readId(e); if (id) onDropId(id)
  }

  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}
      className={`card p-3 transition-colors ${over ? 'ring-2 ring-sun/60' : ''}`}>
      <p className="mb-2 text-sm font-medium capitalize">{format(month, 'MMMM yyyy', { locale: fr })}</p>
      {items.length === 0 ? <p className="text-xs text-ink-3">—</p> : (
        <ul className="space-y-1">
          {items.map(({ t, ideal, date }) => {
            const c = domainOf(t)?.color
            return (
              <li key={t.id}>
                <button draggable onDragStart={drag(t.id)} onClick={() => onEdit(t)}
                  style={{ background: c ? `${c}${ideal ? '14' : '2b'}` : undefined, borderLeft: c ? `3px solid ${c}` : undefined }}
                  className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs ${ideal ? 'border border-dashed' : ''}`}>
                  <span className="w-9 shrink-0 tabular-nums text-ink-3">{format(parseISO(date), 'd MMM', { locale: fr })}</span>
                  {ideal && <Sparkles size={10} className="shrink-0 text-teal-soft" />}
                  <span className={`truncate ${ideal ? 'italic text-ink-2' : 'text-ink'}`}>{t.title}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
