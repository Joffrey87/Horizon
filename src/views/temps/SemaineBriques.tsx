import { useContext, useMemo, useState } from 'react'
import { addMonths, eachDayOfInterval, endOfWeek, format, isToday, parseISO, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Church, AlertTriangle, Layers, ChevronRight } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { useMediaQuery } from '../../lib/useMediaQuery'
import {
  birthdaysForDay, chosenMassForDay, extractHourMinute, feastOnDay, firstFridayOrSaturday, isMarketParkingDay,
  iso, sansHeure, spanPart, tasksForDay, todayIso,
} from '../../lib/logic'
import { hauteurBrique, libelleDuree, libelleHeures, notePropre, ordreSemaine, type ModeSemaine } from '../../lib/semaine'
import { couleurProjet } from '../../lib/projectIcons'
import { Card } from '../../components/ui'
import { IconeProjet } from '../../components/IconeProjet'
import type { Step, Task } from '../../lib/types'
import { EVENT_DEFAULT_COLOR, MassPickCtx, dragData, readDrag, remplaProposeOn, stepsForDay, survol, veutCopier, type MoveFn } from './partage'
import { RemplaChip } from './DayCell'

// ---- Vue Semaine : uniquement des briques empilées -------------------------
// Pas de grille horaire ni de colonne des heures : l'heure est écrite dans la
// brique, dont la hauteur suit la durée. Bureau : 7 jours sur une ligne.
// Téléphone : 6 jours (Lun → Sam) en 3 colonnes × 2 lignes ; le dimanche tient
// dans une fine ligne sous la grille quand il a des évènements.

const FOND = '#1b1611'
const VIOLET = '#a78bfa'

export function SemaineBriques({ anchor, onEdit, onCreate, onStep, onMove, onOpenDay }: {
  anchor: Date; onEdit: (t: Task) => void; onCreate: (d: string) => void; onStep: (st: Step) => void; onMove: MoveFn
  onOpenDay: (d: Date) => void
}) {
  const s = useHorizon()
  const telephone = useMediaQuery('(max-width: 767px)')
  const mode: ModeSemaine = telephone ? 'telephone' : 'bureau'
  const jours = useMemo(() => {
    const debut = startOfWeek(anchor, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: debut, end: endOfWeek(debut, { weekStartsOn: 1 }) })
  }, [anchor])
  const affiches = telephone ? jours.slice(0, 6) : jours
  const dimanche = jours[6]!
  const nbDimanche = telephone
    ? tasksForDay(s.tasks, dimanche).length + stepsForDay(s.steps, dimanche).length + birthdaysForDay(s.birthdays, dimanche).length
    : 0

  return (
    <Card className="flex min-h-0 min-w-0 flex-1 flex-col !border-line-2/60 !bg-transparent !p-2 max-md:!p-1">
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none]">
        <div className={`grid min-h-full ${telephone ? 'grid-cols-3 gap-1' : 'grid-cols-7 gap-2'}`}
          style={telephone ? { gridTemplateRows: 'repeat(2, minmax(min-content, 1fr))' } : undefined}>
          {affiches.map((jour) => (
            <ColonneJour key={jour.toISOString()} day={jour} mode={mode}
              onEdit={onEdit} onCreate={onCreate} onStep={onStep} onMove={onMove} onOpenDay={onOpenDay} />
          ))}
        </div>
        {nbDimanche > 0 && (
          <button onClick={() => onOpenDay(dimanche)}
            className="mt-1 flex w-full items-center justify-between rounded-lg border border-line-2/50 px-2.5 py-1.5 text-[11px] text-ink-2 hover:bg-panel-2/40">
            <span><span className="capitalize">{format(dimanche, 'EEE d', { locale: fr })}</span> · {nbDimanche} événement{nbDimanche > 1 ? 's' : ''}</span>
            <ChevronRight size={13} className="text-ink-3" />
          </button>
        )}
      </div>
    </Card>
  )
}

function ColonneJour({ day, mode, onEdit, onCreate, onStep, onMove, onOpenDay }: {
  day: Date; mode: ModeSemaine; onEdit: (t: Task) => void; onCreate: (d: string) => void; onStep: (st: Step) => void
  onMove: MoveFn; onOpenDay: (d: Date) => void
}) {
  const s = useHorizon()
  const openMassPicker = useContext(MassPickCtx)
  const [over, setOver] = useState(false)
  const tel = mode === 'telephone'
  const d = iso(day)
  const today = isToday(day)
  const taches = [...tasksForDay(s.tasks, day)]
    .map((t) => ({ t, span: spanPart(t, d) !== 'single' }))
    .sort((a, b) => ordreSemaine(a.t, b.t, a.span, b.span))
  const steps = stepsForDay(s.steps, day)
  const anniv = birthdaysForDay(s.birthdays, day)
  const fete = s.settings?.catholic_feasts !== false ? feastOnDay(day) : null
  const rawMass = firstFridayOrSaturday(day)
  const messe = rawMass && d >= todayIso() && day <= addMonths(new Date(), 6) ? rawMass : null
  const messeChoisie = messe || fete ? chosenMassForDay(s.checks, d) : null
  const rempla = remplaProposeOn(s.celesteProposals, d)
  const marche = isMarketParkingDay(s.tasks, day)

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setOver(false)
    const dr = readDrag(e); if (dr) onMove(dr.kind, dr.id, d, veutCopier(e))
  }
  const pastille = today
    ? 'rounded-full bg-gradient-to-br from-[#f59e0b] to-[#ea580c] font-bold text-[#140e05]'
    : 'text-ink'
  const marqueur = 'flex w-full items-center gap-1 truncate rounded-lg border px-1.5 py-1 text-left text-[10px] font-medium'

  return (
    <section
      onDragOver={(e) => { survol(e); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}
      onClick={(e) => { if (e.target === e.currentTarget) onCreate(d) }}
      aria-label={format(day, 'EEEE d MMMM', { locale: fr })}
      className={`flex min-w-0 cursor-pointer flex-col rounded-xl ${tel ? 'border border-line-2/55 p-1' : 'px-0.5 pb-2'} ${
        over ? 'bg-sun/10' : today ? 'bg-sun/[0.06]' : ''}`}>
      <button onClick={() => onOpenDay(day)} title="Ouvrir la journée"
        className={`${tel ? 'mb-1 flex items-baseline gap-1 text-left' : 'mb-1.5 block w-full py-1 text-center'} ${
          rempla ? 'rounded border border-dashed border-[#ef4444]/80' : ''}`}>
        <small className={`block text-[10px] uppercase tracking-[0.08em] ${tel ? 'inline text-[8.5px]' : ''} ${today ? 'text-sun-soft' : 'text-ink-3'}`}>
          {format(day, 'EEE', { locale: fr }).replace('.', '')}
        </small>
        <span className={`inline-block px-1.5 py-px text-[13px] font-semibold ${pastille}`}>{format(day, 'd')}</span>
      </button>

      <div className="flex flex-col gap-1" onClick={(e) => { if (e.target === e.currentTarget) onCreate(d) }}>
        {rempla && <RemplaChip p={rempla} />}
        {fete && (
          <button onClick={(e) => { e.stopPropagation(); openMassPicker(d, fete) }}
            title={`${fete} — trouver une messe${messeChoisie ? ` : ${messeChoisie}` : ''}`}
            className={`${marqueur} ${messeChoisie ? 'border-good/40 bg-good/15 text-[#4cc79a]' : 'border-sun/40 bg-sun/15 text-sun-soft'}`}>
            <span className="shrink-0">✝</span><span className="truncate">{fete}</span>
          </button>
        )}
        {messe && (
          <button onClick={(e) => { e.stopPropagation(); openMassPicker(d, messe) }}
            title={`Messe — ${messe}${messeChoisie ? ` : ${messeChoisie}` : ' (cliquer pour choisir)'}`}
            className={`${marqueur} ${messeChoisie ? 'border-good/40 bg-good/15 text-[#4cc79a]' : 'border-[#a78bfa]/40 bg-[#a78bfa]/15 text-[#a78bfa]'}`}>
            <Church size={10} className="shrink-0" /><span className="truncate">{messeChoisie ?? `Messe · ${messe}`}</span>
          </button>
        )}
        {marche && (
          <div title="Dimanche travaillé (début ≤ 15h) — marché dominical & stationnement compliqués"
            className="flex items-center justify-center gap-1 rounded-lg bg-[#ef4444]/20 px-1 py-1 text-[9px] font-bold uppercase tracking-wide text-[#ff6b6b] ring-1 ring-[#ef4444]/40">
            <AlertTriangle size={10} /> Marché / Parking
          </div>
        )}
        {anniv.map((b) => (
          <div key={b.id} className={`${marqueur} cursor-default border-[#ec7f97]/40 bg-[#ec7f97]/15 text-[#ec7f97]`}>
            <span className="shrink-0">🎂</span><span className="truncate">{b.name}</span>
          </div>
        ))}
        {steps.map((st) => (
          <button key={st.id} draggable onDragStart={dragData('step', st.id)} onClick={(e) => { e.stopPropagation(); onStep(st) }}
            className={`${marqueur} border-[#a78bfa]/40 bg-[#a78bfa]/15 text-[#c4b5fd]`}>
            <Layers size={10} className="shrink-0" /><span className="truncate">{st.title}</span>
          </button>
        ))}
        {taches.map(({ t }) => <Brique key={t.id} t={t} jour={d} mode={mode} onEdit={onEdit} />)}
      </div>
    </section>
  )
}

function Brique({ t, jour, mode, onEdit }: { t: Task; jour: string; mode: ModeSemaine; onEdit: (t: Task) => void }) {
  const s = useHorizon()
  const tel = mode === 'telephone'
  const projet = t.project_id ? s.projects.find((p) => p.id === t.project_id) : undefined
  const domaine = s.domains.find((x) => x.id === (t.domain_id ?? projet?.domain_id))
  const c = couleurProjet(projet, s.domains) ?? domaine?.color ?? EVENT_DEFAULT_COLOR
  const part = spanPart(t, jour)
  const aHeure = extractHourMinute(t.title) !== null
  // Heure en tête ; sans heure : « Journée », ou la plage d'un évènement multi-jours.
  const fin = t.end_date ? format(parseISO(t.end_date), 'd MMM', { locale: fr }) : ''
  const entete = part !== 'single'
    ? (part === 'start' ? `Jusqu’au ${fin}` : part === 'end' ? 'Dernier jour' : `Jusqu’au ${fin}`)
    : libelleHeures(t) ?? 'Journée'
  const duree = part === 'single' && aHeure ? libelleDuree(t.duration_min) : ''
  const hauteur = hauteurBrique(part === 'single' && aHeure ? t.duration_min : null, mode)
  const note = tel ? null : notePropre(t.notes)
  const checkMass = t.notes?.startsWith('source:check') ?? false
  const fait = !t.is_recurring && t.status === 'fait'

  return (
    <button draggable={!t.is_recurring} onDragStart={dragData('task', t.id)}
      onClick={(e) => { e.stopPropagation(); onEdit(t) }} title={t.title}
      className={`flex w-full flex-col items-stretch justify-start overflow-hidden text-left ${tel ? 'rounded-[11px] px-1.5 py-[5px]' : 'rounded-xl px-2 py-1.5'} ${fait ? 'opacity-55' : ''}`}
      // Bureau : hauteur fixe selon la durée. Téléphone : hauteur minimale, pour ne jamais couper un titre.
      style={{
        ...(tel ? { minHeight: hauteur } : { height: hauteur }),
        background: `linear-gradient(160deg, color-mix(in srgb, ${c} 38%, ${FOND}), color-mix(in srgb, ${c} 14%, ${FOND}))`,
        border: checkMass ? `1.5px dashed ${VIOLET}` : `1px solid color-mix(in srgb, ${c} 55%, transparent)`,
      }}>
      <span className={`block shrink-0 font-bold text-ink opacity-90 ${tel ? 'text-[8.5px]' : 'text-[11px]'}`}>{entete}</span>
      <span className={`mt-0.5 block shrink-0 break-words font-bold text-ink ${tel ? 'text-[11px] leading-[1.2]' : 'line-clamp-2 text-[13px] leading-[1.15]'} ${fait ? 'line-through' : ''}`}>
        {projet && <IconeProjet project={projet} size={tel ? 10 : 12} className="mr-1 align-[-1px]" />}
        {checkMass && <Church size={tel ? 9 : 11} className="mr-0.5 inline" style={{ color: VIOLET }} />}
        {sansHeure(t.title)}
      </span>
      {note && <span className="mt-0.5 line-clamp-2 block text-[10.5px] leading-tight text-[#d9d0c0] opacity-80">{note}</span>}
      {tel && duree && <span className="mt-auto pt-0.5 text-[8.5px] text-ink-2 opacity-70">{duree}</span>}
    </button>
  )
}
