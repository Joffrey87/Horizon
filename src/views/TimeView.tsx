import { createContext, useContext, useMemo, useState } from 'react'
import {
  addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, getDate, getDaysInMonth,
  getISODay, isSameMonth, isToday, parseISO, startOfMonth, startOfWeek,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, CheckCircle2, Circle, RotateCw, Layers, Star, Target, Church, AlertTriangle, ExternalLink, Check, X } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { compareTasksByTitleTime, extractHourMinute, iso, tasksForDay, recurrenceLabel, timeQuoteOfDay, spanPart, birthdaysForDay, isMarketParkingDay, feastOnDay, extractEmojis, firstFridayOrSaturday, chosenMassForDay, todayIso, massesInfoUrl, tripLocationOn, citySlug, hasMaintainedMasses, workShiftOn, massFitsShift, fmtMinutes } from '../lib/logic'
import { Card, Seg, Modal, ProjectTag } from '../components/ui'
import { TaskForm } from '../components/TaskForm'
import { AgendaPropositions } from '../components/AgendaPropositions'
import type { MassConfig, MassSlot, Objective, Step, Task } from '../lib/types'

type View = '4sem' | 'semaine' | 'trimestre' | 'annee'
type Kind = 'task' | 'step' | 'objective'

// Couleur de repli pour un évènement multi-jours sans domaine (ex. vacances) : un teal « détente ».
const EVENT_DEFAULT_COLOR = '#46b3a9'

// ---- Couches du calendrier (affichables/masquables), mémorisées par appareil ----
type CalLayers = { taches: boolean; fetes: boolean; messes: boolean; anniversaires: boolean; aril: boolean }
const DEFAULT_LAYERS: CalLayers = { taches: true, fetes: true, messes: true, anniversaires: true, aril: true }
const LAYER_DEFS: { key: keyof CalLayers; label: string }[] = [
  { key: 'taches', label: 'Tâches' },
  { key: 'fetes', label: 'Fêtes' },
  { key: 'messes', label: 'Messes' },
  { key: 'anniversaires', label: 'Anniversaires' },
  { key: 'aril', label: 'ARIL' },
]
const LAYERS_KEY = 'horizon.temps.layers'
function loadLayers(): CalLayers {
  try { return { ...DEFAULT_LAYERS, ...(JSON.parse(localStorage.getItem(LAYERS_KEY) ?? '{}') as Partial<CalLayers>) } }
  catch { return DEFAULT_LAYERS }
}
const LayersCtx = createContext<{ layers: CalLayers; arilId: string | null }>({ layers: DEFAULT_LAYERS, arilId: null })
// Ouvre le sélecteur de messe : jours de dévotion (1er vendredi/samedi) et grandes fêtes.
const MassPickCtx = createContext<(dayIso: string, label: string) => void>(() => {})

/** Couches actives + prédicats de visibilité (un élément « ARIL » = rattaché au domaine « ARIL »). */
function useLayerFilter() {
  const s = useHorizon()
  const { layers, arilId } = useContext(LayersCtx)
  const domainVisible = (domainId: string | null) =>
    arilId != null && domainId === arilId ? layers.aril : layers.taches
  const taskVisible = (t: Task) =>
    domainVisible(t.domain_id ?? s.projects.find((p) => p.id === t.project_id)?.domain_id ?? null)
  const stepVisible = (st: Step) =>
    domainVisible(s.projects.find((p) => p.id === st.project_id)?.domain_id ?? null)
  return { layers, taskVisible, stepVisible, domainVisible }
}

export function TimeView() {
  const s = useHorizon()
  const [view, setView] = useState<View>('4sem')
  const [anchor, setAnchor] = useState(new Date())
  const [editing, setEditing] = useState<Task | null>(null)
  const [createDate, setCreateDate] = useState<string | null>(null)
  const [overrideScheduled, setOverrideScheduled] = useState<string | undefined>(undefined)
  const [openStep, setOpenStep] = useState<Step | null>(null)
  const [massPick, setMassPick] = useState<{ date: string; label: string } | null>(null)
  const [layers, setLayers] = useState<CalLayers>(loadLayers)
  const arilId = useMemo(() => s.domains.find((d) => /aril/i.test(d.name))?.id ?? null, [s.domains])
  const toggleLayer = (k: keyof CalLayers) => setLayers((prev) => {
    const next = { ...prev, [k]: !prev[k] }
    try { localStorage.setItem(LAYERS_KEY, JSON.stringify(next)) } catch { /* stockage indispo */ }
    return next
  })

  const shift = (dir: 1 | -1) => {
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

      {/* ---- Calendriers (couches) affichables/masquables ---- */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-[11px] uppercase tracking-wide text-ink-3">Calendriers</span>
        {LAYER_DEFS.map(({ key, label }) => (
          <button key={key} onClick={() => toggleLayer(key)}
            title={key === 'aril' && !arilId ? 'Crée un domaine nommé « ARIL » pour alimenter ce calendrier' : undefined}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              layers[key] ? 'border-sun/50 bg-sun/10 text-sun-soft' : 'border-line-2 text-ink-3 hover:text-ink-2'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Évènements d'agenda externe en attente de tri : rien n'entre sans accord. */}
      <div className="shrink-0"><AgendaPropositions /></div>

      <LayersCtx.Provider value={{ layers, arilId }}>
        <MassPickCtx.Provider value={(date, label) => setMassPick({ date, label })}>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
            {view === '4sem' && <FourWeeks anchor={anchor} {...common} />}
            {view === 'semaine' && <WeekHours anchor={anchor} {...common} />}
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

// ---- Sélecteur de messe (jours de dévotion, grandes fêtes, case du jour) ---

/** Rend le sélecteur de messe utilisable hors de « Temps » (accueil).
 *  Enveloppe des `DayCell` : leurs croix ✝ ouvrent alors le même modal. */
export function MassPickProvider({ children }: { children: React.ReactNode }) {
  const [pick, setPick] = useState<{ date: string; label: string } | null>(null)
  return (
    <MassPickCtx.Provider value={(date, label) => setPick({ date, label })}>
      {children}
      {pick && <MassPicker pick={pick} onClose={() => setPick(null)} />}
    </MassPickCtx.Provider>
  )
}


function MassPicker({ pick, onClose }: { pick: { date: string; label: string }; onClose: () => void }) {
  const s = useHorizon()
  const check = s.checks.find((c) => c.kind === 'messe_travail')
  const cfg = (check?.config ?? {}) as MassConfig
  const chosen = cfg.chosen ?? {}
  const homeCity = s.settings?.home_city?.trim() || 'Reims'
  // Même logique que Vérifications : la ville du jour (séjour éventuel), sa liste
  // horaire si on en maintient une, et la garde CAPS pour signaler les créneaux impossibles.
  const city = tripLocationOn(s.tasks, pick.date) ?? homeCity
  const wd = String(getISODay(parseISO(pick.date)))
  const cityMasses = cfg.massesByCity?.[citySlug(city)] ?? (hasMaintainedMasses(city) ? cfg.masses : undefined)
  const masses: MassSlot[] = cityMasses?.[wd] ?? []
  const shift = workShiftOn(s.tasks, pick.date)
  const current = chosen[pick.date]
  const tag = check ? `source:check:${check.id}` : ''

  // Pose l'évènement calendaire pour ce jour (en remplaçant l'ancien s'il existe).
  const setEvent = async (title: string) => {
    const prev = s.tasks.find((t) => t.notes === tag && t.scheduled_date === pick.date)
    if (prev) await s.remove('tasks', prev.id)
    if (title) await s.insert('tasks', {
      title, is_task: false, scheduled_date: pick.date,
      domain_id: check?.domain_id ?? null, duration_min: 60, notes: tag, status: 'a_faire',
    })
  }
  const choose = async (m: MassSlot) => {
    if (!check) return
    await setEvent(`Messe ${m.t.replace(':', 'h')} — ${m.c}`)
    await s.update('checks', check.id, { config: { ...cfg, chosen: { ...chosen, [pick.date]: `${m.t} ${m.c}` } } })
    onClose()
  }
  // Ville sans liste horaire (séjour) : on note « j'y vais », l'horaire se choisit sur messes.info.
  const chooseAway = async () => {
    if (!check) return
    await setEvent(`Messe — ${city}`)
    await s.update('checks', check.id, { config: { ...cfg, chosen: { ...chosen, [pick.date]: `Messe à ${city}` } } })
    onClose()
  }
  const clear = async () => {
    if (!check) return
    await setEvent('')
    const next = { ...chosen }; delete next[pick.date]
    await s.update('checks', check.id, { config: { ...cfg, chosen: next } })
    onClose()
  }

  const dayLabel = format(parseISO(pick.date), 'EEEE d MMMM', { locale: fr })

  return (
    <Modal open onClose={onClose} title={pick.label ? `Messe — ${pick.label}` : 'Messe'}>
      <p className="mb-1 text-sm capitalize text-ink-2">{dayLabel}</p>
      {!check ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-3">
            Configure une vérification « messe » (onglet Vérifications) pour mémoriser tes choix de messe.
            En attendant, voici où chercher un horaire :
          </p>
          <a href={massesInfoUrl(city)} target="_blank" rel="noopener noreferrer"
            className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
            <ExternalLink size={13} /> Voir les messes sur messes.info ({city})
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          {current && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-good/40 bg-good/10 px-3 py-2">
              <span className="text-sm text-ink">Choisie : {current}</span>
              <button onClick={() => void clear()} className="btn-ghost flex items-center gap-1 px-2 py-1 text-xs" title="Retirer le choix">
                <X size={13} /> Retirer
              </button>
            </div>
          )}
          {(city !== homeCity || shift) && (
            <p className="text-xs text-ink-3">
              {city !== homeCity && <>En séjour à <span className="font-medium text-[#a78bfa]">{city}</span>. </>}
              {shift && <>Tu travailles ce jour-là ({shift.code || `${fmtMinutes(shift.start)}–${fmtMinutes(shift.end)}`}).</>}
            </p>
          )}
          {masses.length > 0 ? (
            <ul className="space-y-1">
              {masses.map((m) => {
                const val = `${m.t} ${m.c}`
                const active = current === val
                const clash = shift ? !massFitsShift(m.t, shift) : false
                return (
                  <li key={val}>
                    <button onClick={() => void choose(m)}
                      title={clash ? 'Horaire incompatible avec ta garde ce jour-là' : undefined}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-sm transition-colors ${
                        active ? 'border-good/60 bg-good/10' : 'border-line hover:bg-panel-2'
                      } ${clash && !active ? 'opacity-50' : ''}`}>
                      <span className="w-14 shrink-0 tabular-nums text-ink-2">{m.t}</span>
                      <span className="min-w-0 flex-1 truncate text-ink">{m.c}</span>
                      {clash && !active && <span className="shrink-0 text-[10px] text-ink-3">pendant la garde</span>}
                      {active && <Check size={14} className="text-good" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">
              {city === homeCity
                ? 'Aucun horaire connu pour ce jour dans ta liste. Utilise le lien ci-dessous.'
                : `Pas de liste horaire pour ${city} : cherche l'horaire sur messes.info, puis note que tu y vas.`}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <a href={massesInfoUrl(city)} target="_blank" rel="noopener noreferrer"
              className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
              <ExternalLink size={13} /> Voir les messes sur messes.info ({city})
            </a>
            {masses.length === 0 && current !== `Messe à ${city}` && (
              <button onClick={() => void chooseAway()} className="btn-ghost px-3 py-1.5 text-xs text-[#4cc79a]"
                title="Poser la messe au calendrier (sans horaire)">
                J'y vais
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

// ---- Cellule d'un jour (partagée par 4 semaines) --------------------------

export function DayCell({ day, tint, emphasize, fit, massCross, onEdit, onCreate, onStep, onMove }: {
  day: Date; tint?: string; emphasize?: boolean; fit?: boolean
  /** Affiche toujours la croix « trouver une messe » (accueil), même hors fête. */
  massCross?: boolean
  onEdit: (t: Task) => void; onCreate: (d: string) => void; onStep: (st: Step) => void; onMove: MoveFn
}) {
  const s = useHorizon()
  const { layers, taskVisible, stepVisible } = useLayerFilter()
  const openMassPicker = useContext(MassPickCtx)
  const [over, setOver] = useState(false)
  const today = isToday(day)
  const dayIso = iso(day)
  const all = [...tasksForDay(s.tasks, day)].filter(taskVisible).sort(compareTasksByTitleTime)
  // Évènements multi-jours (vacances…) : bandes continues épinglées en haut ; le reste dans le flux.
  const spans = all.filter((t) => spanPart(t, dayIso) !== 'single')
  const list = all.filter((t) => spanPart(t, dayIso) === 'single')
  const steps = stepsForDay(s.steps, day).filter(stepVisible)
  const birthdays = layers.anniversaires ? birthdaysForDay(s.birthdays, day) : []
  const feast = layers.fetes && s.settings?.catholic_feasts !== false ? feastOnDay(day) : null
  // Messe de dévotion (1er vendredi/samedi) sur les 6 prochains mois — choisie ou non.
  const rawMass = layers.messes ? firstFridayOrSaturday(day) : null
  const massLabel = rawMass && dayIso >= todayIso() && day <= addMonths(new Date(), 6) ? rawMass : null
  const chosenMass = massLabel ? chosenMassForDay(s.checks, dayIso) : null
  // Croix ✝ « trouver une messe » : sur chaque jour, sauf ceux qui portent déjà le
  // bouton de dévotion (1er vendredi/samedi) — il ouvre déjà le même sélecteur.
  const showCross = feast !== null || massCross === true || (layers.messes && !massLabel)
  const crossMass = showCross ? chosenMassForDay(s.checks, dayIso) : null

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
      className={`flex min-h-28 cursor-pointer flex-col rounded-lg border p-1.5 transition-colors ${fit ? 'w-max max-w-full' : ''} ${
        today ? 'border-sun/50 bg-sun/5' : over ? 'border-sun/70 bg-sun/10' : 'border-line-2/60 hover:bg-panel-2/40'
      }`}>
      <header className="mb-1 flex items-center justify-between gap-1" onClick={(e) => e.stopPropagation()}>
        <p className={`text-xs font-medium capitalize ${today ? 'text-sun-soft' : emphasize ? 'text-white/85' : 'text-ink-3'}`}>
          {format(day, 'EEE d', { locale: fr })}
        </p>
        <div className="flex items-center gap-1">
          {showCross && (
            <button onClick={(e) => { e.stopPropagation(); openMassPicker(dayIso, feast ?? '') }}
              title={feast
                ? `${feast} — trouver une messe${crossMass ? ` : ${crossMass}` : ''}`
                : `Trouver une messe${crossMass ? ` : ${crossMass}` : ''}`}
              className={`text-xs font-semibold leading-none transition-opacity hover:opacity-70 ${
                crossMass ? 'text-[#4cc79a]' : feast ? 'text-sun-soft' : emphasize ? 'text-white/60' : 'text-ink-3/70'
              }`}>✝</button>
          )}
          {massLabel && (
            <button onClick={(e) => { e.stopPropagation(); openMassPicker(dayIso, massLabel) }}
              title={`Messe — ${massLabel}${chosenMass ? ` : ${chosenMass}` : ' (cliquer pour choisir)'}`}
              className={`leading-none transition-opacity hover:opacity-70 ${chosenMass ? 'text-[#4cc79a]' : 'text-[#a78bfa]'}`}>
              <Church size={11} />
            </button>
          )}
          {birthdays.length > 0 && (
            <span title={`Anniversaire${birthdays.length > 1 ? 's' : ''} : ${birthdays.map((b) => b.name).join(', ')}`}
              className="cursor-default text-xs leading-none">🎂</span>
          )}
          <button onClick={() => onCreate(iso(day))} className="text-ink-3 transition-colors hover:text-sun" aria-label="Ajouter une tâche">
            <Plus size={13} />
          </button>
        </div>
      </header>
      {massLabel && !chosenMass && (
        <button onClick={(e) => { e.stopPropagation(); openMassPicker(dayIso, massLabel) }} title="Choisir la messe"
          className="mb-1 flex w-full items-center gap-1 rounded bg-[#a78bfa]/12 px-1 py-0.5 text-[10px] font-medium text-[#a78bfa] hover:bg-[#a78bfa]/20">
          <Church size={9} className="shrink-0" /><span className="truncate">Messe · {massLabel}</span>
        </button>
      )}
      {spans.length > 0 && (
        <div className="mb-1 space-y-0.5" onClick={(e) => e.stopPropagation()}>
          {spans.map((t) => {
            const domain = s.domains.find((d) => d.id === (t.domain_id ?? s.projects.find((p) => p.id === t.project_id)?.domain_id))
            const fill = domain?.color ?? EVENT_DEFAULT_COLOR
            const part = spanPart(t, dayIso)
            const weekStart = getISODay(day) === 1
            const weekEnd = getISODay(day) === 7
            // Bord « ouvert » = la bande se prolonge vers le jour voisin (même semaine) : pas d'arrondi, on déborde dans la gouttière.
            const openLeft = !weekStart && (part === 'middle' || part === 'end')
            const openRight = !weekEnd && (part === 'start' || part === 'middle')
            const cap = part === 'start' || part === 'end' // 1er / dernier jour → capuchon plein ; sinon simple connecteur fin
            const vacation = / - Vf?$/.test(t.title)
            const emojis = extractEmojis(t.title) // « signature » répliquée sur chaque jour du span
            const rad = { // arrondi seulement du côté fermé (le côté ouvert file dans la gouttière)
              borderTopLeftRadius: openLeft ? 0 : 5, borderBottomLeftRadius: openLeft ? 0 : 5,
              borderTopRightRadius: openRight ? 0 : 5, borderBottomRightRadius: openRight ? 0 : 5,
            }
            // Côté « ouvert » d'un capuchon : on le taille en courbe concave (h-5 → 7 px) pour une descente douce
            // et arrondie vers le connecteur — polygone multi-points qui approxime un bézier.
            const taperR = part === 'start' && openRight
            const taperL = part === 'end' && openLeft
            const clipPath = taperR
              ? 'polygon(0 0, calc(100% - 18px) 0, calc(100% - 7px) 1.5px, calc(100% - 2.5px) 3.6px, 100% 6.5px, 100% 13.5px, calc(100% - 2.5px) 16.4px, calc(100% - 7px) 18.5px, calc(100% - 18px) 100%, 0 100%)'
              : taperL
                ? 'polygon(18px 0, 100% 0, 100% 100%, 18px 100%, 7px 18.5px, 2.5px 16.4px, 0 13.5px, 0 6.5px, 2.5px 3.6px, 7px 1.5px)'
                : undefined
            const drag = { draggable: !t.is_recurring, onDragStart: dragData('task', t.id) }
            const edit = (e: React.MouseEvent) => { e.stopPropagation(); onEdit(t) }
            // Fond du capuchon : dégradé d'opacité qui fond vers le connecteur du côté biseauté (sinon plein).
            const capBg = taperR ? `linear-gradient(to right, ${fill}c2 0%, ${fill}c2 55%, ${fill}a6 100%)`
              : taperL ? `linear-gradient(to left, ${fill}c2 0%, ${fill}c2 55%, ${fill}a6 100%)`
                : `${fill}c2`
            return (
              <div key={t.id} className="relative h-5">
                {!cap ? (
                  // Jour intermédiaire : le fin connecteur traverse la cellule et déborde à DROITE dans la gouttière.
                  <button {...drag} onClick={edit} title={t.title}
                    className="absolute top-1/2 block -translate-y-1/2"
                    style={{ left: 0, right: openRight ? -21 : 0, height: 7, background: `${fill}a6`, ...rad }} />
                ) : part === 'start' && openRight ? (
                  // Jour de départ : uniquement le petit pont à DROITE du capuchon (jamais derrière lui).
                  <button {...drag} onClick={edit} title={t.title}
                    className="absolute top-1/2 block -translate-y-1/2"
                    style={{ left: '100%', width: 21, height: 7, background: `${fill}a6` }} />
                ) : null}
                {/* Emoji de l'évènement répliqué et centré sur les jours intermédiaires, par-dessus la barre fine. */}
                {!cap && emojis && (
                  <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-[11px] leading-none">
                    {emojis}
                  </span>
                )}
                {/* Capuchon plein pleine hauteur aux extrémités, biseauté + dégradé vers le connecteur, avec le titre.
                    (Le jour de fin n'a pas de connecteur : c'est la veille qui comble la gouttière de gauche.) */}
                {cap && (
                  <button {...drag} onClick={edit} title={t.title}
                    className="absolute inset-0 flex items-center overflow-hidden text-left"
                    style={{ background: capBg, ...rad, clipPath, paddingLeft: taperL ? 20 : 6, paddingRight: taperR ? 20 : 6 }}>
                    <span className={`truncate text-[10px] font-medium leading-none text-ink ${vacation ? 'line-through' : ''}`}>
                      {t.title}
                    </span>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
      {isMarketParkingDay(s.tasks, day) && (
        <div onClick={(e) => e.stopPropagation()}
          title="Dimanche travaillé (début < 15h) — marché dominical & stationnement compliqués"
          className="mb-1 flex items-center justify-center gap-1 rounded bg-[#ef4444]/20 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#ff6b6b] ring-1 ring-[#ef4444]/40">
          <AlertTriangle size={10} /> Marché / Parking
        </div>
      )}
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
          const project = t.project_id ? s.projects.find((p) => p.id === t.project_id) : undefined
          const domain = s.domains.find((d) => d.id === (t.domain_id ?? project?.domain_id))
          const c = domain?.color
          const isEvent = t.is_task === false
          const done = !t.is_recurring && !isEvent && t.status === 'fait'
          const vacation = / - Vf?$/.test(t.title) // garde posée en congé (V / Vf) → barrée
          const struck = done || vacation
          const checkMass = t.notes?.startsWith('source:check') ?? false // messe issue d'une vérification
          return (
            <div key={t.id} className="group flex items-start gap-1 rounded px-1 py-0.5"
              style={{
                background: checkMass ? 'rgba(167,139,250,0.14)' : c ? `${c}2b` : 'var(--color-panel-3)',
                borderLeft: !checkMass && c ? `3px solid ${c}` : undefined,
                outline: checkMass ? '1.5px dashed #a78bfa' : undefined,
                outlineOffset: checkMass ? '-1px' : undefined,
              }}
              draggable={!t.is_recurring} onDragStart={dragData('task', t.id)}
              onClick={(e) => e.stopPropagation()}>
              {!isEvent && (
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
              )}
              <button onClick={() => onEdit(t)} className={`text-left ${fit ? '' : 'min-w-0 flex-1'}`} title={t.is_recurring ? recurrenceLabel(t.recurrence_rule) : t.title}>
                <span className={`text-[11px] leading-tight ${fit ? 'whitespace-nowrap' : 'block truncate'} ${struck ? 'text-ink-3 line-through' : 'text-ink'}`}>
                  {checkMass && <Church size={9} className="mr-0.5 inline text-[#a78bfa]" />}
                  {t.notable && <Star size={9} className="mr-0.5 inline text-sun" />}{t.title}
                </span>
                {project && <span className="mt-0.5 flex"><ProjectTag name={project.title} color={c} size="xs" /></span>}
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
  // Mois en cours : la grille démarre sur la SEMAINE DU JOUR (pas de semaines déjà
  // passées) et court au moins 4 semaines, plus s'il en faut pour finir le mois.
  // Autre mois : grille complète du mois, à partir de la semaine qui contient le 1er.
  const weeks = useMemo(() => {
    const today = new Date()
    const gridStart = isSameMonth(anchor, today)
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
  }, [anchor])

  // Jours hors du mois de référence : légèrement atténués pour rester lisibles sans distraire.
  const outsideTint = 'rgba(120,120,140,0.10)'
  const first = weeks[0]?.[0] ?? anchor
  const last = weeks[weeks.length - 1]?.[6] ?? anchor
  const title = isSameMonth(first, last)
    ? format(first, 'MMMM yyyy', { locale: fr })
    : `${format(first, 'MMMM', { locale: fr })} — ${format(last, 'MMMM yyyy', { locale: fr })}`

  return (
    <>
      <p className="text-center text-sm font-medium capitalize">{title}</p>
      <div className="space-y-2">
        {weeks.map((days, i) => (
          <div key={i} className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-7">
            {days.map((day) => (
              <DayCell key={day.toISOString()} day={day}
                tint={isSameMonth(day, anchor) ? undefined : outsideTint}
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
  const { layers, taskVisible, stepVisible } = useLayerFilter()
  const openMassPicker = useContext(MassPickCtx)
  const [over, setOver] = useState(false)
  const steps = stepsForDay(s.steps, day).filter(stepVisible)
  const feast = layers.fetes && s.settings?.catholic_feasts !== false ? feastOnDay(day) : null
  const rawMass = layers.messes ? firstFridayOrSaturday(day) : null
  const massLabel = rawMass && iso(day) >= todayIso() && day <= addMonths(new Date(), 6) ? rawMass : null
  const chosenMass = massLabel ? chosenMassForDay(s.checks, iso(day)) : null
  const feastMass = feast ? chosenMassForDay(s.checks, iso(day)) : null
  const untimed = [...tasksForDay(s.tasks, day)].filter((t) => !extractHourMinute(t.title)).filter(taskVisible)
  // Évènements multi-jours d'abord : leurs barres fines s'alignent d'un jour à l'autre (continuité).
  const spanEvents = untimed.filter((t) => spanPart(t, iso(day)) !== 'single')
  const singleEvents = untimed.filter((t) => spanPart(t, iso(day)) === 'single')
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setOver(false)
    const d = readDrag(e); if (d) onMove(d.kind, d.id, iso(day))
  }

  const renderUntimed = (t: Task) => {
    const part = spanPart(t, iso(day))
    const c = s.domains.find((d) => d.id === (t.domain_id ?? s.projects.find((p) => p.id === t.project_id)?.domain_id))?.color
    // Jours intermédiaires / fin d'un évènement multi-jours : barre fine continue, sans titre — emoji centré par-dessus.
    if (part === 'middle' || part === 'end') {
      const emojis = extractEmojis(t.title)
      return (
        <div key={t.id} className={`relative flex w-full items-center ${emojis ? 'h-4' : ''}`}>
          <button draggable={!t.is_recurring} onDragStart={dragData('task', t.id)}
            onClick={() => onEdit(t)} title={t.title}
            style={{ background: c ? `${c}a6` : 'var(--color-line-2)' }}
            className="block h-1.5 w-full rounded-full" />
          {emojis && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] leading-none">{emojis}</span>
          )}
        </div>
      )
    }
    return (
      <button key={t.id} draggable={!t.is_recurring} onDragStart={dragData('task', t.id)} onClick={() => onEdit(t)}
        style={{ background: c ? `${c}2b` : undefined, borderLeft: c ? `3px solid ${c}` : undefined }}
        className="block w-full truncate rounded bg-panel-3 px-1 py-0.5 text-left text-[10px] text-ink-2">
        {t.title}
      </button>
    )
  }

  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}
      onClick={(e) => { if (e.target === e.currentTarget) onCreate(iso(day)) }}
      className={`min-h-8 space-y-0.5 border-b border-line-2/60 p-0.5 ${over ? 'bg-sun/10' : ''} ${isToday(day) ? 'bg-sun/5' : ''}`}>
      {spanEvents.map(renderUntimed)}
      {feast && (
        <button onClick={(e) => { e.stopPropagation(); openMassPicker(iso(day), feast) }}
          title={`${feast} — trouver une messe${feastMass ? ` : ${feastMass}` : ''}`}
          className={`flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] font-medium ${
            feastMass ? 'bg-good/15 text-[#4cc79a] hover:bg-good/25' : 'bg-sun/15 text-sun-soft hover:bg-sun/25'
          }`}>
          <span className="shrink-0">✝</span><span className="truncate">{feast}</span>
        </button>
      )}
      {massLabel && (
        <button onClick={(e) => { e.stopPropagation(); openMassPicker(iso(day), massLabel) }}
          title={`Messe — ${massLabel}${chosenMass ? ` : ${chosenMass}` : ' (cliquer pour choisir)'}`}
          className={`flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] font-medium ${
            chosenMass ? 'bg-good/15 text-[#4cc79a] hover:bg-good/25' : 'bg-[#a78bfa]/15 text-[#a78bfa] hover:bg-[#a78bfa]/25'
          }`}>
          <Church size={10} className="shrink-0" /><span className="truncate">{chosenMass ?? `Messe · ${massLabel}`}</span>
        </button>
      )}
      {isMarketParkingDay(s.tasks, day) && (
        <div title="Dimanche travaillé (début ≤ 15h) — marché dominical & stationnement compliqués"
          className="flex items-center justify-center gap-1 rounded bg-[#ef4444]/20 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#ff6b6b] ring-1 ring-[#ef4444]/40">
          <AlertTriangle size={10} /> Marché / Parking
        </div>
      )}
      {steps.map((st) => (
        <button key={st.id} draggable onDragStart={dragData('step', st.id)} onClick={() => onStep(st)}
          className="flex w-full items-center gap-1 truncate rounded bg-info/15 px-1 py-0.5 text-left text-[10px] text-[#6ea8ee]">
          <Layers size={10} className="shrink-0" /><span className="truncate font-medium">{st.title}</span>
        </button>
      ))}
      {singleEvents.map(renderUntimed)}
    </div>
  )
}

function HourColumn({ day, hours, onEdit, onCreate, onMove }: {
  day: Date; hours: number[]
  onEdit: (t: Task) => void; onCreate: (d: string) => void; onMove: MoveFn
}) {
  const s = useHorizon()
  const { taskVisible } = useLayerFilter()
  const [over, setOver] = useState(false)
  const timed = [...tasksForDay(s.tasks, day)].filter(taskVisible)
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
        const checkMass = t.notes?.startsWith('source:check') ?? false
        const project = t.project_id ? s.projects.find((p) => p.id === t.project_id) : undefined
        const domain = s.domains.find((d) => d.id === (t.domain_id ?? project?.domain_id))
        return (
          <button key={t.id} draggable={!t.is_recurring} onDragStart={dragData('task', t.id)}
            onClick={(e) => { e.stopPropagation(); onEdit(t) }}
            className={`absolute left-0.5 right-0.5 overflow-hidden rounded-md px-1 py-0.5 text-left ${
              checkMass ? 'bg-[#a78bfa]/15' : 'border border-sun/30 bg-panel-2'}`}
            style={checkMass
              ? { top, height, outline: '1.5px dashed #a78bfa', outlineOffset: '-1px' }
              : { top, height, borderLeftColor: domain?.color, borderLeftWidth: 3 }}>
            <span className={`block truncate text-[10px] leading-tight ${done ? 'text-ink-3 line-through' : 'text-ink'}`}>
              {checkMass && <Church size={9} className="mr-0.5 inline text-[#a78bfa]" />}{t.title}
            </span>
            {project && height >= 34 && <span className="mt-0.5 flex"><ProjectTag name={project.title} color={domain?.color} size="xs" /></span>}
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
  const { taskVisible, stepVisible, domainVisible } = useLayerFilter()
  const first = yearMode ? startOfMonth(new Date(anchor.getFullYear(), 0, 1)) : startOfMonth(anchor)
  const monthList = Array.from({ length: months }, (_, i) => addMonths(first, i))

  const notableTasks = s.tasks.filter((t) => t.notable && (t.scheduled_date || t.due_date)).filter(taskVisible)
  const notableSteps = s.steps.filter((st) => st.notable && (st.scheduled_date || st.due_date)).filter(stepVisible)
  const objectives = s.objectives.filter((o) => o.target_date && o.status !== 'abandonne').filter((o) => domainVisible(o.domain_id))

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
