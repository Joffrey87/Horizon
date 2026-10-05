import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, CheckCircle2, Circle } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { timeQuoteOfDay } from '../lib/logic'
import { Seg, Modal } from '../components/ui'
import { TaskForm } from '../components/TaskForm'
import { AgendaPropositions } from '../components/AgendaPropositions'
import type { Step, Task } from '../lib/types'

import { LAYER_DEFS, LAYERS_KEY, LayersCtx, MassPickCtx, loadLayers, type CalLayers, type Kind, type MoveFn } from './temps/partage'
import { MassPicker } from './temps/MassPicker'
import { DayCell } from './temps/DayCell'
import { WeekHours } from './temps/SemaineHeures'
import { NotesSemaine } from './temps/NotesSemaine'
import { MoisTelephone } from './temps/MoisTelephone'
import { useMediaQuery } from '../lib/useMediaQuery'
import { MultiMonth } from './temps/VuesLongues'
type View = '4sem' | 'semaine' | 'trimestre' | 'annee'

export function TimeView() {
  const s = useHorizon()
  // « /temps/2026-10-23 » (lien d'une notification de rempla) : on ouvre la
  // vue mois sur le mois de ce jour, où il est encadré en pointillé rouge.
  // La forme « ?date= » reste acceptée, mais Android la perd en ouvrant le
  // lien dans l'app installée — d'où la date dans le chemin.
  const { date: dateChemin } = useParams()
  const [params] = useSearchParams()
  const brut = dateChemin ?? params.get('date')
  const dateDemandee = brut && /^\d{4}-\d{2}-\d{2}$/.test(brut) ? brut : null
  const [view, setView] = useState<View>('4sem')
  const [anchor, setAnchor] = useState(() => (dateDemandee ? parseISO(dateDemandee) : new Date()))
  // Jour à mettre en haut de la grille (vue mois) : celui de la notification,
  // tant qu'on n'a pas navigué ailleurs.
  const [focus, setFocus] = useState<Date | null>(() => (dateDemandee ? parseISO(dateDemandee) : null))
  const [editing, setEditing] = useState<Task | null>(null)
  const [createDate, setCreateDate] = useState<string | null>(null)
  const [overrideScheduled, setOverrideScheduled] = useState<string | undefined>(undefined)
  const [openStep, setOpenStep] = useState<Step | null>(null)
  const [massPick, setMassPick] = useState<{ date: string; label: string } | null>(null)
  const [layers, setLayers] = useState<CalLayers>(loadLayers)
  // Téléphone : le mois entier tient sur l'écran (vue agenda de poche).
  const telephone = useMediaQuery('(max-width: 767px)')
  const moisTel = telephone && view === '4sem'
  const arilId = useMemo(() => s.domains.find((d) => /aril/i.test(d.name))?.id ?? null, [s.domains])
  const toggleLayer = (k: keyof CalLayers) => setLayers((prev) => {
    const next = { ...prev, [k]: !prev[k] }
    try { localStorage.setItem(LAYERS_KEY, JSON.stringify(next)) } catch { /* stockage indispo */ }
    return next
  })

  const boutonsCouches = LAYER_DEFS.map(({ key, label }) => (
    <button key={key} onClick={() => toggleLayer(key)}
      title={key === 'aril' && !arilId ? 'Crée un domaine nommé « ARIL » pour alimenter ce calendrier' : undefined}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        layers[key] ? 'border-sun/50 bg-sun/10 text-sun-soft' : 'border-line-2 text-ink-3 hover:text-ink-2'
      }`}>
      {label}
    </button>
  ))

  const shift = (dir: 1 | -1) => {
    setFocus(null)
    if (view === '4sem') setAnchor(addMonths(anchor, dir))
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
    <div className="rise flex h-[calc(100vh-5.5rem)] flex-col gap-3 pt-4 max-md:h-[calc(100dvh-8.5rem)] max-md:gap-1.5 max-md:pt-1">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="max-md:hidden">
          <h1 className="text-xl font-semibold">Temps</h1>
          <p className="text-sm italic text-ink-3 max-md:hidden">
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

      {/* ---- Calendriers (couches) affichables/masquables. En vue Semaine ils
           passent à droite du calendrier, en colonne : la hauteur sert à la grille. ---- */}
      {view !== 'semaine' && !moisTel && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[11px] uppercase tracking-wide text-ink-3">Calendriers</span>
          {boutonsCouches}
        </div>
      )}

      {/* Évènements d'agenda externe en attente de tri : rien n'entre sans accord. */}
      <div className="shrink-0"><AgendaPropositions /></div>

      <LayersCtx.Provider value={{ layers, arilId }}>
        <MassPickCtx.Provider value={(date, label) => setMassPick({ date, label })}>
          <div className={`min-h-0 flex-1 ${moisTel ? 'overflow-hidden' : view === 'semaine' ? 'overflow-hidden max-md:overflow-y-auto' : 'space-y-2 overflow-y-auto pr-0.5'}`}>
            {view === '4sem' && !moisTel && <FourWeeks anchor={anchor} focus={focus} {...common} />}
            {moisTel && <MoisTelephone anchor={anchor} onShift={shift} {...common} />}
            {/* Semaine : la grille prend toute la hauteur (jours entiers), notes dessous. */}
            {view === 'semaine' && (
              <div className="flex h-full flex-col gap-2">
                <div className="flex min-h-[340px] flex-1 flex-col gap-2 md:min-h-0 md:flex-row">
                  <WeekHours anchor={anchor} {...common} />
                  {/* Téléphone : les boutons passent AU-DESSUS du calendrier. */}
                  <aside aria-label="Calendriers" className="order-first flex shrink-0 flex-row flex-wrap items-center gap-1.5 md:order-none md:flex-col md:items-stretch md:pt-1">
                    <span className="px-1 text-[10px] uppercase tracking-wide text-ink-3">Calendriers</span>
                    {boutonsCouches}
                  </aside>
                </div>
                <NotesSemaine />
              </div>
            )}
            {view === 'trimestre' && <MultiMonth anchor={anchor} months={3} {...common} />}
            {view === 'annee' && <MultiMonth anchor={anchor} months={12} yearMode {...common} />}
          </div>
        </MassPickCtx.Provider>
      </LayersCtx.Provider>

      {massPick && <MassPicker pick={massPick} onClose={() => setMassPick(null)} />}

      <TaskForm open={editing !== null || createDate !== null} task={editing}
        defaultDate={createDate ?? undefined} overrideScheduled={overrideScheduled}
        onClose={closeTask} />

      {openStep && <StepTasksModal step={openStep} onEditTask={setEditing} onClose={() => setOpenStep(null)} />}
    </div>
  )
}

// ---- Vue 4 semaines (défaut) ---------------------------------------------

function FourWeeks({ anchor, focus, onEdit, onCreate, onStep, onMove }: {
  anchor: Date; focus?: Date | null
  onEdit: (t: Task) => void; onCreate: (d: string) => void; onStep: (st: Step) => void; onMove: MoveFn
}) {
  // Mois en cours : la grille démarre sur la SEMAINE DU JOUR (pas de semaines déjà
  // passées) et court au moins 4 semaines, plus s'il en faut pour finir le mois.
  // Autre mois : grille complète du mois, à partir de la semaine qui contient le 1er.
  // Jour demandé (`focus`, lien d'une notification) : sa semaine en haut.
  const weeks = useMemo(() => {
    const today = new Date()
    const gridStart = focus
      ? startOfWeek(focus, { weekStartsOn: 1 })
      : isSameMonth(anchor, today)
        ? startOfWeek(today, { weekStartsOn: 1 })
        : startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 })
    const monthEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 })
    const minEnd = endOfWeek(addWeeks(gridStart, 3), { weekStartsOn: 1 })
    const gridEnd = monthEnd > minEnd ? monthEnd : minEnd
    const out: Date[][] = []
    for (let start = gridStart; start <= gridEnd; start = addWeeks(start, 1)) {
      out.push(eachDayOfInterval({ start, end: endOfWeek(start, { weekStartsOn: 1 }) }))
    }
    return out
  }, [anchor, focus])

  // Jours hors du mois de référence : légèrement atténués pour rester lisibles sans distraire.
  const outsideTint = 'rgba(120,120,140,0.14)'
  // Un seul nom de mois : celui qu'on regarde. Les jours des mois voisins que la
  // grille affiche pour compléter les semaines sont grisés (voir `dim`).
  const title = format(anchor, 'MMMM yyyy', { locale: fr })

  return (
    <>
      <p className="text-center text-sm font-medium capitalize">{title}</p>
      <div className="space-y-2">
        {weeks.map((days, i) => (
          <div key={i} className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-7">
            {days.map((day) => (
              <DayCell key={day.toISOString()} day={day}
                tint={isSameMonth(day, anchor) ? undefined : outsideTint}
                dim={!isSameMonth(day, anchor)}
                onEdit={onEdit} onCreate={onCreate} onStep={onStep} onMove={onMove} />
            ))}
          </div>
        ))}
      </div>
    </>
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
