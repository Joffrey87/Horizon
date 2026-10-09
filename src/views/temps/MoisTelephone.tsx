import { useEffect, useMemo, useRef, useState } from 'react'
import {
  eachDayOfInterval, endOfMonth, endOfWeek, format, getISOWeek, isSameMonth, isToday, startOfMonth, startOfWeek,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { Church } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import {
  birthdaysForDay, compareTasksByTitleTime, feastOnDay, firstFridayOrSaturday, iso, spanPart, tasksForDay, todayIso,
} from '../../lib/logic'
import { Modal } from '../../components/ui'
import type { Step, Task } from '../../lib/types'
import { DayCell } from './DayCell'
import { EVENT_DEFAULT_COLOR, remplaProposeOn, stepsForDay, type MoveFn } from './partage'

/** Vue Mois pour téléphone : le mois ENTIER sur un écran, façon agenda de poche.
 *  Chaque semaine est une ligne qui se partage la hauteur ; dans chaque jour, des
 *  lignes colorées (domaine) et, s'il y en a trop, un « +n ». Un appui sur un jour
 *  ouvre son détail complet. Glisser à gauche/droite change de mois. */
const LIGNE = 14 // hauteur d'une ligne d'évènement (px)
const ENTETE = 17 // numéro du jour

type Ligne = { cle: string; texte: string; couleur: string; bande?: boolean; fait?: boolean; icone?: 'messe' | 'fete' }

export function MoisTelephone({ anchor, onShift, onEdit, onCreate, onStep, onMove }: {
  anchor: Date; onShift: (dir: 1 | -1) => void
  onEdit: (t: Task) => void; onCreate: (d: string) => void; onStep: (st: Step) => void; onMove: MoveFn
}) {
  const s = useHorizon()
  const [ouvert, setOuvert] = useState<Date | null>(null)
  const zoneRef = useRef<HTMLDivElement>(null)
  const [hauteur, setHauteur] = useState(0)

  const semaines = useMemo(() => {
    const debut = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 })
    const fin = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 })
    const jours = eachDayOfInterval({ start: debut, end: fin })
    return Array.from({ length: jours.length / 7 }, (_, i) => jours.slice(i * 7, i * 7 + 7))
  }, [anchor])

  useEffect(() => {
    const el = zoneRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setHauteur(el.clientHeight))
    ro.observe(el)
    setHauteur(el.clientHeight)
    return () => ro.disconnect()
  }, [])
  const hLigne = hauteur / semaines.length
  const maxLignes = Math.max(1, Math.floor((hLigne - ENTETE - 2) / LIGNE))

  const couleurDe = (t: Task) =>
    s.domains.find((d) => d.id === (t.domain_id ?? s.projects.find((p) => p.id === t.project_id)?.domain_id))?.color
    ?? EVENT_DEFAULT_COLOR

  /** Les lignes d'un jour, dans l'ordre : bandes multi-jours, fêtes/messes, étapes, reste. */
  const lignesDuJour = (jour: Date): Ligne[] => {
    const d = iso(jour)
    const toutes = [...tasksForDay(s.tasks, jour)].sort(compareTasksByTitleTime)
    const bandes = toutes.filter((t) => spanPart(t, d) !== 'single')
      .sort((a, b) => (a.scheduled_date ?? '').localeCompare(b.scheduled_date ?? '') || a.id.localeCompare(b.id))
    const simples = toutes.filter((t) => spanPart(t, d) === 'single')
    const out: Ligne[] = []
    for (const t of bandes) {
      const part = spanPart(t, d)
      // Le titre s'écrit au début de la bande, et à chaque lundi pour rester lisible.
      const titre = part === 'start' || jour.getDay() === 1
      out.push({ cle: t.id, texte: titre ? t.title : '', couleur: couleurDe(t), bande: true })
    }
    const fete = s.settings?.catholic_feasts !== false ? feastOnDay(jour) : null
    if (fete) out.push({ cle: 'fete', texte: fete, couleur: '#f59e0b', icone: 'fete' })
    const devotion = firstFridayOrSaturday(jour)
    if (devotion && d >= todayIso()) out.push({ cle: 'messe', texte: `Messe · ${devotion}`, couleur: '#a78bfa', icone: 'messe' })
    for (const b of birthdaysForDay(s.birthdays, jour)) {
      out.push({ cle: `b${b.id}`, texte: `🎂 ${b.name}`, couleur: '#ec7f97' })
    }
    for (const st of stepsForDay(s.steps, jour)) {
      out.push({ cle: st.id, texte: st.title, couleur: '#378add' })
    }
    for (const t of simples) {
      out.push({ cle: t.id, texte: t.title, couleur: couleurDe(t), fait: !t.is_recurring && t.status === 'fait' })
    }
    return out
  }

  // Balayage horizontal = mois précédent / suivant.
  const debutTouch = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => { debutTouch.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY } }
  const onTouchEnd = (e: React.TouchEvent) => {
    const d = debutTouch.current; debutTouch.current = null
    if (!d) return
    const dx = e.changedTouches[0]!.clientX - d.x, dy = e.changedTouches[0]!.clientY - d.y
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) onShift(dx < 0 ? 1 : -1)
  }

  return (
    <div className="flex h-full flex-col" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="grid shrink-0 grid-cols-7 border-b border-line-2/40 text-center text-[10px] uppercase tracking-wide text-ink-3">
        {['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map((j) => <span key={j} className="py-0.5">{j}</span>)}
      </div>
      <div ref={zoneRef} className="grid min-h-0 flex-1" style={{ gridTemplateRows: `repeat(${semaines.length}, minmax(0, 1fr))` }}>
        {semaines.map((jours, i) => (
          <div key={i} className="grid min-h-0 grid-cols-7">
            {jours.map((jour) => {
              const dedans = isSameMonth(jour, anchor)
              const auj = isToday(jour)
              const lignes = lignesDuJour(jour)
              const trop = lignes.length > maxLignes
              const montrees = trop ? lignes.slice(0, Math.max(0, maxLignes - 1)) : lignes
              const rempla = remplaProposeOn(s.celesteProposals, iso(jour))
              return (
                <button key={jour.toISOString()} type="button" onClick={() => setOuvert(jour)}
                  aria-label={format(jour, 'EEEE d MMMM', { locale: fr })}
                  className={`flex min-h-0 flex-col overflow-hidden border-b border-r border-line-2/30 text-left ${
                    dedans ? '' : 'opacity-45'} ${auj ? 'bg-sun/10' : ''} ${rempla ? 'outline outline-1 -outline-offset-1 outline-dashed outline-[#ef4444]/80' : ''}`}>
                  <span className={`flex shrink-0 items-baseline gap-0.5 px-0.5 text-[13px] leading-[17px] ${auj ? 'font-semibold text-sun-soft' : 'text-ink-2'}`}>
                    {format(jour, 'd')}
                    {jour.getDay() === 1 && <sup className="text-[8px] text-ink-3">{getISOWeek(jour)}</sup>}
                  </span>
                  {montrees.map((l) => (
                    <span key={l.cle} style={{ background: `${l.couleur}${l.bande ? 'cc' : '55'}`, height: LIGNE }}
                      className={`flex shrink-0 items-center gap-0.5 overflow-hidden whitespace-nowrap px-0.5 text-[10px] leading-[14px] text-white ${
                        l.bande ? '' : 'mt-px rounded-[2px]'} ${l.fait ? 'line-through opacity-60' : ''}`}>
                      {l.icone === 'messe' && <Church size={9} className="shrink-0" />}
                      <span className="truncate">{l.texte}</span>
                    </span>
                  ))}
                  {trop && <span className="px-0.5 text-[10px] leading-[14px] text-ink-3">+{lignes.length - montrees.length}</span>}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Détail du jour : la même carte que sur ordinateur, avec ajout et édition. */}
      {ouvert && (
        <Modal open onClose={() => setOuvert(null)} title={format(ouvert, 'EEEE d MMMM', { locale: fr })} compact>
          <DayCell day={ouvert} emphasize massCross
            onEdit={(t) => { setOuvert(null); onEdit(t) }}
            onCreate={(d) => { setOuvert(null); onCreate(d) }}
            onStep={(st) => { setOuvert(null); onStep(st) }}
            onMove={onMove} />
        </Modal>
      )}
    </div>
  )
}
