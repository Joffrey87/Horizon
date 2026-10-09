import { useState } from 'react'
import { addMonths, format, getDate, getDaysInMonth, isSameMonth, parseISO, startOfMonth } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Layers, Star, Target } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { iso } from '../../lib/logic'
import { couleurProjet } from '../../lib/projectIcons'
import { IconeProjet } from '../../components/IconeProjet'
import type { Objective, Step, Task } from '../../lib/types'
import { dragData, readDrag, survol, veutCopier, type MoveFn } from './partage'

// ---- Vues Trimestre / Année : seulement les items "notable" + objectifs ---

export function MultiMonth({ anchor, months, yearMode, onEdit, onStep, onMove }: {
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
    <div className="flex h-full flex-col gap-2">
      <p className="shrink-0 text-xs text-ink-3">
        {yearMode ? 'Vue annuelle' : 'Vue trimestrielle'} — objectifs (échéance) et items marqués <Star size={11} className="inline text-sun" /> « notable ». Glisse entre les mois pour changer la date.
      </p>
      {/* Rangées de même hauteur, sauf celle dont le contenu en demande plus. */}
      <div className={`grid flex-1 gap-2 ${yearMode
        ? 'sm:grid-cols-2 md:grid-cols-4 md:[grid-template-rows:repeat(3,minmax(min-content,1fr))]'
        : 'md:grid-cols-3 md:[grid-template-rows:minmax(min-content,1fr)]'}`}>
        {monthList.map((m) => (
          <MonthColumn key={m.toISOString()} month={m} items={itemsInMonth(m)} onEdit={onEdit} onStep={onStep} onMove={onMove} />
        ))}
      </div>
    </div>
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
  const s = useHorizon()
  const [over, setOver] = useState(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setOver(false)
    const d = readDrag(e); if (!d) return
    // conserve le jour du mois d'origine, borné au nb de jours du mois cible
    const src = items.find((it) => it.id === d.id)
    const day = src ? getDate(parseISO(src.date)) : 1
    const target = new Date(month.getFullYear(), month.getMonth(), Math.min(day, getDaysInMonth(month)))
    onMove(d.kind, d.id, iso(target), veutCopier(e))
  }
  return (
    <div onDragOver={(e) => { survol(e); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}
      className={`flex flex-col rounded-xl border border-line-2/60 p-3 transition-colors ${over ? 'ring-2 ring-sun/60' : ''}`}>
      <div className="mb-1.5 flex shrink-0 items-center justify-between gap-2">
        <p className="text-sm font-medium capitalize">{format(month, 'MMMM yyyy', { locale: fr })}</p>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-ink-3">—</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => {
            const projet = it.kind === 'task' ? s.projects.find((p) => p.id === it.task.project_id)
              : it.kind === 'step' ? s.projects.find((p) => p.id === it.step.project_id) : undefined
            const couleur = couleurProjet(projet, s.domains)
            return (
            <li key={it.kind + it.id}>
              <button
                draggable onDragStart={dragData(it.kind, it.id)}
                onClick={() => it.kind === 'task' ? onEdit(it.task) : it.kind === 'step' ? onStep(it.step) : undefined}
                style={couleur ? { border: `1.5px solid ${couleur}` } : undefined}
                className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-ink-2 transition-colors hover:bg-panel-3">
                <span className="w-9 shrink-0 tabular-nums text-ink-3">{format(parseISO(it.date), 'd MMM', { locale: fr })}</span>
                {it.kind === 'step' && <Layers size={11} className="shrink-0 text-[#6ea8ee]" />}
                {it.kind === 'objective' && <Target size={11} className="shrink-0 text-sun" />}
                {projet && <IconeProjet project={projet} size={11} />}
                <span className="truncate">{it.title}</span>
              </button>
            </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
