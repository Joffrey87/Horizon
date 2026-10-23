import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { addDays, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, MapPin, Pencil, Plus, X } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { birthdaysForDay, compareTasksByTitleTime, extractHourMinute, feastOnDay, iso, sansHeure, spanPart, tasksForDay } from '../../lib/logic'
import type { Step, Task } from '../../lib/types'
import { EVENT_DEFAULT_COLOR, stepsForDay } from './partage'
import { clicDansLeVide, estBalayage } from '../../lib/tacheForm'

const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(m % 60).padStart(2, '0')}`
}

/** Fenêtre « journée en grand » : bandeau « Toute la journée », puis les
 *  évènements à heure en briques de même hauteur, sans les trous de l'horaire.
 *  Plein écran sur téléphone, grande fenêtre centrée sur ordinateur.
 *  ‹ › / flèches du clavier / balayage changent de jour ; Échap ferme. */
export function JourFenetre({ day, onDay, onClose, onEdit, onCreate, onStep, lecture }: {
  day: Date; onDay: (d: Date) => void; onClose: () => void
  onEdit: (t: Task) => void; onCreate: (d: string) => void; onStep: (st: Step) => void; lecture?: boolean
}) {
  const s = useHorizon()
  const [deplie, setDeplie] = useState<string | null>(null)
  useEffect(() => setDeplie(null), [day])
  const d = iso(day)
  const domaineDe = (t: Task) =>
    s.domains.find((x) => x.id === (t.domain_id ?? s.projects.find((p) => p.id === t.project_id)?.domain_id))
  const toutes = [...tasksForDay(s.tasks, day)].sort(compareTasksByTitleTime)
  const aHeure = toutes.filter((t) => spanPart(t, d) === 'single' && extractHourMinute(t.title))
  const journee = toutes.filter((t) => !aHeure.includes(t))
  const steps = stepsForDay(s.steps, day)
  const anniv = birthdaysForDay(s.birthdays, day)
  const fete = s.settings?.catholic_feasts !== false ? feastOnDay(day) : null
  const total = toutes.length + steps.length

  const dayRef = useRef(day); dayRef.current = day
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null
      if (cible && /INPUT|TEXTAREA|SELECT/.test(cible.tagName)) return
      if (document.querySelectorAll('.fixed.inset-0.z-50').length > 1) return // un formulaire est ouvert par-dessus
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') onDay(addDays(dayRef.current, -1))
      else if (e.key === 'ArrowRight') onDay(addDays(dayRef.current, 1))
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose, onDay])

  const t0 = useRef<{ x: number; y: number } | null>(null)
  // Fin d'un balayage : le « clic » qui peut le suivre ne doit pas créer d'évènement.
  const balayeJusqua = useRef(0)
  const touchStart = (e: React.TouchEvent) => { t0.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY } }
  const touchEnd = (e: React.TouchEvent) => {
    const a = t0.current; t0.current = null
    if (!a || window.getSelection()?.toString()) return
    const dx = e.changedTouches[0]!.clientX - a.x, dy = e.changedTouches[0]!.clientY - a.y
    if (estBalayage(dx, dy)) balayeJusqua.current = Date.now() + 500
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) onDay(addDays(day, dx < 0 ? 1 : -1))
  }

  // Toucher le vide de la journée ouvre la création, comme le « + » (pas en lecture).
  const toucheLeVide = (e: React.MouseEvent) => {
    if (lecture || !clicDansLeVide(e.target, e.currentTarget)) return
    if (Date.now() < balayeJusqua.current || window.getSelection()?.toString()) return
    onCreate(d)
  }

  const fleche = 'grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.07] text-sun transition-colors hover:bg-white/[0.13]'
  const lab = 'mb-1 ml-1 text-[10px] uppercase tracking-[0.1em] text-ink-3'

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:flex md:items-center md:justify-center md:p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} onTouchStart={touchStart} onTouchEnd={touchEnd}
        role="dialog" aria-label={format(day, 'EEEE d MMMM yyyy', { locale: fr })}
        className="rise relative flex h-full w-full flex-col overflow-hidden bg-[rgba(15,13,10,0.86)] backdrop-blur-xl md:h-auto md:max-h-[96dvh] md:max-w-2xl md:rounded-2xl md:border md:border-white/10">
        <header className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-8">
          <button onClick={() => onDay(addDays(day, -1))} className={fleche} aria-label="Jour précédent"><ChevronLeft size={20} /></button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[19px] font-bold capitalize leading-tight">{format(day, 'EEEE d MMMM', { locale: fr })}</p>
            <p className="text-[12px] text-ink-2">{format(day, 'yyyy')} · {total} événement{total > 1 ? 's' : ''}</p>
          </div>
          <button onClick={() => onDay(addDays(day, 1))} className={fleche} aria-label="Jour suivant"><ChevronRight size={20} /></button>
        </header>
        <div className="absolute right-2 top-1 flex gap-1">
          {!lecture && (
            <button onClick={() => onCreate(d)} className="rounded-lg p-1.5 text-ink-3 hover:text-sun" aria-label="Ajouter un événement" title="Ajouter"><Plus size={16} /></button>
          )}
        </div>
        <button onClick={onClose} className="absolute left-2 top-1 rounded-lg p-1.5 text-ink-3 hover:text-ink" aria-label="Fermer" title="Fermer (Échap)"><X size={16} /></button>

        <div onClick={toucheLeVide} className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {(journee.length > 0 || steps.length > 0 || anniv.length > 0 || fete) && <>
            <p className={lab}>Toute la journée</p>
            <div onClick={toucheLeVide} className="mb-2.5 flex flex-wrap gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.05] p-1.5">
              {fete && <span className="rounded-lg border-l-4 border-sun bg-sun/25 px-2 py-1 text-[12px] font-semibold">✝ {fete}</span>}
              {anniv.map((b) => <span key={b.id} className="rounded-lg border-l-4 border-[#ec7f97] bg-[#ec7f97]/25 px-2 py-1 text-[12px] font-semibold">🎂 {b.name}</span>)}
              {steps.map((st) => (
                <button key={st.id} onClick={() => onStep(st)} className="rounded-lg border-l-4 border-[#a78bfa] bg-[#a78bfa]/25 px-2.5 py-1.5 text-left text-[13px] font-semibold">{st.title}</button>
              ))}
              {journee.map((t) => {
                const c = domaineDe(t)?.color ?? EVENT_DEFAULT_COLOR
                return (
                  <button key={t.id} onClick={() => !lecture && onEdit(t)} title={t.notes ?? undefined}
                    className="min-w-[8rem] flex-1 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-semibold"
                    style={{ background: `${c}40`, borderLeft: `4px solid ${c}` }}>{sansHeure(t.title)}</button>
                )
              })}
            </div>
          </>}

          <p className={lab}>Programme</p>
          {aHeure.length === 0 && <p onClick={toucheLeVide} className="ml-1 text-sm text-ink-3">Aucun événement à heure fixe.</p>}
          <div onClick={toucheLeVide} className="flex flex-col gap-1.5">
            {aHeure.map((t) => {
              const h = extractHourMinute(t.title)!
              const debut = h.hour * 60 + h.minute
              const dom = domaineDe(t)
              const c = dom?.color ?? EVENT_DEFAULT_COLOR
              const ouvert = deplie === t.id
              return (
                <div key={t.id}
                  onClick={() => (t.notes && !lecture ? setDeplie(ouvert ? null : t.id) : !lecture && onEdit(t))}
                  className={`flex cursor-pointer gap-2.5 overflow-hidden rounded-xl border border-white/[0.08] bg-[rgba(33,28,22,0.78)] px-2.5 py-2 transition-colors hover:bg-[rgba(42,35,28,0.9)] ${ouvert ? 'min-h-[68px]' : 'h-[68px]'}`}
                  style={{ borderLeft: `5px solid ${c}` }}>
                  <div className="flex w-12 shrink-0 flex-col border-r border-white/[0.08] leading-tight">
                    <b className="text-[15px] text-sun">{hhmm(debut)}</b>
                    {t.duration_min ? <span className="mt-0.5 text-[12px] text-ink-3">{hhmm(debut + t.duration_min)}</span> : null}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                    <div className="flex items-center gap-2">
                      <p className={`min-w-0 flex-1 truncate text-[15px] font-bold leading-tight ${t.status === 'fait' && t.is_task ? 'text-ink-3 line-through' : ''}`}>{sansHeure(t.title)}</p>
                      {!lecture && (
                        <button onClick={(e) => { e.stopPropagation(); onEdit(t) }} className="shrink-0 p-0.5 text-ink-3 hover:text-sun" aria-label="Modifier"><Pencil size={13} /></button>
                      )}
                    </div>
                    <p className="truncate text-[11.5px] leading-tight text-ink-2">
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: c }} />
                      {dom?.name ?? 'Sans domaine'}
                      {t.location && <> · <MapPin size={11} className="inline align-[-1px]" /> {t.location}</>}
                    </p>
                    {t.notes && (
                      <p onClick={(e) => { if (ouvert) e.stopPropagation() }}
                        className={`${ouvert ? 'cursor-text' : 'cursor-pointer'} select-text text-[11.5px] leading-tight text-ink-3 [user-select:text] ${ouvert ? 'whitespace-pre-wrap' : 'truncate'}`}>
                        {t.notes}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
