import { useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CheckCircle2, Circle } from 'lucide-react'
import { useHorizon, vueCourante } from '../lib/store'
import { copieDeTache, timeQuoteOfDay } from '../lib/logic'
import { EmptyState, Modal, Seg } from '../components/ui'
import { TaskForm } from '../components/TaskForm'
import { AgendaPropositions } from '../components/AgendaPropositions'
import type { Step, Task } from '../lib/types'

import { MassPickCtx, type Kind, type MoveFn } from './temps/partage'
import { MassPicker } from './temps/MassPicker'
import { DayCell } from './temps/DayCell'
import { WeekHours } from './temps/SemaineHeures'
import { NotesSemaine } from './temps/NotesSemaine'
import { MoisTelephone } from './temps/MoisTelephone'
import { NavPeriode, type VueTemps } from './temps/NavPeriode'
import { SelecteurVue } from './temps/SelecteurVue'
import { useMediaQuery } from '../lib/useMediaQuery'
import { MultiMonth } from './temps/VuesLongues'
import { couleurMois, moisMajoritaire, rubanMois, semainesFenetre, teinteMois, useMolette } from './temps/molette'
type View = VueTemps

/** Agendas qu'on peut afficher (boutons en haut de la page). Seul celui de Joffrey est relié pour l'instant. */
const AGENDAS = ['Joffrey', 'Honorine'] as const
type Agenda = (typeof AGENDAS)[number]

export function TimeView() {
  const s = useHorizon()
  // Vue partagée : l'agenda en lecture seule (ni création, ni déplacement, ni notes).
  const lecture = !!vueCourante(s)
  // « /temps/2026-10-23 » (lien d'une notification de rempla) : on ouvre la
  // vue mois sur le mois de ce jour, où il est encadré en pointillé rouge.
  // La forme « ?date= » reste acceptée, mais Android la perd en ouvrant le
  // lien dans l'app installée — d'où la date dans le chemin.
  const { date: dateChemin } = useParams()
  const [params] = useSearchParams()
  const brut = dateChemin ?? params.get('date')
  const dateDemandee = brut && /^\d{4}-\d{2}-\d{2}$/.test(brut) ? brut : null
  const [view, setView] = useState<View>('4sem')
  const [agenda, setAgenda] = useState<Agenda>('Joffrey')
  const agendaRelie = agenda === 'Joffrey'
  const [anchor, setAnchor] = useState(() => (dateDemandee ? parseISO(dateDemandee) : new Date()))
  // Jour à mettre en haut de la grille (vue mois) : celui de la notification,
  // tant qu'on n'a pas navigué ailleurs.
  const [focus, setFocus] = useState<Date | null>(() => (dateDemandee ? parseISO(dateDemandee) : null))
  const [editing, setEditing] = useState<Task | null>(null)
  const [createDate, setCreateDate] = useState<string | null>(null)
  const [overrideScheduled, setOverrideScheduled] = useState<string | undefined>(undefined)
  const [openStep, setOpenStep] = useState<Step | null>(null)
  const [massPick, setMassPick] = useState<{ date: string; label: string } | null>(null)
  // Téléphone : le mois entier tient sur l'écran (vue agenda de poche).
  const telephone = useMediaQuery('(max-width: 767px)')
  const moisTel = telephone && view === '4sem'
  // Vue Mois : fenêtre glissante de 5 semaines (lundi de la 1re), posée par la
  // molette ou le balayage. null = grille habituelle calée sur le mois.
  const [fenetre, setFenetre] = useState<Date | null>(null)
  const changerVue = (v: View) => { setFenetre(null); setView(v) }

  const shift = (dir: 1 | -1) => {
    setFocus(null)
    setFenetre(null)
    if (view === '4sem') setAnchor(addMonths(anchor, dir))
    else if (view === 'semaine') setAnchor(addWeeks(anchor, dir))
    else if (view === 'trimestre') setAnchor(addMonths(anchor, dir * 3))
    else setAnchor(addMonths(anchor, dir * 12))
  }

  // Un pas de molette (ou de balayage en vue Mois sur téléphone) : Mois = 1
  // semaine (fenêtre glissante), Semaine = 1 semaine, Trimestre = 1 mois, Année = 1 an.
  const pas = (dir: 1 | -1) => {
    setFocus(null)
    if (view === '4sem') {
      const depart = fenetre ?? (moisTel ? startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }) : debutGrille(anchor, focus))
      const f = addWeeks(depart, dir)
      setFenetre(f)
      setAnchor(moisMajoritaire(f))
    } else if (view === 'semaine') setAnchor(addWeeks(anchor, dir))
    else if (view === 'trimestre') setAnchor(addMonths(anchor, dir))
    else setAnchor(addMonths(anchor, dir * 12))
  }
  const calRef = useRef<HTMLDivElement>(null)
  useMolette(calRef, pas, agendaRelie)

  // Déplacer un item : on ne change que la date. Cohérence : si une tâche
  // atterrit après son échéance, on ouvre le formulaire (date pré-remplie) et
  // la validation reste bloquée tant que ce n'est pas cohérent.
  const handleMove = (kind: Kind, id: string, dayIso: string, copier = false) => {
    if (kind === 'task') {
      const t = s.tasks.find((x) => x.id === id)
      // Ctrl + glisser : copie indépendante (rien ne bouge, pas de contrôle d'échéance).
      if (copier && t) { void s.insert('tasks', copieDeTache(t, dayIso)); return }
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
  const common = lecture
    ? { onEdit: () => {}, onCreate: () => {}, onStep: () => {}, onMove: () => {} }
    : { onEdit: setEditing, onCreate: setCreateDate, onStep: setOpenStep, onMove: handleMove }
  const timeQuote = timeQuoteOfDay()

  return (
    <div className={`rise flex md:h-[calc(100dvh-1.75rem)] flex-col gap-3 pt-4 max-md:h-[calc(100dvh-8.5rem)] max-md:gap-1.5 max-md:pt-1 ${lecture ? 'temps-lecture' : ''}`}>
      {/* Titre à gauche, période au centre (la même pour les 4 vues), choix de la
          vue à droite. Téléphone : la période passe sous le choix de la vue. */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 md:grid md:grid-cols-[1fr_auto_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold max-md:hidden">Agenda</h1>
            {/* Quel agenda afficher : celui de Joffrey (partagé avec Honorine) ou celui d'Honorine. */}
            <Seg value={agenda} onChange={setAgenda} options={AGENDAS.map((a) => ({ value: a, label: a }))} />
          </div>
          <p className="text-sm italic text-ink-3 max-md:hidden">
            « {timeQuote.text} »{timeQuote.source && <span className="not-italic"> — {timeQuote.source}</span>}
          </p>
        </div>
        <div className="max-md:order-last max-md:basis-full">
          <NavPeriode vue={view} anchor={anchor} onShift={shift} onGoto={(d) => { setFocus(null); setFenetre(null); setAnchor(d) }} />
        </div>
        <div className="flex justify-end max-md:ml-auto">
          <SelecteurVue value={view} onChange={changerVue} options={[
            { value: 'semaine', label: 'Semaine' },
            { value: '4sem', label: 'Mois' },
            { value: 'trimestre', label: 'Trimestre' },
            { value: 'annee', label: 'Année' },
          ]} />
        </div>
      </header>

      {/* Évènements d'agenda externe en attente de tri : rien n'entre sans accord. */}
      {!lecture && agendaRelie && <div className="shrink-0"><AgendaPropositions /></div>}

      <MassPickCtx.Provider value={lecture ? () => {} : (date, label) => setMassPick({ date, label })}>
          {/* Chaque vue remplit la hauteur de l'écran ; elle ne défile qu'en dernier
              recours (trop d'évènements pour tenir), jamais pour cacher quelque chose. */}
          <div ref={calRef} className={`min-h-0 flex-1 ${view === 'semaine' || moisTel ? 'overflow-hidden max-md:overflow-y-auto' : 'overflow-y-auto'}`}>
            {!agendaRelie && (
              <EmptyState hint="Pour l’instant, c’est l’agenda de Joffrey qui est partagé.">
                L’agenda d’Honorine n’est pas encore relié.
              </EmptyState>
            )}
            {agendaRelie && <>
            {view === '4sem' && !moisTel && <FourWeeks anchor={anchor} focus={focus} fenetre={fenetre} {...common} />}
            {moisTel && <MoisTelephone anchor={anchor} fenetre={fenetre} onShift={pas} {...common} />}
            {/* Semaine : la grille prend toute la hauteur (jours entiers). */}
            {view === 'semaine' && (
              <div className="flex h-full min-h-[340px] md:min-h-0">
                <WeekHours anchor={anchor} {...common} />
              </div>
            )}
            {view === 'trimestre' && <MultiMonth anchor={anchor} months={3} {...common} />}
            {view === 'annee' && <MultiMonth anchor={anchor} months={12} yearMode {...common} />}
            </>}
          </div>
          {/* Bloc-notes en bas de TOUTES les vues (même contenu partout), hors de la
              zone qui défile. Le « mois de poche » du téléphone, qui tient sur un
              écran, n'en a pas. */}
          {!moisTel && !lecture && agendaRelie && <NotesSemaine lignes={telephone ? 2 : view === 'semaine' ? 4 : 3} />}
      </MassPickCtx.Provider>

      {massPick && <MassPicker pick={massPick} onClose={() => setMassPick(null)} />}

      <TaskForm open={!lecture && (editing !== null || createDate !== null)} task={editing}
        defaultDate={createDate ?? undefined} overrideScheduled={overrideScheduled}
        onClose={closeTask} />

      {openStep && <StepTasksModal step={openStep} onEditTask={setEditing} onClose={() => setOpenStep(null)} />}
    </div>
  )
}

// ---- Vue 4 semaines (défaut) ---------------------------------------------

/** Premier lundi de la grille Mois habituelle (voir FourWeeks). */
function debutGrille(anchor: Date, focus?: Date | null): Date {
  const today = new Date()
  return focus
    ? startOfWeek(focus, { weekStartsOn: 1 })
    : isSameMonth(anchor, today)
      ? startOfWeek(today, { weekStartsOn: 1 })
      : startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 })
}

function FourWeeks({ anchor, focus, fenetre, onEdit, onCreate, onStep, onMove }: {
  anchor: Date; focus?: Date | null; fenetre?: Date | null
  onEdit: (t: Task) => void; onCreate: (d: string) => void; onStep: (st: Step) => void; onMove: MoveFn
}) {
  // Mois en cours : la grille démarre sur la SEMAINE DU JOUR (pas de semaines déjà
  // passées) et court au moins 4 semaines, plus s'il en faut pour finir le mois.
  // Autre mois : grille complète du mois, à partir de la semaine qui contient le 1er.
  // Jour demandé (`focus`, lien d'une notification) : sa semaine en haut.
  const weeks = useMemo(() => {
    // Fenêtre glissante (molette) : 5 semaines à partir de son lundi.
    if (fenetre) return semainesFenetre(fenetre)
    const gridStart = debutGrille(anchor, focus)
    const monthEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 })
    const minEnd = endOfWeek(addWeeks(gridStart, 3), { weekStartsOn: 1 })
    const gridEnd = monthEnd > minEnd ? monthEnd : minEnd
    const out: Date[][] = []
    for (let start = gridStart; start <= gridEnd; start = addWeeks(start, 1)) {
      out.push(eachDayOfInterval({ start, end: endOfWeek(start, { weekStartsOn: 1 }) }))
    }
    return out
  }, [anchor, focus, fenetre])

  // Chaque mois a son fond doux (alterné orange / bleu-vert) et le 1er porte un
  // ruban « → Mois » : le passage d'un mois à l'autre se voit sans rien griser.

  return (
    <>
      {/* Les lignes ont la même hauteur, sauf celle dont le contenu en demande plus :
          elle prend ce qu'il lui faut, les autres se partagent le reste. Tous les
          évènements restent visibles (le défilement n'est qu'un dernier recours). */}
      <div className="grid h-full gap-1.5" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(min-content, 1fr))` }}>
        {weeks.map((days, i) => (
          <div key={i} className="grid grid-cols-7 gap-1.5">
            {days.map((day) => (
              <DayCell key={day.toISOString()} day={day} remplir
                tint={teinteMois(day)} ruban={rubanMois(day)} rubanCouleur={couleurMois(day)}
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
