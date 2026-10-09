import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { addMonths, eachDayOfInterval, endOfWeek, format, isToday, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Layers, Church, AlertTriangle } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { extractHourMinute, iso, tasksForDay, spanPart, isMarketParkingDay, feastOnDay, extractEmojis, firstFridayOrSaturday, chosenMassForDay, todayIso } from '../../lib/logic'
import { Card } from '../../components/ui'
import { couleurProjet } from '../../lib/projectIcons'
import { IconeProjet } from '../../components/IconeProjet'
import type { Step, Task } from '../../lib/types'
import { MassPickCtx, stepsForDay, dragData, readDrag, survol, veutCopier, remplaProposeOn, type MoveFn } from './partage'
import { RemplaChip } from './DayCell'

// ---- Vue Semaine : grille horaire verticale -------------------------------

const HOUR_START = 6
const HOUR_END = 22
// Créneaux d'une heure affichés (6 h → 23 h). La grille épouse la hauteur
// disponible : les positions sont en POURCENTAGE de la colonne, pas en pixels,
// pour que chaque journée tienne entièrement à l'écran, sans défiler.
const SLOTS = HOUR_END - HOUR_START + 1
const pct = (hour: number) => ((hour - HOUR_START) / SLOTS) * 100

export function WeekHours({ anchor, onEdit, onCreate, onStep, onMove }: {
  anchor: Date; onEdit: (t: Task) => void; onCreate: (d: string) => void; onStep: (st: Step) => void; onMove: MoveFn
}) {
  const s = useHorizon()
  const days = useMemo(() => {
    const start = startOfWeek(anchor, { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end: endOfWeek(start, { weekStartsOn: 1 }) })
  }, [anchor])
  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i)

  // Téléphone : 3 jours à la fois. Les 7 colonnes restent dans la grille, plus
  // larges que l'écran (un tiers de la place chacune) ; on les fait défiler en
  // « aimantant » sur le début d'un jour, la colonne des heures restant collée à gauche.
  const etroit = useMediaQuery('(max-width: 767px)')
  const defilRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = defilRef.current
    if (!etroit || !el) return
    // Ouvre sur aujourd'hui (ou lundi hors de la semaine en cours), sans dépasser la fin.
    const i = Math.max(0, days.findIndex((d) => isToday(d)))
    const colW = (el.clientWidth - 44) / 3
    el.scrollLeft = Math.min(i, 4) * colW
  }, [etroit, days])
  const ancre = 'snap-start scroll-ml-[44px]'
  const colHeures = 'sticky left-0 z-10 bg-panel'

  return (
    <Card className="flex min-h-0 min-w-0 flex-1 flex-col !border-line-2/60 !bg-transparent !p-2">
      <div ref={defilRef}
        className="flex min-h-0 flex-1 flex-col max-md:snap-x max-md:snap-mandatory max-md:overflow-x-auto max-md:[container-type:inline-size] max-md:[scrollbar-width:none]">
        <div className="grid min-h-0 flex-1"
          style={{
            gridTemplateColumns: `44px repeat(7, 1fr)`, gridTemplateRows: 'auto auto minmax(0, 1fr)',
            ...(etroit ? { width: 'calc(44px + (100cqw - 44px) * 7 / 3)' } : {}),
          }}>
          <div className={colHeures} />
          {days.map((day) => (
            <div key={day.toISOString()} className={`${ancre} px-1 pb-1 text-center text-xs font-medium ${
              remplaProposeOn(s.celesteProposals, iso(day)) ? 'rounded border border-dashed border-[#ef4444]/80 text-[#ff6b6b]'
                : isToday(day) ? 'text-sun-soft' : 'text-ink-3'}`}>
              {format(day, 'EEE d', { locale: fr })}
            </div>
          ))}

          <div className={`${colHeures} pr-1 text-right text-[9px] uppercase tracking-wider text-ink-3`}>jour</div>
          {days.map((day) => (
            <AllDayBand key={day.toISOString()} day={day} onEdit={onEdit} onStep={onStep} onMove={onMove} onCreate={onCreate} />
          ))}

          <div className={`relative ${colHeures}`}>
            {hours.map((h) => (
              <div key={h} className="absolute right-1 text-[10px] leading-none text-ink-3" style={{ top: `calc(${pct(h)}% - 4px)` }}>
                {h}h
              </div>
            ))}
          </div>
          {days.map((day) => (
            <HourColumn key={day.toISOString()} day={day} onEdit={onEdit} onCreate={onCreate} onMove={onMove} />
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
  const openMassPicker = useContext(MassPickCtx)
  const [over, setOver] = useState(false)
  const steps = stepsForDay(s.steps, day)
  const feast = s.settings?.catholic_feasts !== false ? feastOnDay(day) : null
  const rawMass = firstFridayOrSaturday(day)
  const massLabel = rawMass && iso(day) >= todayIso() && day <= addMonths(new Date(), 6) ? rawMass : null
  const chosenMass = massLabel ? chosenMassForDay(s.checks, iso(day)) : null
  const feastMass = feast ? chosenMassForDay(s.checks, iso(day)) : null
  const untimed = [...tasksForDay(s.tasks, day)].filter((t) => !extractHourMinute(t.title))
  // Évènements multi-jours d'abord : leurs barres fines s'alignent d'un jour à l'autre (continuité).
  const spanEvents = untimed.filter((t) => spanPart(t, iso(day)) !== 'single')
  const singleEvents = untimed.filter((t) => spanPart(t, iso(day)) === 'single')
  const rempla = remplaProposeOn(s.celesteProposals, iso(day))
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setOver(false)
    const d = readDrag(e); if (d) onMove(d.kind, d.id, iso(day), veutCopier(e))
  }

  const renderUntimed = (t: Task) => {
    const part = spanPart(t, iso(day))
    const projet = t.project_id ? s.projects.find((p) => p.id === t.project_id) : undefined
    const c = couleurProjet(projet, s.domains) ?? s.domains.find((d) => d.id === (t.domain_id ?? projet?.domain_id))?.color
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
        style={{ background: c ? `${c}2b` : undefined, border: projet && c ? `1.5px solid ${c}` : undefined }}
        className="block w-full truncate rounded bg-panel-3 px-1 py-0.5 text-left text-[10px] text-ink-2">
        {projet && <IconeProjet project={projet} size={10} className="mr-1 align-[-1px]" />}{t.title}
      </button>
    )
  }

  return (
    <div onDragOver={(e) => { survol(e); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}
      onClick={(e) => { if (e.target === e.currentTarget) onCreate(iso(day)) }}
      className={`min-h-8 space-y-0.5 border-b border-line-2/60 p-0.5 ${over ? 'bg-sun/10' : ''} ${isToday(day) ? 'bg-sun/5' : ''}`}>
      {rempla && <RemplaChip p={rempla} />}
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

/** Évènements à heure fixe d'une journée, répartis en colonnes quand ils se
 *  chevauchent : aucun n'en cache un autre. Un évènement court occupe au moins
 *  45 min dans le calcul (sa hauteur minimale à l'écran dépasse sa durée réelle). */
function placerSimultanes<T extends { t: Task; hm: { hour: number; minute: number } }>(items: T[]): (T & { col: number; cols: number })[] {
  const tries = items
    .map((it) => {
      const debut = it.hm.hour + it.hm.minute / 60
      return { it, debut, fin: debut + Math.max(it.t.duration_min ?? 30, 45) / 60 }
    })
    .sort((a, b) => a.debut - b.debut || b.fin - a.fin)
  const out: (T & { col: number; cols: number })[] = []
  let groupe: (T & { col: number; cols: number })[] = []
  let finGroupe = -1
  let finsColonnes: number[] = []
  const clore = () => {
    const n = Math.max(...groupe.map((g) => g.col)) + 1
    for (const g of groupe) g.cols = n
    out.push(...groupe)
    groupe = []
    finsColonnes = []
  }
  for (const { it, debut, fin } of tries) {
    if (groupe.length && debut >= finGroupe) clore()
    let col = finsColonnes.findIndex((f) => f <= debut)
    if (col < 0) { col = finsColonnes.length; finsColonnes.push(0) }
    finsColonnes[col] = fin
    finGroupe = Math.max(finGroupe, fin)
    groupe.push({ ...it, col, cols: 1 })
  }
  if (groupe.length) clore()
  return out
}

function HourColumn({ day, onEdit, onCreate, onMove }: {
  day: Date
  onEdit: (t: Task) => void; onCreate: (d: string) => void; onMove: MoveFn
}) {
  const s = useHorizon()
  const [over, setOver] = useState(false)
  const timed = placerSimultanes([...tasksForDay(s.tasks, day)]
    .map((t) => ({ t, hm: extractHourMinute(t.title) }))
    .filter((x): x is { t: Task; hm: { hour: number; minute: number } } => x.hm !== null))

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setOver(false)
    const d = readDrag(e); if (d) onMove(d.kind, d.id, iso(day), veutCopier(e))
  }

  return (
    <div onDragOver={(e) => { survol(e); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}
      className={`relative overflow-hidden border-l border-line-2/40 ${isToday(day) ? 'bg-sun/5' : ''} ${over ? 'bg-sun/10' : ''}`}
      onClick={() => onCreate(iso(day))}>
      {timed.map(({ t, hm, col, cols }) => {
        // Le bloc reste dans la grille (6 h → 23 h) : une garde de nuit qui se
        // prolonge après 23 h est coupée à 23 h, au lieu de déborder sur les notes.
        const debut = hm.hour + hm.minute / 60
        const fin = debut + (t.duration_min ?? 30) / 60
        const debutVu = Math.min(Math.max(debut, HOUR_START), HOUR_END + 1 - 0.25)
        const finVu = Math.min(fin, HOUR_END + 1)
        const top = pct(debutVu)
        const height = Math.max(0, pct(finVu) - top)
        // Simultanés : côte à côte, chacun sur sa part de la largeur.
        const cote = { left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)` }
        const done = !t.is_recurring && t.status === 'fait'
        const checkMass = t.notes?.startsWith('source:check') ?? false
        const project = t.project_id ? s.projects.find((p) => p.id === t.project_id) : undefined
        const domain = s.domains.find((d) => d.id === (t.domain_id ?? project?.domain_id))
        const couleur = couleurProjet(project, s.domains) ?? domain?.color
        return (
          <button key={t.id} draggable={!t.is_recurring} onDragStart={dragData('task', t.id)}
            onClick={(e) => { e.stopPropagation(); onEdit(t) }}
            title={t.title}
            className={`absolute overflow-hidden rounded-md px-1 py-0.5 text-left ${
              checkMass ? 'bg-[#a78bfa]/15' : 'bg-panel-2'}`}
            style={checkMass
              ? { ...cote, top: `${top}%`, height: `${height}%`, minHeight: 16, outline: '1.5px dashed #a78bfa', outlineOffset: '-1px' }
              : { ...cote, top: `${top}%`, height: `${height}%`, minHeight: 16, border: `1.5px solid ${project && couleur ? couleur : 'rgba(245,158,11,0.3)'}` }}>
            <span className={`block truncate text-[10px] leading-tight ${done ? 'text-ink-3 line-through' : 'text-ink'}`}>
              {project && <IconeProjet project={project} size={10} className="mr-1 align-[-1px]" />}
              {checkMass && <Church size={9} className="mr-0.5 inline text-[#a78bfa]" />}{t.title}
            </span>
          </button>
        )
      })}
    </div>
  )
}
