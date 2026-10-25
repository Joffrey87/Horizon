import { useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { addDays, addMonths, addWeeks, differenceInCalendarDays, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CheckCircle2, Circle } from 'lucide-react'
import { useHorizon, vueCourante } from '../lib/store'
import { copieDeTache, estGardeTravail, iso, notesGarde, timeQuoteOfDay } from '../lib/logic'
import { EmptyState, Modal, Seg } from '../components/ui'
import { TaskForm } from '../components/TaskForm'
import { AgendaPropositions } from '../components/AgendaPropositions'
import type { Step, Task } from '../lib/types'

import { MassPickCtx, type Kind, type MoveFn } from './temps/partage'
import { MassPicker } from './temps/MassPicker'
import { DayCell } from './temps/DayCell'
import { SemaineBriques } from './temps/SemaineBriques'
import { NotesSemaine } from './temps/NotesSemaine'
import { MoisTelephone } from './temps/MoisTelephone'
import { NavPeriode, type VueTemps } from './temps/NavPeriode'
import { SelecteurVue } from './temps/SelecteurVue'
import { JourFenetre } from './temps/JourFenetre'
import { useMediaQuery } from '../lib/useMediaQuery'
import { MultiMonth } from './temps/VuesLongues'
import { couleurMois, margeMois, moisMajoritaire, semainesFenetre, teinteMois, useMolette } from './temps/molette'
type View = VueTemps

/** Agendas qu'on peut afficher (boutons en haut de la page). Seul celui de Joffrey est relié pour l'instant. */
const AGENDAS = ['Joffrey', 'Honorine'] as const
type Agenda = (typeof AGENDAS)[number]

const OPTIONS_VUE: { value: View; label: string }[] = [
  { value: 'semaine', label: 'Semaine' },
  { value: '4sem', label: 'Mois' },
  { value: 'trimestre', label: 'Trimestre' },
  { value: 'annee', label: 'Année' },
]

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
  const [openStep, setOpenStep] = useState<Step | null>(null)
  const [jourOuvert, setJourOuvert] = useState<Date | null>(null)
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

  // Déplacer un item : on ne change que la date (l'échéance n'est plus éditée
  // dans le formulaire : plus de contrôle ni de formulaire forcé au dépôt).
  const handleMove = (kind: Kind, id: string, dayIso: string, copier = false) => {
    if (kind === 'task') {
      const t = s.tasks.find((x) => x.id === id)
      // Ctrl + glisser : copie indépendante (rien ne bouge, pas de contrôle d'échéance).
      // Une garde de travail (M1, M2, J, S1, S2, Nuit) posée dans une case jour devient la journée de travail de ce jour.
      const garde = !!t && estGardeTravail(t.title)
      if (copier && t) {
        const copie = copieDeTache(t, dayIso)
        void s.insert('tasks', garde ? { ...copie, notes: notesGarde(copie.notes) } : copie)
        return
      }
      if (t && garde && !/source:caps/.test(t.notes ?? '')) {
        void s.update('tasks', id, { scheduled_date: dayIso, notes: notesGarde(t.notes) })
        return
      }
      // Évènement sur plusieurs jours : toute la plage se décale (sinon il se réduisait à un jour, voire disparaissait).
      if (t?.scheduled_date && t.end_date) {
        const decalage = differenceInCalendarDays(parseISO(dayIso), parseISO(t.scheduled_date))
        void s.update('tasks', id, { scheduled_date: dayIso, end_date: iso(addDays(parseISO(t.end_date), decalage)) })
        return
      }
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

  const closeTask = () => { setEditing(null); setCreateDate(null) }
  const common = lecture
    ? { onEdit: () => {}, onCreate: () => {}, onStep: () => {}, onMove: () => {} }
    : { onEdit: setEditing, onCreate: setCreateDate, onStep: setOpenStep, onMove: handleMove }
  const timeQuote = timeQuoteOfDay()
  // Calendrier : deux pastilles, seulement les initiales (police de l'écran de connexion).
  const choixAgenda = (
    <div role="radiogroup" aria-label="Agenda" className="flex shrink-0 items-center gap-1">
      {AGENDAS.map((a) => {
        const actif = a === agenda
        return (
          <button key={a} type="button" role="radio" aria-checked={actif} aria-label={`Agenda ${a === 'Joffrey' ? 'de Joffrey' : 'd’Honorine'}`} title={a} onClick={() => setAgenda(a)}
            className={`flex h-[26px] w-[26px] items-baseline justify-center rounded-full border pt-0.5 font-['Champignon',cursive] text-[22px] leading-none transition-colors ${
              actif ? 'border-sun-soft/70 bg-white/10 text-sun-soft' : 'border-line text-sun-soft/60 hover:border-line-2 hover:text-sun-soft'}`}>
            <span aria-hidden>{a[0]}</span>
          </button>
        )
      })}
    </div>
  )
  const allerA = (d: Date) => { setFocus(null); setFenetre(null); setAnchor(d) }
  const navigation = <NavPeriode compact vue={view} anchor={anchor} onShift={shift} onGoto={allerA} />
  const choixVue = <SelecteurVue compact value={view} onChange={changerVue} options={OPTIONS_VUE} />

  return (
    <div className={`rise flex md:h-[calc(100dvh-1.75rem)] flex-col gap-2 pt-2 max-md:h-[calc(100dvh-8.5rem)] max-md:gap-1 max-md:pt-0.5 ${lecture ? 'temps-lecture' : ''}`}>
      {/* Une seule ligne fine : titre, agenda, citation (petite), période, vue.
          Téléphone : deux lignes serrées (agenda + vue, puis la période). */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 max-md:gap-x-1.5 md:flex-nowrap max-md:hidden">
        <h1 className="shrink-0 text-lg font-semibold leading-none">Agenda</h1>
        {/* Quel agenda afficher : celui de Joffrey (partagé avec Honorine) ou celui d'Honorine. */}
        <Seg value={agenda} onChange={setAgenda} compact options={AGENDAS.map((a) => ({ value: a, label: a }))} />
        <p className="min-w-0 flex-1 truncate text-[11px] italic leading-tight text-ink-3"
          title={`« ${timeQuote.text} »${timeQuote.source ? ` — ${timeQuote.source}` : ''}`}>
          « {timeQuote.text} »{timeQuote.source && <span className="not-italic"> — {timeQuote.source}</span>}
        </p>
        <NavPeriode vue={view} anchor={anchor} onShift={shift} onGoto={allerA} />
        <SelecteurVue value={view} onChange={changerVue} options={OPTIONS_VUE} />
      </header>
      {/* Téléphone : ligne unique (calendrier, période, type de période) sous la barre du haut (accueil, caddie, « + »). */}
      {telephone && (
        <div className="flex shrink-0 items-center justify-between gap-1">{choixAgenda}{navigation}{choixVue}</div>
      )}

      {/* Évènements d'agenda externe en attente de tri : rien n'entre sans accord. */}
      {!lecture && agendaRelie && <div className="shrink-0"><AgendaPropositions /></div>}

      <MassPickCtx.Provider value={lecture ? () => {} : (date, label) => setMassPick({ date, label })}>
          {/* Chaque vue remplit la hauteur de l'écran ; elle ne défile qu'en dernier
              recours (trop d'évènements pour tenir), jamais pour cacher quelque chose. */}
          <div ref={calRef} className={`min-h-0 flex-1 ${view === '4sem' ? '-mx-4 lg:-mx-8' : ''} ${view === 'semaine' || moisTel ? 'overflow-hidden max-md:overflow-y-auto' : 'overflow-y-auto'}`}>
            {!agendaRelie && (
              <EmptyState hint="Pour l’instant, c’est l’agenda de Joffrey qui est partagé.">
                L’agenda d’Honorine n’est pas encore relié.
              </EmptyState>
            )}
            {agendaRelie && <>
            {view === '4sem' && !moisTel && <FourWeeks anchor={anchor} focus={focus} fenetre={fenetre} onOpenDay={setJourOuvert} {...common} />}
            {moisTel && <MoisTelephone anchor={anchor} fenetre={fenetre} onShift={pas} onOpenDay={setJourOuvert} {...common} />}
            {/* Semaine : briques empilées par jour, hauteur selon la durée. */}
            {view === 'semaine' && (
              <div className="flex h-full min-h-[340px] md:min-h-0">
                <SemaineBriques anchor={anchor} onOpenDay={setJourOuvert} {...common} />
              </div>
            )}
            {view === 'trimestre' && <MultiMonth anchor={anchor} months={3} {...common} />}
            {view === 'annee' && <MultiMonth anchor={anchor} months={12} yearMode {...common} />}
            </>}
          </div>
          {/* Bloc-notes en bas de TOUTES les vues (même contenu partout), hors de la
              zone qui défile. Le « mois de poche » du téléphone, qui tient sur un
              écran, n'en a pas. */}
          {!lecture && agendaRelie && <NotesSemaine lignes={telephone ? 3 : 4} />}
      </MassPickCtx.Provider>

      {jourOuvert && (
        <JourFenetre day={jourOuvert} onDay={setJourOuvert} onClose={() => setJourOuvert(null)} lecture={lecture}
          onEdit={common.onEdit} onCreate={common.onCreate} onStep={(st) => { setJourOuvert(null); common.onStep(st) }} />
      )}

      {massPick && <MassPicker pick={massPick} onClose={() => setMassPick(null)} />}

      <TaskForm open={!lecture && (editing !== null || createDate !== null)} task={editing}
        defaultDate={createDate ?? undefined}
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

function FourWeeks({ anchor, focus, fenetre, onOpenDay, onEdit, onCreate, onStep, onMove }: {
  anchor: Date; focus?: Date | null; fenetre?: Date | null; onOpenDay: (d: Date) => void
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

  const marge = margeMois(weeks)

  return (
    <>
      {/* Les lignes ont la même hauteur, sauf celle dont le contenu en demande plus :
          elle prend ce qu'il lui faut, les autres se partagent le reste. Tous les
          évènements restent visibles (le défilement n'est qu'un dernier recours). */}
      <div className="grid h-full border-l border-t border-line-2/50" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(min-content, 1fr))` }}>
        {weeks.map((days, i) => {
          // Marge droite : une bande teintée par mois sur ses semaines, son nom
          // écrit à la verticale en tête de bande.
          const mg = marge[i]!
          return (
            <div key={i} className="grid" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr)) 18px' }}>
              {days.map((day) => (
                <DayCell key={day.toISOString()} day={day} remplir sansHoraire onOpenDay={onOpenDay} tint={teinteMois(day)}
                  onEdit={onEdit} onCreate={onCreate} onStep={onStep} onMove={onMove} />
              ))}
              <div className="relative" aria-hidden>
                <div className={`absolute inset-x-0 bottom-0 ${mg.debut ? 'top-0 rounded-t-lg' : 'top-0'} ${mg.fin ? 'rounded-b-lg' : ''}`}
                  style={{ background: teinteMois(mg.mois) }}>
                  {mg.debut && (
                    <span className="absolute left-1/2 top-2 -translate-x-1/2 whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.18em] [writing-mode:vertical-rl]"
                      style={{ color: couleurMois(mg.mois) }}>{mg.nom}</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
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
