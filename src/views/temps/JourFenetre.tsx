import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { addDays, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, MapPin, Pencil, Plus, X } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { birthdaysForDay, compareTasksByTitleTime, extractHourMinute, feastOnDay, iso, sansHeure, spanPart, tasksForDay, titreAvecHeure } from '../../lib/logic'
import type { Step, Task } from '../../lib/types'
import { EVENT_DEFAULT_COLOR, stepsForDay } from './partage'
import { clicDansLeVide, estBalayage } from '../../lib/tacheForm'
import { notesVisibles } from '../../lib/semaine'
import { cleBrique, usePositionsBriques } from './positionsBriques'

/** Glisser une brique du programme : 8 px = un cran de 15 min. */
const PX_CRAN = 8

const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(m % 60).padStart(2, '0')}`
}

/** Barre de couleur à gauche d'une tâche : en pointillé (pleine une fois faite) ; un appui la coche / décoche. */
function BarreTache({ couleur, fait, actif, onBascule }: { couleur: string; fait: boolean; actif: boolean; onBascule: () => void }) {
  const barre = (
    <span className="block h-full w-[5px] rounded-full"
      style={{ background: fait ? couleur : `repeating-linear-gradient(to bottom, ${couleur} 0 6px, transparent 6px 10px)` }} />
  )
  const classe = '-my-2 -ml-2.5 w-4 shrink-0 self-stretch pl-1'
  return actif
    ? <button type="button" onClick={(e) => { e.stopPropagation(); onBascule() }} className={`${classe} cursor-pointer`}
        aria-label={fait ? 'Marquer à faire' : 'Marquer fait'} title={fait ? 'Marquer à faire' : 'Marquer fait'}>{barre}</button>
    : <span className={classe} aria-hidden>{barre}</span>
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
  // Un évènement sans heure peut être posé dans le programme : seule sa place d'affichage change (layout `temps-briques`,
  // le même que les briques déplacées de la vue Semaine), il reste sans heure.
  const { positions, placer } = usePositionsBriques()
  const placeDe = (t: Task) => (spanPart(t, d) === 'single' ? positions[cleBrique(t.id, d)] : undefined)
  const journee = toutes.filter((t) => !aHeure.includes(t) && placeDe(t) === undefined)
  const programme = [
    ...aHeure.map((t) => { const h = extractHourMinute(t.title)!; return { t, debut: h.hour * 60 + h.minute, heure: true } }),
    ...toutes.filter((t) => !aHeure.includes(t) && placeDe(t) !== undefined).map((t) => ({ t, debut: placeDe(t)! * 30, heure: false })),
  ].sort((a, b) => a.debut - b.debut)
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

  // Glisser-déplacer (doigt ou souris). Dans le programme, par la colonne de l'heure : haut/bas = l'heure change par
  // crans de 15 min (un évènement posé sans heure ne change que de place). Un évènement « Toute la journée » glissé
  // dans le programme y prend place ; une brique sans heure ramenée sur le bandeau y retourne.
  const [drag, setDrag] = useState<{ id: string; x0: number; y0: number; debut: number; heure: boolean; dx: number; dy: number; bandeau: boolean } | null>(null)
  const aGlisse = useRef(false)
  const bandeauRef = useRef<HTMLDivElement>(null)
  const progRef = useRef<HTMLDivElement>(null)
  const debutDrag = (e: React.PointerEvent, t: Task, debut: number, heure: boolean, bandeau: boolean) => {
    if (lecture || t.is_recurring || e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    aGlisse.current = false
    setDrag({ id: t.id, x0: e.clientX, y0: e.clientY, debut, heure, dx: 0, dy: 0, bandeau })
  }
  const bougeDrag = (e: React.PointerEvent) => {
    if (!drag) return
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0
    if (Math.abs(dx) + Math.abs(dy) > 4) aGlisse.current = true
    setDrag({ ...drag, dx, dy })
  }
  const nouveauDebut = (g: NonNullable<typeof drag>) => Math.min(23 * 60 + 45, Math.max(0, g.debut + Math.round(g.dy / PX_CRAN) * 15))
  const dans = (el: HTMLElement | null | undefined, x: number, y: number) => {
    const r = el?.getBoundingClientRect()
    return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
  }
  const finDrag = (e: React.PointerEvent) => {
    const g = drag
    setDrag(null)
    if (!g || !aGlisse.current) return
    const t = toutes.find((x) => x.id === g.id)
    if (!t) return
    const cle = cleBrique(t.id, d)
    if (g.bandeau) {
      if (!dans(progRef.current, e.clientX, e.clientY)) return
      // Posé à côté de la brique visée (juste après si on lâche sur sa moitié basse) ; programme vide : 8h.
      const visee = [...(progRef.current?.querySelectorAll<HTMLElement>('[data-debut]') ?? [])].find((el) => dans(el, e.clientX, e.clientY))
      const r = visee?.getBoundingClientRect()
      const dernier = programme[programme.length - 1]
      const base = visee ? Number(visee.dataset.debut) + (r && e.clientY > r.top + r.height / 2 ? 15 : -15) : dernier ? dernier.debut + 60 : 8 * 60
      placer(cle, Math.min(23 * 60 + 45, Math.max(0, base)) / 30)
      return
    }
    if (!g.heure && dans(bandeauRef.current, e.clientX, e.clientY)) { placer(cle, null); return }
    const n = nouveauDebut(g)
    if (n === g.debut) return
    if (g.heure) void s.update('tasks', t.id, { title: titreAvecHeure(t.title, n) })
    else placer(cle, n / 30)
  }
  const glisseHandlers = { onPointerMove: bougeDrag, onPointerUp: finDrag, onPointerCancel: () => setDrag(null) }

  // Tâche (pas un évènement, pas une récurrence) : sa barre de couleur la coche / décoche.
  const cochable = (t: Task) => t.is_task !== false && !t.is_recurring
  const basculer = (t: Task) => {
    if (lecture) return
    void s.update('tasks', t.id, t.status === 'fait' ? { status: 'a_faire', done_at: null } : { status: 'fait', done_at: new Date().toISOString() })
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
          {(journee.length > 0 || steps.length > 0 || anniv.length > 0 || fete || (drag && !drag.heure && !drag.bandeau)) && <>
            <p className={lab}>Toute la journée</p>
            <div ref={bandeauRef} onClick={toucheLeVide} className="mb-2.5 flex min-h-[38px] flex-wrap gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.05] p-1.5">
              {fete && <span className="rounded-lg border-l-4 border-sun bg-sun/25 px-2 py-1 text-[12px] font-semibold">✝ {fete}</span>}
              {anniv.map((b) => <span key={b.id} className="rounded-lg border-l-4 border-[#ec7f97] bg-[#ec7f97]/25 px-2 py-1 text-[12px] font-semibold">🎂 {b.name}</span>)}
              {steps.map((st) => (
                <button key={st.id} onClick={() => onStep(st)} className="rounded-lg border-l-4 border-[#a78bfa] bg-[#a78bfa]/25 px-2.5 py-1.5 text-left text-[13px] font-semibold">{st.title}</button>
              ))}
              {journee.map((t) => {
                const c = domaineDe(t)?.color ?? EVENT_DEFAULT_COLOR
                const tache = cochable(t)
                const fait = t.status === 'fait' && t.is_task !== false
                const ouvert = deplie === t.id
                const notes = notesVisibles(t.notes)
                return (
                  <div key={t.id}
                    className={`flex min-w-[8rem] flex-1 items-stretch gap-2 rounded-lg px-2.5 py-1.5 ${drag?.id === t.id ? 'relative z-20 opacity-80 shadow-lg shadow-black/50' : ''}`}
                    style={{ background: `${c}40`, ...(tache ? {} : { borderLeft: `4px solid ${c}` }), transform: drag?.id === t.id ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined }}>
                    {tache && <BarreTache couleur={c} fait={fait} actif={!lecture} onBascule={() => basculer(t)} />}
                    <button onClick={() => { if (!aGlisse.current) setDeplie(ouvert ? null : t.id) }}
                      onPointerDown={(e) => debutDrag(e, t, 0, false, true)} {...glisseHandlers}
                      className="min-w-0 flex-1 touch-none text-left text-[13px] font-semibold">
                      <span className={`block ${ouvert ? '' : 'truncate'} ${fait ? 'text-ink-3 line-through' : ''}`}>{sansHeure(t.title)}</span>
                      {ouvert && (t.location || notes) && (
                        <span className="mt-0.5 block whitespace-pre-wrap text-[11.5px] font-normal leading-tight text-ink-2">
                          {t.location && <><MapPin size={11} className="inline align-[-1px]" /> {t.location}{notes ? ' · ' : ''}</>}{notes}
                        </span>
                      )}
                    </button>
                    {!lecture && (
                      <button onClick={() => onEdit(t)} className="shrink-0 self-start p-0.5 text-ink-3 hover:text-sun" aria-label="Modifier"><Pencil size={13} /></button>
                    )}
                  </div>
                )
              })}
            </div>
          </>}

          <p className={lab}>Programme</p>
          <div ref={progRef} onClick={toucheLeVide} className="flex min-h-[68px] flex-col gap-1.5">
            {programme.length === 0 && <p onClick={toucheLeVide} className="ml-1 text-sm text-ink-3">Aucun événement à heure fixe.</p>}
            {programme.map(({ t, debut, heure }) => {
              const glisse = drag?.id === t.id ? drag : null
              const affiche = glisse ? nouveauDebut(glisse) : debut
              const dom = domaineDe(t)
              const c = dom?.color ?? EVENT_DEFAULT_COLOR
              const ouvert = deplie === t.id
              const tache = cochable(t)
              const fait = t.status === 'fait' && t.is_task !== false
              return (
                <div key={t.id} data-debut={debut}
                  onClick={() => { if (!aGlisse.current) setDeplie(ouvert ? null : t.id) }}
                  className={`flex cursor-pointer gap-2.5 overflow-hidden rounded-xl border bg-[rgba(33,28,22,0.78)] px-2.5 py-2 transition-colors hover:bg-[rgba(42,35,28,0.9)] ${heure ? 'border-white/[0.08]' : 'border-dashed border-white/20'} ${ouvert ? 'min-h-[68px]' : 'h-[68px]'} ${glisse ? 'relative z-20 shadow-lg shadow-black/50' : ''}`}
                  style={{ ...(tache ? {} : { borderLeft: `5px solid ${c}` }), transform: glisse ? `translateY(${glisse.dy}px)` : undefined }}>
                  {tache && <BarreTache couleur={c} fait={fait} actif={!lecture} onBascule={() => basculer(t)} />}
                  {/* Colonne de l'heure = poignée : glisser vers le haut ou le bas. */}
                  <div onPointerDown={(e) => debutDrag(e, t, debut, heure, false)} {...glisseHandlers}
                    title={lecture || t.is_recurring ? undefined : heure ? "Glisser pour changer l'heure" : 'Glisser pour déplacer (reste sans heure)'}
                    className={`flex w-12 shrink-0 flex-col border-r border-white/[0.08] leading-tight ${lecture || t.is_recurring ? '' : 'cursor-ns-resize touch-none'}`}>
                    {heure ? <>
                      <b className="text-[15px] text-sun">{hhmm(affiche)}</b>
                      {t.duration_min ? <span className="mt-0.5 text-[12px] text-ink-3">{hhmm(affiche + t.duration_min)}</span> : null}
                    </> : <span className="text-[11px] italic text-ink-3">sans heure</span>}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                    <div className="flex items-center gap-2">
                      <p className={`min-w-0 flex-1 ${ouvert ? '' : 'truncate'} text-[15px] font-bold leading-tight ${fait ? 'text-ink-3 line-through' : ''}`}>{sansHeure(t.title)}</p>
                      {!lecture && (
                        <button onClick={(e) => { e.stopPropagation(); onEdit(t) }} className="shrink-0 p-0.5 text-ink-3 hover:text-sun" aria-label="Modifier"><Pencil size={13} /></button>
                      )}
                    </div>
                    <p className="truncate text-[11.5px] leading-tight text-ink-2">
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: c }} />
                      {dom?.name ?? 'Sans domaine'}
                      {t.location && <> · <MapPin size={11} className="inline align-[-1px]" /> {t.location}</>}
                    </p>
                    {notesVisibles(t.notes) && (
                      <p onClick={(e) => { if (ouvert) e.stopPropagation() }}
                        className={`${ouvert ? 'cursor-text' : 'cursor-pointer'} select-text text-[11.5px] leading-tight text-ink-3 [user-select:text] ${ouvert ? 'whitespace-pre-wrap' : 'truncate'}`}>
                        {notesVisibles(t.notes)}
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
