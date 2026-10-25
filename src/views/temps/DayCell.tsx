import { useContext, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays, addMonths, format, getISODay, isToday } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Plus, CheckCircle2, Circle, RotateCw, Layers, Star, Church, AlertTriangle, Check, X } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { compareTasksByTitleTime, iso, tasksForDay, recurrenceLabel, spanPart, birthdaysForDay, isMarketParkingDay, feastOnDay, extractEmojis, firstFridayOrSaturday, chosenMassForDay, todayIso, sansHeure } from '../../lib/logic'
import { couleurProjet } from '../../lib/projectIcons'
import { IconeProjet } from '../../components/IconeProjet'
import type { CelesteProposal, Step, Task } from '../../lib/types'
import { MassPickCtx, stepsForDay, dragData, readDrag, survol, veutCopier, EVENT_DEFAULT_COLOR, remplaProposeOn, type MoveFn } from './partage'

// ---- Cellule d'un jour (partagée par 4 semaines) --------------------------

/** Marqueur « rempla proposé » : pointillé rouge + décision sur place.
 *  « Accepter » valide sur Céleste (fonction Edge) ; « Ignorer » écarte la
 *  proposition. Le libellé mène à la page Remplas pour le détail. */
export function RemplaChip({ p }: { p: CelesteProposal }) {
  const celesteAction = useHorizon((st) => st.celesteAction)
  const update = useHorizon((st) => st.update)
  const [busy, setBusy] = useState(false)
  const accepter = async (e: React.MouseEvent) => {
    e.stopPropagation(); setBusy(true)
    const r = await celesteAction('accept', p.id)
    if (!r.ok) useHorizon.setState({ error: `Rempla non accepté : ${r.error ?? 'échec'}` })
    setBusy(false)
  }
  const ignorer = async (e: React.MouseEvent) => {
    e.stopPropagation(); setBusy(true)
    await update('celeste_proposals', p.id, { status: 'ignoree', decided_at: new Date().toISOString() })
    setBusy(false)
  }
  return (
    <div onClick={(e) => e.stopPropagation()}
      className="mb-1 rounded border border-dashed border-[#ef4444]/80 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#ff6b6b]">
      <Link to="/remplas" title={`Rempla ${p.shift_code} ${p.start_time}–${p.end_time}${p.team ? ` · équipe ${p.team}` : ''} — détail`}
        className="block text-center hover:underline">
        Rempla {p.shift_code} ?
      </Link>
      <div className="mt-0.5 flex gap-0.5">
        <button onClick={(e) => void accepter(e)} disabled={busy} title="Accepter sur Céleste"
          className="flex flex-1 items-center justify-center gap-0.5 rounded bg-[#4cc79a]/20 py-0.5 text-[#4cc79a] hover:bg-[#4cc79a]/30 disabled:opacity-40">
          <Check size={9} /> Accepter
        </button>
        <button onClick={(e) => void ignorer(e)} disabled={busy} title="Ignorer"
          className="flex items-center justify-center rounded bg-panel-3 px-1 py-0.5 text-ink-3 hover:text-[#ec7f97] disabled:opacity-40">
          <X size={9} />
        </button>
      </div>
    </div>
  )
}

export function DayCell({ day, sansHoraire, onOpenDay, tint, ruban, rubanCouleur, dim, emphasize, fit, remplir, massCross, onEdit, onCreate, onStep, onMove }: {
  day: Date
  /** Vue Mois : titres sans l'heure, bandes multi-jours continues (titre écrit une fois). */
  sansHoraire?: boolean
  /** Clic sur le fond de la case : ouvre la fenêtre du jour (sinon : créer). */
  onOpenDay?: (d: Date) => void
  tint?: string; emphasize?: boolean; fit?: boolean
  /** Épouse la ligne de la grille (vue Mois) : pas de hauteur minimale, la ligne
   *  grandit avec son contenu — rien n'est jamais coupé. */
  remplir?: boolean
  /** Jour d'un autre mois que celui affiché : grisé (reprend toute sa force au survol). */
  dim?: boolean
  /** Ruban en haut à droite (ex. « → Novembre » sur le 1er du mois). */
  ruban?: string; rubanCouleur?: string
  /** Affiche toujours la croix « trouver une messe » (accueil), même hors fête. */
  massCross?: boolean
  onEdit: (t: Task) => void; onCreate: (d: string) => void; onStep: (st: Step) => void; onMove: MoveFn
}) {
  const s = useHorizon()
  const openMassPicker = useContext(MassPickCtx)
  const [over, setOver] = useState(false)
  const today = isToday(day)
  const dayIso = iso(day)
  const rempla = remplaProposeOn(s.celesteProposals, dayIso)
  const all = [...tasksForDay(s.tasks, day)].sort(compareTasksByTitleTime)
  // Évènements multi-jours (vacances…) : bandes continues épinglées en haut ; le reste dans le flux.
  const spans = all.filter((t) => spanPart(t, dayIso) !== 'single')
    .sort((a, b) => (a.scheduled_date ?? '').localeCompare(b.scheduled_date ?? '') || a.id.localeCompare(b.id))
  const list = all.filter((t) => spanPart(t, dayIso) === 'single')
  const steps = stepsForDay(s.steps, day)
  const birthdays = birthdaysForDay(s.birthdays, day)
  const feast = s.settings?.catholic_feasts !== false ? feastOnDay(day) : null
  // Messe de dévotion (1er vendredi/samedi) sur les 6 prochains mois — choisie ou non.
  const rawMass = firstFridayOrSaturday(day)
  const massLabel = rawMass && dayIso >= todayIso() && day <= addMonths(new Date(), 6) ? rawMass : null
  const chosenMass = massLabel ? chosenMassForDay(s.checks, dayIso) : null
  // Croix ✝ « trouver une messe » : sur chaque jour, sauf ceux qui portent déjà le
  // bouton de dévotion (1er vendredi/samedi) — il ouvre déjà le même sélecteur.
  const showCross = feast !== null || massCross === true || !massLabel
  const crossMass = showCross ? chosenMassForDay(s.checks, dayIso) : null

  const handleVoid = (e: React.MouseEvent<HTMLElement>) => {
    if (e.target === e.currentTarget) { if (onOpenDay) onOpenDay(day); else onCreate(iso(day)) }
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setOver(false)
    const d = readDrag(e); if (d) onMove(d.kind, d.id, iso(day), veutCopier(e))
  }

  return (
    <div
      onDragOver={(e) => { survol(e); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      onClick={handleVoid}
      style={{ backgroundColor: !today && !over ? tint : undefined }}
      className={`relative flex cursor-pointer flex-col ${sansHoraire ? 'rounded-none border-0 border-b border-r p-1' : 'rounded-lg border p-1.5'} transition-[colors,opacity] ${remplir ? 'min-h-0' : 'min-h-28'} ${fit ? 'w-max max-w-full' : ''} ${dim && !today ? 'opacity-50 hover:opacity-100' : ''} ${
        rempla ? 'border-dashed border-[#ef4444]/80' : today ? `border-sun/50 bg-sun/5${sansHoraire ? ' z-10 ring-1 ring-inset ring-sun/70' : ''}` : over ? 'border-sun/70 bg-sun/10' : sansHoraire ? 'border-line-2/50 hover:bg-panel-2/40' : 'border-line-2/60 hover:bg-panel-2/40'
      }`}>
      {ruban && (
        <span className="pointer-events-none absolute right-0 top-0 z-10 rounded-bl-lg rounded-tr-lg px-2 py-0.5 text-[10px] font-bold text-bg"
          style={{ background: rubanCouleur }}>{ruban}</span>
      )}
      <header className="mb-1 flex items-center justify-between gap-1" onClick={(e) => e.stopPropagation()}>
        <p className={`${sansHoraire ? 'text-[10px]' : 'text-xs'} font-medium capitalize ${today ? 'text-sun-soft' : emphasize ? 'text-white/85' : 'text-ink-3'}`}>
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
            if (sansHoraire) {
              // Façon Google : une barre pleine continue, le titre écrit une seule fois
              // (au début de la bande, ou au lundi si elle vient de la semaine d'avant).
              const debutLigne = part === 'start' || weekStart
              const finTitre = t.end_date ?? dayIso
              let n = 1
              for (let k = getISODay(day) + 1; k <= 7; k++) { if (iso(addDays(day, k - getISODay(day))) <= finTitre) n++; else break }
              return (
                <div key={t.id} className="relative h-5">
                  <button {...drag} onClick={edit} title={t.title} className="absolute inset-y-0 block"
                    style={{ left: 0, right: openRight ? -9 : 0, background: `${fill}c2`, ...rad }} />
                  {debutLigne && (
                    <span className={`pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center overflow-hidden whitespace-nowrap px-1.5 text-[9px] font-medium leading-none text-ink ${vacation ? 'line-through' : ''}`}
                      style={{ width: `calc(${n * 100}% + ${(n - 1) * 9}px)` }}>
                      <span className="overflow-hidden text-clip">{sansHeure(t.title)}</span>
                    </span>
                  )}
                </div>
              )
            }
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
      {rempla && <RemplaChip p={rempla} />}
      {isMarketParkingDay(s.tasks, day) && (
        <div onClick={(e) => e.stopPropagation()}
          title="Dimanche travaillé (début < 15h) — marché dominical & stationnement compliqués"
          className="mb-1 flex items-center justify-center gap-1 rounded bg-[#ef4444]/20 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#ff6b6b] ring-1 ring-[#ef4444]/40">
          <AlertTriangle size={10} /> Marché / Parking
        </div>
      )}
      <div className={`min-h-0 flex-1 ${remplir ? 'space-y-0.5' : 'space-y-1'}`} onClick={handleVoid}>
        {steps.map((st) => (
          <button key={st.id} draggable onDragStart={dragData('step', st.id)}
            onClick={(e) => { e.stopPropagation(); onStep(st) }}
            title={`Étape : ${st.title}`}
            className={`flex w-full items-center gap-1 truncate rounded bg-info/15 px-1 ${remplir ? 'py-px' : 'py-0.5'} text-left text-[10px] text-[#6fcf97] transition-colors hover:bg-info/25`}>
            <Layers size={10} className="shrink-0" />
            <span className="truncate font-medium">{st.title}</span>
          </button>
        ))}
        {list.map((t) => {
          const project = t.project_id ? s.projects.find((p) => p.id === t.project_id) : undefined
          const domain = s.domains.find((d) => d.id === (t.domain_id ?? project?.domain_id))
          const c = couleurProjet(project, s.domains) ?? domain?.color
          const isEvent = t.is_task === false
          const done = !t.is_recurring && !isEvent && t.status === 'fait'
          const vacation = / - Vf?$/.test(t.title) // garde posée en congé (V / Vf) → barrée
          const struck = done || vacation
          const checkMass = t.notes?.startsWith('source:check') ?? false // messe issue d'une vérification
          return (
            <div key={t.id} className={`group flex items-start gap-1 rounded px-1 ${remplir ? 'py-px' : 'py-0.5'}`}
              style={{
                background: checkMass ? 'rgba(167,139,250,0.14)' : c ? `${c}2b` : 'var(--color-panel-3)',
                // Liseret = projet seulement ; une tâche de domaine n'en a pas.
                border: !checkMass && project && c ? `1.5px solid ${c}` : undefined,
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
                <span className={`${sansHoraire ? 'text-[9px]' : 'text-[11px]'} ${remplir ? 'leading-[15px]' : 'leading-tight'} ${fit ? 'whitespace-nowrap' : sansHoraire ? 'block overflow-hidden whitespace-nowrap text-clip' : 'block truncate'} ${struck ? 'text-ink-3 line-through' : 'text-ink'}`}>
                  {checkMass && <Church size={9} className="mr-0.5 inline text-[#a78bfa]" />}
                  {project && <IconeProjet project={project} size={11} className="mr-1 align-[-1px]" />}
                  {t.notable && <Star size={9} className="mr-0.5 inline text-sun" />}{sansHoraire ? sansHeure(t.title) : t.title}
                </span>
              </button>
            </div>
          )
        })}
        {list.length === 0 && steps.length === 0 && <p className="pt-1 text-center text-[10px] text-ink-3">—</p>}
      </div>
    </div>
  )
}
