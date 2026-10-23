import { useState } from 'react'
import { addMonths, eachWeekOfInterval, endOfMonth, endOfWeek, format, isSameDay, setMonth, startOfMonth, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarCheck, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Modal } from '../../components/ui'

export type VueTemps = '4sem' | 'semaine' | 'trimestre' | 'annee'

const LUNDI = { weekStartsOn: 1 } as const

const MOIS_COURT = (d: Date) => format(d, 'MMM', { locale: fr })   // « oct. », « sept. »

/** Libellé court de la période affichée au centre (« 19–25 oct. », « oct. », « oct.–déc. »…). L'année
 *  n'apparaît que si ce n'est pas l'année en cours ; le libellé complet reste dans l'infobulle. */
function libelleCourt(vue: VueTemps, a: Date, aujourdhui = new Date()): string {
  const an = (d: Date) => (d.getFullYear() === aujourdhui.getFullYear() ? '' : ` ${format(d, 'yy')}`)
  if (vue === 'semaine') {
    const d = startOfWeek(a, LUNDI)
    const f = endOfWeek(a, LUNDI)
    if (d.getMonth() === f.getMonth()) return `${format(d, 'd')}–${format(f, 'd')} ${MOIS_COURT(f)}${an(f)}`
    return `${format(d, 'd')} ${MOIS_COURT(d)}–${format(f, 'd')} ${MOIS_COURT(f)}${an(f)}`
  }
  if (vue === 'trimestre') {
    const d = startOfMonth(a)
    const f = addMonths(d, 2)
    return `${MOIS_COURT(d)}–${MOIS_COURT(f)}${an(f)}`
  }
  if (vue === 'annee') return format(a, 'yyyy')
  return `${MOIS_COURT(a)}${an(a)}`
}

/** Libellé complet (infobulle). */
function libelle(vue: VueTemps, a: Date): string {
  if (vue === 'semaine') {
    const d = startOfWeek(a, LUNDI)
    const f = endOfWeek(a, LUNDI)
    if (d.getMonth() === f.getMonth()) return `${format(d, 'd')} – ${format(f, 'd MMMM yyyy', { locale: fr })}`
    if (d.getFullYear() === f.getFullYear()) return `${format(d, 'd MMM', { locale: fr })} – ${format(f, 'd MMM yyyy', { locale: fr })}`
    return `${format(d, 'd MMM yyyy', { locale: fr })} – ${format(f, 'd MMM yyyy', { locale: fr })}`
  }
  if (vue === 'trimestre') {
    const d = startOfMonth(a)
    const f = addMonths(d, 2)
    return d.getFullYear() === f.getFullYear()
      ? `${format(d, 'MMMM', { locale: fr })} – ${format(f, 'MMMM yyyy', { locale: fr })}`
      : `${format(d, 'MMM yyyy', { locale: fr })} – ${format(f, 'MMM yyyy', { locale: fr })}`
  }
  if (vue === 'annee') return format(a, 'yyyy')
  return format(a, 'MMMM yyyy', { locale: fr })
}

const TITRES: Record<VueTemps, { aller: string; precedent: string; suivant: string }> = {
  semaine: { aller: 'Choisir une semaine', precedent: 'Semaine précédente', suivant: 'Semaine suivante' },
  '4sem': { aller: 'Choisir un mois', precedent: 'Mois précédent', suivant: 'Mois suivant' },
  trimestre: { aller: 'Premier mois du trimestre', precedent: 'Trimestre précédent', suivant: 'Trimestre suivant' },
  annee: { aller: 'Choisir une année', precedent: 'Année précédente', suivant: 'Année suivante' },
}

/** Navigation de Temps, centrée, la même pour les quatre vues : ‹ période ›.
 *  Les flèches avancent d'une période ; le libellé ouvre un sélecteur adapté à la
 *  vue (semaine, mois, premier mois du trimestre, année) et le raccourci
 *  « Aujourd'hui » — ce que faisaient les boutons du haut. */
export function NavPeriode({ vue, anchor, onShift, onGoto, compact = false }: {
  /** Téléphone : libellé court (« 19–25 oct. »), flèches discrètes. */
  compact?: boolean
  vue: VueTemps
  anchor: Date
  onShift: (dir: 1 | -1) => void
  onGoto: (d: Date) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const t = TITRES[vue]
  return (
    <>
    {compact ? (
      <div className="flex shrink-0 items-center justify-center">
        <button onClick={() => onShift(-1)} className="rounded-lg p-0.5 text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink" aria-label={t.precedent}><ChevronLeft size={14} /></button>
        <button onClick={() => setOuvert(true)} aria-haspopup="dialog" title={`${libelle(vue, anchor)} — ${t.aller}`}
          className="flex h-8 items-center whitespace-nowrap rounded-xl px-1 text-[13px] font-semibold tracking-wide transition-colors hover:bg-panel-2">
          {libelleCourt(vue, anchor)}
        </button>
        <button onClick={() => onShift(1)} className="rounded-lg p-0.5 text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink" aria-label={t.suivant}><ChevronRight size={14} /></button>
      </div>
    ) : (
      <div className="flex shrink-0 items-center justify-center gap-1">
        <button onClick={() => onShift(-1)} className="btn-ghost p-1.5" aria-label={t.precedent}><ChevronLeft size={16} /></button>
        <button onClick={() => setOuvert(true)} aria-haspopup="dialog" title={t.aller}
          className="flex items-center gap-1 rounded-xl px-2 py-1 text-base font-semibold capitalize leading-tight transition-colors hover:bg-panel-2">
          {libelle(vue, anchor)}
          <ChevronDown size={14} className="text-ink-3" />
        </button>
        <button onClick={() => onShift(1)} className="btn-ghost p-1.5" aria-label={t.suivant}><ChevronRight size={16} /></button>
      </div>
    )}

      {ouvert && (
        <Modal open onClose={() => setOuvert(false)} title={t.aller} compact>
          <Selecteur vue={vue} anchor={anchor}
            onGoto={(d) => { onGoto(d); setOuvert(false) }} />
        </Modal>
      )}
    </>
  )
}

function Selecteur({ vue, anchor, onGoto }: { vue: VueTemps; anchor: Date; onGoto: (d: Date) => void }) {
  const [annee, setAnnee] = useState(anchor.getFullYear())
  const [mois, setMoisVu] = useState(anchor.getMonth())
  // Année : une page de 12 années autour de celle qu'on regarde.
  const [debut, setDebut] = useState(anchor.getFullYear() - 4)

  const aujourdhui = (
    <button onClick={() => onGoto(new Date())}
      className="btn-ghost flex w-full items-center justify-center gap-2 py-2 text-sm">
      <CalendarCheck size={15} /> Aujourd'hui
    </button>
  )
  const style = (actif: boolean) => `rounded-xl border px-2 py-2 text-sm capitalize transition-colors ${
    actif ? 'border-sun bg-sun/15 text-sun-soft' : 'border-line-2 text-ink-2 hover:bg-panel-2'}`

  if (vue === 'annee') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => setDebut((d) => d - 12)} className="btn-ghost p-2" aria-label="Années précédentes"><ChevronLeft size={16} /></button>
          <span className="text-base font-semibold tabular-nums">{debut} – {debut + 11}</span>
          <button onClick={() => setDebut((d) => d + 12)} className="btn-ghost p-2" aria-label="Années suivantes"><ChevronRight size={16} /></button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 12 }, (_, i) => debut + i).map((y) => (
            <button key={y} onClick={() => onGoto(new Date(y, 0, 1))} aria-pressed={y === anchor.getFullYear()}
              className={`${style(y === anchor.getFullYear())} tabular-nums`}>{y}</button>
          ))}
        </div>
        {aujourdhui}
      </div>
    )
  }

  if (vue === 'semaine') {
    const premier = new Date(annee, mois, 1)
    const semaines = eachWeekOfInterval({ start: premier, end: endOfMonth(premier) }, LUNDI)
    const courante = startOfWeek(anchor, LUNDI)
    const reculer = () => { if (mois === 0) { setMoisVu(11); setAnnee((a) => a - 1) } else setMoisVu((m) => m - 1) }
    const avancer = () => { if (mois === 11) { setMoisVu(0); setAnnee((a) => a + 1) } else setMoisVu((m) => m + 1) }
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={reculer} className="btn-ghost p-2" aria-label="Mois précédent"><ChevronLeft size={16} /></button>
          <span className="text-base font-semibold capitalize">{format(premier, 'MMMM yyyy', { locale: fr })}</span>
          <button onClick={avancer} className="btn-ghost p-2" aria-label="Mois suivant"><ChevronRight size={16} /></button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {semaines.map((d) => (
            <button key={d.toISOString()} onClick={() => onGoto(d)} aria-pressed={isSameDay(d, courante)}
              className={style(isSameDay(d, courante))}>
              {format(d, 'd MMM', { locale: fr })} – {format(endOfWeek(d, LUNDI), 'd MMM', { locale: fr })}
            </button>
          ))}
        </div>
        {aujourdhui}
      </div>
    )
  }

  // Mois, et premier mois du trimestre : la grille des 12 mois.
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={() => setAnnee((a) => a - 1)} className="btn-ghost p-2" aria-label="Année précédente"><ChevronLeft size={16} /></button>
        <span className="text-base font-semibold tabular-nums">{annee}</span>
        <button onClick={() => setAnnee((a) => a + 1)} className="btn-ghost p-2" aria-label="Année suivante"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 12 }, (_, m) => {
          const actif = annee === anchor.getFullYear() && m === anchor.getMonth()
          return (
            <button key={m} onClick={() => onGoto(setMonth(new Date(annee, 0, 1), m))} aria-pressed={actif}
              className={style(actif)}>
              {format(new Date(annee, m, 1), 'MMMM', { locale: fr })}
            </button>
          )
        })}
      </div>
      {aujourdhui}
    </div>
  )
}
