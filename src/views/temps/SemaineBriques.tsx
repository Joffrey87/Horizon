import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { addMonths, eachDayOfInterval, endOfWeek, format, isToday, parseISO, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import { APlanifier } from './APlanifier'
import { AlerteParking } from './AlerteParking'
import { PX_DEMI_HEURE, PositionsCtx, briqueEnCours, cleBrique, usePositionsBriques } from './positionsBriques'
import { Church, Layers, Circle, CheckCircle2 } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { useMediaQuery } from '../../lib/useMediaQuery'
import {
  birthdaysForDay, chosenMassForDay, extractHourMinute, feastOnDay, firstFridayOrSaturday, isMarketParkingDay,
  iso, sansHeure, spanPart, tasksForDay, todayIso,
} from '../../lib/logic'
import { bandeService, heureCourte, hauteurBrique, libelleDuree, libelleHeures, notePropre, ordreSemaine, type ModeSemaine } from '../../lib/semaine'
import { couleurProjet } from '../../lib/projectIcons'
import { Card } from '../../components/ui'
import { IconeProjet } from '../../components/IconeProjet'
import type { Step, Task } from '../../lib/types'
import { EVENT_DEFAULT_COLOR, MassPickCtx, dragData, readDrag, remplaProposeOn, stepsForDay, survol, veutCopier, type MoveFn } from './partage'
import { RemplaChip } from './DayCell'

// ---- Vue Semaine : uniquement des briques empilées -------------------------
// Pas de grille horaire ni de colonne des heures : l'heure est écrite dans la
// brique, dont la hauteur suit la durée. Bureau : 7 jours sur une ligne.
// Téléphone : 6 jours (Lun → Sam) en 3 colonnes × 2 lignes ; le dimanche tient dans
// une ligne sous la grille (ses évènements côte à côte). Une garde CAPS devient une
// bande pleine de 24 px sous l'en-tête du jour (pas de place réservée sans service).

type Niveau = 0 | 1 | 2

/** Bureau : une colonne « À planifier » à gauche, puis les 7 jours. */
const COLONNES_BUREAU = 'grid-cols-[minmax(0,1fr)_repeat(7,minmax(0,1.08fr))]'
const FOND = '#1b1611'
const VIOLET = '#a78bfa'

export function SemaineBriques({ anchor, onEdit, onCreate, onStep, onMove, onOpenDay }: {
  anchor: Date; onEdit: (t: Task) => void; onCreate: (d: string) => void; onStep: (st: Step) => void; onMove: MoveFn
  onOpenDay: (d: Date) => void
}) {
  const s = useHorizon()
  const positionsBriques = usePositionsBriques()
  const telephone = useMediaQuery('(max-width: 767px)')
  const mode: ModeSemaine = telephone ? 'telephone' : 'bureau'
  const jours = useMemo(() => {
    const debut = startOfWeek(anchor, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: debut, end: endOfWeek(debut, { weekStartsOn: 1 }) })
  }, [anchor])
  const affiches = telephone ? jours.slice(0, 6) : jours
  const dimanche = jours[6]!
  const aDimanche = telephone
    && tasksForDay(s.tasks, dimanche).filter((t) => spanPart(t, iso(dimanche)) === 'single').length + stepsForDay(s.steps, dimanche).length + birthdaysForDay(s.birthdays, dimanche).length > 0

  // Téléphone : jamais de défilement. Si une semaine très chargée dépasse la hauteur disponible, les briques se
  // resserrent d'un cran (0 normal → 1 serré : heure sur la ligne du titre → 2 une seule ligne), jusqu'à tenir.
  const [niveau, setNiveau] = useState<Niveau>(0)
  const defile = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => { setNiveau(0) }, [anchor, s.tasks, s.steps, s.birthdays, telephone])
  const [taille, setTaille] = useState(0)   // change à chaque redimensionnement : on re-mesure
  useEffect(() => {
    const raz = () => { setNiveau(0); setTaille((n) => n + 1) }
    window.addEventListener('resize', raz)
    return () => window.removeEventListener('resize', raz)
  }, [])
  useLayoutEffect(() => {
    const el = defile.current
    if (telephone && el && el.scrollHeight > el.clientHeight + 1 && niveau < 2) setNiveau((n) => (n < 2 ? ((n + 1) as Niveau) : n))
  }, [niveau, taille, anchor, s.tasks, s.steps, s.birthdays, telephone])

  return (
    <PositionsCtx.Provider value={positionsBriques}>
    <Card className="flex min-h-0 min-w-0 flex-1 flex-col !border-line-2/60 !bg-transparent !p-2 max-md:!p-1 md:-mx-3 lg:-mx-6">
      {telephone && <BandeauxSemaine jours={jours} tel onEdit={onEdit} />}
      <div ref={defile} className="min-h-0 flex-1 overflow-y-auto px-1 [scrollbar-width:none]">
        <div className={`grid min-h-full ${telephone ? 'grid-cols-3 gap-1' : `${COLONNES_BUREAU} gap-x-2 gap-y-0`}`}
          style={telephone ? { gridTemplateRows: 'repeat(2, minmax(min-content, 1fr))' } : { gridTemplateRows: 'auto auto 1fr' }}>
          {!telephone && <APlanifier semaine={iso(jours[0]!)} />}
          {/* Évènements sur plusieurs jours (ex. « Anglais EAO ») : sous les jours de travail, au-dessus des évènements de chaque jour. */}
          {!telephone && <div className="pointer-events-none relative z-10" style={{ gridColumn: '2 / -1', gridRow: 2 }}><BandeauxSemaine jours={jours} tel={false} onEdit={onEdit} /></div>}
          {affiches.map((jour, i) => (
            <ColonneJour key={jour.toISOString()} day={jour} mode={mode} niveau={niveau} colonne={i + 2}
              onEdit={onEdit} onCreate={onCreate} onStep={onStep} onMove={onMove} onOpenDay={onOpenDay} />
          ))}
        </div>
      </div>
      {aDimanche && <LigneDimanche day={dimanche} onOpenDay={onOpenDay} />}
    </Card>
    </PositionsCtx.Provider>
  )
}

/** Évènements multi-jours (ex. « Anglais EAO » du lundi au dimanche) : comme en vue Mois, une barre pleine
 *  continue sur les jours couverts, titre écrit une seule fois ; plus de répétition dans chaque jour.
 *  Bureau : aligné sur les 7 colonnes. Téléphone (grille 3 × 2) : une frise de 7 jours au-dessus de la grille. */
function BandeauxSemaine({ jours, tel, onEdit }: { jours: Date[]; tel: boolean; onEdit: (t: Task) => void }) {
  const s = useHorizon()
  const debut = iso(jours[0]!), fin = iso(jours[6]!)
  const multi = s.tasks
    .filter((t) => t.scheduled_date && t.end_date && t.end_date > t.scheduled_date && t.scheduled_date <= fin && t.end_date >= debut)
    .sort((a, b) => a.scheduled_date!.localeCompare(b.scheduled_date!) || b.end_date!.localeCompare(a.end_date!) || a.id.localeCompare(b.id))
  if (multi.length === 0) return null
  const col = (d: string) => jours.findIndex((j) => iso(j) === d)
  return (
    <div className={`mb-1 grid shrink-0 grid-cols-7 ${tel ? 'gap-x-0.5 gap-y-0.5' : 'gap-x-2 gap-y-1'}`} style={{ gridAutoFlow: 'row dense' }}>
      {multi.map((t) => {
        const projet = t.project_id ? s.projects.find((p) => p.id === t.project_id) : undefined
        const domaine = s.domains.find((x) => x.id === (t.domain_id ?? projet?.domain_id))
        const c = couleurProjet(projet, s.domains) ?? domaine?.color ?? EVENT_DEFAULT_COLOR
        const avant = t.scheduled_date! < debut, apres = t.end_date! > fin
        const a = avant ? 0 : col(t.scheduled_date!), b = apres ? 6 : col(t.end_date!)
        const r = tel ? 7 : 8
        const plage = `${format(parseISO(t.scheduled_date!), 'd MMM', { locale: fr })} → ${format(parseISO(t.end_date!), 'd MMM', { locale: fr })}`
        const fait = !t.is_recurring && t.status === 'fait'
        // Sans lieu : barre deux fois moins épaisse (le titre reste lisible, en plus petit).
        const fine = !t.location?.trim()
        return (
          <button key={t.id} draggable={!t.is_recurring} onDragStart={dragData('task', t.id)}
            onClick={(e) => { e.stopPropagation(); onEdit(t) }} title={`${t.title} · ${plage}`}
            className={`pointer-events-auto flex min-w-0 items-center overflow-hidden whitespace-nowrap text-left font-semibold text-ink ${fine ? (tel ? 'h-[10px] px-1.5 text-[8px] leading-none' : 'h-3 px-2 text-[9px] leading-none') : tel ? 'h-[20px] px-1.5 text-[10.5px]' : 'h-6 px-2 text-[12px]'} ${fait ? 'opacity-55 line-through' : ''}`}
            style={{
              gridColumn: `${a + 1} / ${b + 2}`, background: `${c}c2`,
              borderTopLeftRadius: avant ? 0 : r, borderBottomLeftRadius: avant ? 0 : r,
              borderTopRightRadius: apres ? 0 : r, borderBottomRightRadius: apres ? 0 : r,
            }}>
            {avant && <span className="mr-1 opacity-70">‹</span>}
            {projet && <IconeProjet project={projet} size={tel ? 10 : 12} className="mr-1 shrink-0" />}
            <span className="min-w-0 overflow-hidden text-clip">{sansHeure(t.title)}</span>
            {apres && <span className="ml-auto pl-1 opacity-70">›</span>}
          </button>
        )
      })}
    </div>
  )
}

function ColonneJour({ day, mode, niveau, colonne, onEdit, onCreate, onStep, onMove, onOpenDay }: {
  day: Date; mode: ModeSemaine; niveau: Niveau; colonne: number; onEdit: (t: Task) => void; onCreate: (d: string) => void; onStep: (st: Step) => void
  onMove: MoveFn; onOpenDay: (d: Date) => void
}) {
  const s = useHorizon()
  const openMassPicker = useContext(MassPickCtx)
  const { positions, placer } = useContext(PositionsCtx)
  const briques = useRef<HTMLDivElement>(null)
  const [over, setOver] = useState(false)
  const tel = mode === 'telephone'
  const d = iso(day)
  const today = isToday(day)
  // Téléphone : la garde CAPS du jour devient une bande pleine (voir BandeService), pas une brique.
  const bande = bandeService(s.tasks, d)
  const tacheBande = bande ? s.tasks.find((t) => t.id === bande.id) : undefined
  const couleurBande = tacheBande
    ? couleurProjet(tacheBande.project_id ? s.projects.find((p) => p.id === tacheBande.project_id) : undefined, s.domains)
      ?? s.domains.find((x) => x.id === (tacheBande.domain_id ?? s.projects.find((p) => p.id === tacheBande.project_id)?.domain_id))?.color
      ?? EVENT_DEFAULT_COLOR
    : EVENT_DEFAULT_COLOR
  const taches = [...tasksForDay(s.tasks, day)]
    .filter((t) => t.id !== bande?.id && spanPart(t, d) === 'single')   // multi-jours : bandeau en haut de semaine
    .map((t) => ({ t, span: false }))
    .sort((a, b) => ordreSemaine(a.t, b.t, a.span, b.span))
  const steps = stepsForDay(s.steps, day)
  const anniv = birthdaysForDay(s.birthdays, day)
  const fete = s.settings?.catholic_feasts !== false ? feastOnDay(day) : null
  const rawMass = firstFridayOrSaturday(day)
  const messe = rawMass && d >= todayIso() && day <= addMonths(new Date(), 6) ? rawMass : null
  const messeChoisie = messe || fete ? chosenMassForDay(s.checks, d) : null
  const croixMesse = chosenMassForDay(s.checks, d)
  const rempla = remplaProposeOn(s.celesteProposals, d)
  const marche = isMarketParkingDay(s.tasks, day)

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setOver(false)
    const dr = readDrag(e)
    if (!dr) return
    // Une brique lâchée dans son propre jour (ordinateur) : on la repositionne, sans changer ni jour ni heure.
    const b = briqueEnCours.courant
    if (!tel && dr.kind === 'task' && b && b.id === dr.id && b.jour === d) {
      const cle = cleBrique(dr.id, d)
      // Lâchée sur d'autres briques : elle retrouve sa place normale (dans la pile).
      const dessus = document.elementsFromPoint(e.clientX, e.clientY).some((el) => {
        const autre = (el as HTMLElement).closest?.('[data-brique-id]')?.getAttribute('data-brique-id')
        return !!autre && autre !== dr.id
      })
      const haut = briques.current?.getBoundingClientRect().top
      if (dessus || haut === undefined) { placer(cle, null); return }
      // Magnétisme : le bord haut se cale sur le cran de demi-heure le plus proche.
      placer(cle, Math.max(0, Math.round((e.clientY - b.decalageY - haut) / PX_DEMI_HEURE)))
      return
    }
    onMove(dr.kind, dr.id, d, veutCopier(e))
  }
  // Briques déplacées à la main (ordinateur) : posées en absolu, la colonne garde assez de hauteur pour les contenir.
  const placees = tel ? [] : taches.filter(({ t }) => positions[cleBrique(t.id, d)] !== undefined)
  const hautPlacees = Math.max(0, ...placees.map(({ t }) => positions[cleBrique(t.id, d)]! * PX_DEMI_HEURE
    + hauteurBrique(extractHourMinute(t.title) !== null ? t.duration_min : null, mode)))
  const pastille = today
    ? 'rounded-full bg-gradient-to-br from-[#f59e0b] to-[#ea580c] font-bold text-[#140e05]'
    : 'text-ink'
  const coupe = tel ? 'overflow-hidden whitespace-nowrap text-clip' : 'truncate'
  const marqueur = `flex w-full items-center gap-1 ${coupe} rounded-lg border px-1.5 py-1 text-left text-[10px] font-medium`

  return (
    <section
      onDragOver={(e) => { survol(e); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}
      onClick={(e) => { if (e.target === e.currentTarget) onCreate(d) }}
      aria-label={format(day, 'EEEE d MMMM', { locale: fr })}
      // Ordinateur : la colonne couvre 3 lignes de la grille de la semaine (jour + service | évènements sur plusieurs jours | évènements du jour),
      // pour que les barres « Anglais EAO » passent en dessous des jours de travail.
      style={tel ? undefined : { gridColumn: colonne, gridRow: '1 / span 3', gridTemplateRows: 'subgrid' }}
      className={`min-w-0 cursor-pointer rounded-xl ${tel ? 'flex flex-col border border-line-2/55 p-1' : 'grid grid-cols-[minmax(0,1fr)] px-0.5 pb-2'} ${
        over ? 'bg-sun/10' : today ? 'bg-sun/[0.06]' : ''}`}>
      <div style={tel ? undefined : { gridRow: 1 }}>
      <div className="relative">
        <button onClick={() => onOpenDay(day)} title="Ouvrir la journée"
          className={`${tel ? 'mb-1 flex items-baseline gap-1 text-left' : 'mb-1.5 block w-full py-1 text-center'} ${
            rempla ? 'rounded border border-dashed border-[#ef4444]/80' : ''}`}>
          <small className={`block text-[10px] uppercase tracking-[0.08em] ${tel ? 'inline text-[8.5px]' : ''} ${today ? 'text-sun-soft' : 'text-ink-3'}`}>
            {format(day, 'EEE', { locale: fr }).replace('.', '')}
          </small>
          <span className={`inline-block px-1.5 py-px text-[13px] font-semibold ${pastille}`}>{format(day, 'd')}</span>
        </button>
        {/* Croix : trouver / planifier une messe ce jour-là (comme dans la vue Mois). */}
        <button type="button" onClick={(e) => { e.stopPropagation(); openMassPicker(d, fete ?? '') }}
          title={fete ? `${fete} — trouver une messe${croixMesse ? ` : ${croixMesse}` : ''}` : `Trouver une messe${croixMesse ? ` : ${croixMesse}` : ''}`}
          aria-label="Trouver une messe"
          className={`absolute right-0 top-1/2 -translate-y-1/2 px-1 text-[12px] font-semibold leading-none transition-opacity hover:opacity-70 ${
            croixMesse ? 'rounded border border-sun/70 text-sun' : fete ? 'text-sun-soft' : 'text-ink-3/70'}`}>✝</button>
      </div>

      {/* Jour de travail : bande compacte (hauteur fixe, pas proportionnelle à la durée) ; sur ordinateur la place est réservée
          même les jours sans service, pour que les autres évènements restent alignés d'un jour à l'autre. */}
      {tel
        ? bande && <BandeService b={bande} onEdit={tacheBande ? () => onEdit(tacheBande) : undefined} className="-mx-1 mb-1 h-6" />
        : bande ? <BandeService b={bande} couleur={couleurBande} onEdit={tacheBande ? () => onEdit(tacheBande) : undefined} className="mb-1.5 h-[22px] rounded-lg" /> : <div aria-hidden className="mb-1.5 h-[22px]" />}
      </div>

      <div className="flex flex-col gap-1" style={tel ? undefined : { gridRow: 3 }}
        onClick={(e) => { if (e.target === e.currentTarget) onCreate(d) }}>
        {rempla && <RemplaChip p={rempla} />}
        {fete && (
          <button onClick={(e) => { e.stopPropagation(); openMassPicker(d, fete) }}
            title={`${fete} — trouver une messe${messeChoisie ? ` : ${messeChoisie}` : ''}`}
            className={`${marqueur} ${messeChoisie ? 'border-good/40 bg-good/15 text-[#4cc79a]' : 'border-sun/40 bg-sun/15 text-sun-soft'}`}>
            <span className="shrink-0">✝</span><span className={coupe}>{fete}</span>
          </button>
        )}
        {messe && (
          <button onClick={(e) => { e.stopPropagation(); openMassPicker(d, messe) }}
            title={`Messe — ${messe}${messeChoisie ? ` : ${messeChoisie}` : ' (cliquer pour choisir)'}`}
            className={`${marqueur} ${messeChoisie ? 'border-good/40 bg-good/15 text-[#4cc79a]' : 'border-[#a78bfa]/40 bg-[#a78bfa]/15 text-[#a78bfa]'}`}>
            <Church size={10} className="shrink-0" /><span className={coupe}>{messeChoisie ?? `Messe · ${messe}`}</span>
          </button>
        )}
        {marche && <AlerteParking jour={d} />}
        {anniv.map((b) => (
          <div key={b.id} className={`${marqueur} cursor-default border-[#ec7f97]/40 bg-[#ec7f97]/15 text-[#ec7f97]`}>
            <span className="shrink-0">🎂</span><span className={coupe}>{b.name}</span>
          </div>
        ))}
        {steps.map((st) => (
          <button key={st.id} draggable onDragStart={dragData('step', st.id)} onClick={(e) => { e.stopPropagation(); onStep(st) }}
            className={`${marqueur} border-[#a78bfa]/40 bg-[#a78bfa]/15 text-[#c4b5fd]`}>
            <Layers size={10} className="shrink-0" /><span className={coupe}>{st.title}</span>
          </button>
        ))}
        {/* Les briques ont leur propre zone sous les pastilles (fêtes, messes, anniversaires…) : une brique déplacée ne peut jamais les recouvrir. */}
        <div ref={briques} className="relative flex flex-col gap-1" style={!tel && placees.length ? { minHeight: hautPlacees } : undefined}>
        {taches.map(({ t }) => <Brique key={t.id} t={t} jour={d} mode={mode} niveau={niveau} onEdit={onEdit} pos={tel ? undefined : positions[cleBrique(t.id, d)]} />)}
        </div>
      </div>
    </section>
  )
}

/** Bande de service : « J 10h30–18h30 », texte gras sur une ligne, couleur du code. */
function BandeService({ b, className = '', couleur, onEdit }: { b: NonNullable<ReturnType<typeof bandeService>>; className?: string; couleur?: string; onEdit?: () => void }) {
  return (
    <div title={onEdit ? `${b.libelle} — cliquer pour modifier` : b.libelle} role={onEdit ? 'button' : undefined}
      onClick={onEdit ? (e) => { e.stopPropagation(); onEdit() } : undefined}
      className={`flex shrink-0 items-center justify-center whitespace-nowrap text-[10px] font-extrabold ${onEdit ? 'cursor-pointer hover:brightness-110' : ''} ${className}`}
      // Ordinateur : une seule couleur pour tous les services (celle de la brique d'avant) ; téléphone : couleur du service.
      style={couleur ? { background: `color-mix(in srgb, ${couleur} 55%, ${FOND})`, color: 'var(--color-ink)' } : { background: b.fond, color: b.texte }}>
      {b.libelle}
    </div>
  )
}

/** Téléphone, dimanche : une ligne sous la grille. Ses évènements sont côte à côte (le plus long est tronqué) ;
 *  la garde CAPS suit la même règle que les autres jours (bande, sans place réservée sinon). Un tap ouvre le jour. */
function LigneDimanche({ day, onOpenDay }: { day: Date; onOpenDay: (d: Date) => void }) {
  const s = useHorizon()
  const d = iso(day)
  const bande = bandeService(s.tasks, d)
  const puces: { key: string; heure: string | null; min?: number | null; titre: string; couleur: string }[] = [
    ...[...tasksForDay(s.tasks, day)].filter((t) => t.id !== bande?.id && spanPart(t, d) === 'single')
      .map((t) => ({ t, span: spanPart(t, d) !== 'single' }))
      .sort((a, b) => ordreSemaine(a.t, b.t, a.span, b.span))
      .map(({ t }) => {
        const projet = t.project_id ? s.projects.find((p) => p.id === t.project_id) : undefined
        const domaine = s.domains.find((x) => x.id === (t.domain_id ?? projet?.domain_id))
        const h = extractHourMinute(t.title)
        return { key: t.id, heure: h ? `${h.hour}:${String(h.minute).padStart(2, '0')}` : null, min: h ? h.hour * 60 + h.minute : null, titre: sansHeure(t.title),
          couleur: couleurProjet(projet, s.domains) ?? domaine?.color ?? EVENT_DEFAULT_COLOR }
      }),
    ...stepsForDay(s.steps, day).map((st) => ({ key: st.id, heure: null, titre: st.title, couleur: VIOLET })),
    ...birthdaysForDay(s.birthdays, day).map((b) => ({ key: b.id, heure: null, titre: `🎂 ${b.name}`, couleur: '#ec7f97' })),
  ]
  const enTete = (
    <span className="flex shrink-0 items-baseline gap-1 px-1">
      <small className="text-[8.5px] uppercase tracking-[0.08em] text-ink-3">dim</small>
      <span className="text-[13px] font-semibold text-ink">{format(day, 'd')}</span>
    </span>
  )
  const rangee = (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      {puces.map((p) => (
        <span key={p.key} title={`${p.heure ? `${p.heure} ` : ''}${p.titre}`}
          className="flex min-w-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[10.5px] font-bold leading-tight text-ink"
          style={{ flex: '0 1 auto', background: `linear-gradient(160deg, color-mix(in srgb, ${p.couleur} 38%, ${FOND}), color-mix(in srgb, ${p.couleur} 14%, ${FOND}))`,
            border: `1px solid color-mix(in srgb, ${p.couleur} 55%, transparent)` }}>
          {p.heure && <span className="shrink-0 text-[8.5px] opacity-80"><HeureTel min={p.min ?? 0} /></span>}
          <span className="overflow-hidden whitespace-nowrap text-clip">{p.titre}</span>
        </span>
      ))}
    </div>
  )
  return (
    <button onClick={() => onOpenDay(day)} aria-label={`Ouvrir ${format(day, 'EEEE d MMMM', { locale: fr })}`}
      className="mt-1 flex w-full shrink-0 flex-col gap-1 overflow-hidden rounded-xl border border-line-2/55 p-1 text-left">
      <div className="flex items-center gap-1.5">
        {enTete}
        {bande ? <BandeService b={bande} className="h-[22px] min-w-0 flex-1 rounded-lg" /> : rangee}
      </div>
      {bande && puces.length > 0 && <div className="flex">{rangee}</div>}
    </button>
  )
}

/** Téléphone : « 8h », ou « 8h » + minutes en petit exposant (8h³⁰). */
function HeureTel({ min }: { min: number }) {
  const { h, m } = heureCourte(min)
  return <>{h}{m && <sup className="text-[0.6em] align-super leading-none">{m}</sup>}</>
}
function PlageTel({ t }: { t: Pick<Task, 'title' | 'duration_min'> }) {
  const hmn = extractHourMinute(t.title)
  if (!hmn) return null
  const d = hmn.hour * 60 + hmn.minute
  return <><HeureTel min={d} />{t.duration_min ? <> – <HeureTel min={d + t.duration_min} /></> : null}</>
}

function Brique({ t, jour, mode, niveau, onEdit, pos }: { t: Task; jour: string; mode: ModeSemaine; niveau: Niveau; onEdit: (t: Task) => void; pos?: number }) {
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
  const hauteurNormale = hauteurBrique(part === 'single' && aHeure ? t.duration_min : null, mode)
  // Ordinateur : un évènement sans heure (« Journée », ex. Congés M2) s'affiche compact, sur une ligne, comme les bandes de service.
  const journee = !tel && part === 'single' && !aHeure
  const hauteur = journee ? 24 : niveau === 2 ? 22 : niveau === 1 ? Math.max(26, Math.round(hauteurNormale * 0.6)) : hauteurNormale
  const note = tel || journee ? null : notePropre(t.notes)
  // Téléphone, brique courte : heure de début et titre sur la même ligne (la plage reste dans l'infobulle) ;
  // brique longue (≥ 4 h) : plage et durée en plus, la hauteur disant déjà la durée.
  const compact = journee || (tel && (niveau > 0 || hauteur < 56))
  const uneLigne = journee || (tel && niveau === 2)
  const debut = compact
    ? (part === 'single' ? (aHeure ? libelleHeures({ title: t.title, duration_min: null }) : null) : part === 'end' ? 'fin' : `→ ${fin}`)
    : null
  const checkMass = t.notes?.startsWith('source:check') ?? false
  const fait = !t.is_recurring && t.status === 'fait'

  return (
    <button draggable={!t.is_recurring} data-brique-id={t.id}
      onDragStart={(e) => {
        dragData('task', t.id)(e)
        briqueEnCours.courant = { id: t.id, jour, decalageY: e.clientY - e.currentTarget.getBoundingClientRect().top }
      }}
      onDragEnd={() => { briqueEnCours.courant = null }}
      onClick={(e) => { e.stopPropagation(); onEdit(t) }} title={`${t.title}${libelleHeures(t) ? ` · ${libelleHeures(t)}` : ''}${duree ? ` (${duree})` : ''}`}
      className={`flex w-full flex-col items-stretch justify-start overflow-hidden text-left ${tel ? `rounded-[10px] px-1.5 ${uneLigne ? 'py-px' : compact ? 'py-[3px]' : 'py-[5px]'}` : 'rounded-lg px-1.5 py-1'} ${fait ? 'opacity-55' : ''}`}
      // Bureau : hauteur fixe selon la durée. Téléphone : hauteur minimale, pour ne jamais couper un titre.
      style={{
        // La hauteur de la durée est un minimum : la brique s'agrandit pour que le titre et la note se lisent en entier.
        minHeight: hauteur,
        ...(pos !== undefined ? { position: 'absolute' as const, left: 0, right: 0, top: pos * PX_DEMI_HEURE, zIndex: 1 } : {}),
        background: `linear-gradient(160deg, color-mix(in srgb, ${c} 38%, ${FOND}), color-mix(in srgb, ${c} 14%, ${FOND}))`,
        border: checkMass ? `1.5px dashed ${VIOLET}` : t.is_task === false ? `1px solid color-mix(in srgb, ${c} 55%, transparent)` : `1.5px dashed color-mix(in srgb, ${c} 80%, transparent)`,
      }}>
      {!compact && <span className={`block shrink-0 font-bold text-ink opacity-90 ${tel ? 'text-[8.5px]' : 'text-[10px] leading-tight'}`}>{tel && part === 'single' && aHeure ? <PlageTel t={t} /> : entete}</span>}
      <span className={`${compact ? '' : 'mt-0.5'} block shrink-0 font-bold text-ink ${uneLigne ? 'overflow-hidden whitespace-nowrap text-clip' : 'break-words'} ${tel ? 'text-[11px] leading-[1.2]' : 'text-[12px] leading-[1.15]'} ${fait ? 'line-through' : ''}`}>
        {compact && !journee && <span className="mr-1 text-[8.5px] font-bold opacity-80">{part === 'single' && aHeure ? <PlageTel t={{ title: t.title, duration_min: null }} /> : (debut ?? entete)}</span>}
        {projet && <IconeProjet project={projet} size={tel ? 10 : 12} className="mr-1 align-[-1px]" />}
        {checkMass && <Church size={tel ? 9 : 11} className="mr-0.5 inline" style={{ color: VIOLET }} />}
        {/* Tâche : pastille pour la cocher (comme fait) ; un évènement n'en a pas. */}
        {t.is_task !== false && !t.is_recurring && (
          <span role="button" tabIndex={0} aria-label={fait ? 'Marquer à faire' : 'Marquer fait'} className="mr-1 inline-block cursor-pointer align-[-2px]"
            onClick={(e) => { e.stopPropagation(); void s.update('tasks', t.id, fait ? { status: 'a_faire', done_at: null } : { status: 'fait', done_at: new Date().toISOString() }) }}>
            {fait ? <CheckCircle2 size={tel ? 11 : 13} className="text-[#4cc79a]" /> : <Circle size={tel ? 11 : 13} className="text-ink-2" />}
          </span>
        )}
        {sansHeure(t.title)}
      </span>
      {note && <span className="mt-0.5 block text-[10.5px] leading-tight text-[#d9d0c0] opacity-80">{note}</span>}
      {tel && !compact && duree && <span className="mt-auto pt-0.5 text-[8.5px] text-ink-2 opacity-70">{duree}</span>}
    </button>
  )
}
