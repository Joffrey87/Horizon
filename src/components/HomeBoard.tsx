import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { GripVertical, Circle, FolderKanban, PinOff } from 'lucide-react'
import { useHorizon } from '../lib/store'
import type { Task } from '../lib/types'
import { useMediaQuery } from '../lib/useMediaQuery'
import { borner, chevauche, degager, placeLibre, ECART, type Pos, type Rect, type Taille } from '../lib/board'

const CARD_W = 224 // largeur des cartes projet (w-56)
const MIN_W = 240 // plus petit qu'un panneau redimensionné
const MIN_H = 120

/** Un panneau déplaçable qui n'est pas un projet (Aujourd'hui, Habitudes…).
 *  Il partage la mécanique et la mémoire de position des cartes projet. */
export interface PanneauAccueil {
  /** Clé de position, stable et distincte des projets (ex. `panneau:aujourdhui`). */
  id: string
  titre: string
  icone: ReactNode
  accent: string
  /** Largeur en pixels, ou `'contenu'` : le panneau épouse son contenu. */
  largeur?: number | 'contenu'
  /** Hauteur maximale (ex. '60%') ; au-delà, le contenu défile. */
  hauteurMax?: string
  defaut?: Pos
  contenu: ReactNode
}


/** Ordre MANUEL du projet : celui que l'utilisateur a fixé en réorganisant la
 *  liste dans la fiche du projet. L'accueil doit montrer cet ordre-là. */
function ordreManuel(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
}

/** Espace visuel de l'accueil : une carte déplaçable par projet actif, montrant
 *  SEULEMENT ses tâches épinglées, dans l'ordre manuel du projet. On épingle
 *  depuis la fiche du projet — l'accueil est une vue de ce sur quoi on se
 *  concentre, pas la liste de tout ce qui reste à faire.
 *  Les positions sont mémorisées dans un layout dédié (projection « accueil »). */
export function HomeBoard({ panneaux = [], onOuvrirProjet }: {
  panneaux?: PanneauAccueil[]
  /** Ouvre la fiche du projet SUR la page hôte. À défaut, on navigue vers Projets. */
  onOuvrirProjet?: (id: string) => void
}) {
  const s = useHorizon()
  const navigate = useNavigate()
  // Téléphone : pas de tuiles posées à la souris, une liste horizontale « magnétique ».
  const etroit = useMediaQuery('(max-width: 767px)')
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; w: number; h: number } | null>(null)
  const redimRef = useRef<{ id: string; sx: number; sy: number; w0: number; h0: number } | null>(null)

  const actifs = useMemo(() => s.projects.filter((p) => p.status === 'actif'), [s.projects])
  const layout = useMemo(() => s.layouts.find((l) => l.projection === 'accueil'), [s.layouts])
  const [positions, setPositions] = useState<Record<string, Pos>>({})
  // Tailles choisies à la main (poignée en bas à droite des panneaux).
  const [sizes, setSizes] = useState<Record<string, Taille>>({})
  // Incrémenté quand une tuile change de taille toute seule (contenu qui
  // grandit) : relance le contrôle de superposition.
  const [mesure, setMesure] = useState(0)
  // Ordre de priorité : panneaux d'abord, puis projets. Une tuile déjà posée
  // ne bouge pas, c'est la suivante qui se range.
  const ordre = useMemo(
    () => [...panneaux.map((p) => p.id), ...actifs.map((p) => `pro-${p.id}`)],
    [panneaux, actifs])

  /** Rectangle réel d'une tuile : position connue + taille mesurée dans le DOM. */
  const rectDe = (id: string, pos: Record<string, Pos> = positions): Rect | null => {
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-carte="${CSS.escape(id)}"]`)
    const p = pos[id]
    if (!el || !p) return null
    return { x: p.x, y: p.y, w: el.offsetWidth, h: el.offsetHeight }
  }
  const autresRects = (sauf: string, pos: Record<string, Pos> = positions): Rect[] =>
    ordre.filter((id) => id !== sauf).flatMap((id) => rectDe(id, pos) ?? [])

  // Positions initiales : mémorisées, sinon disposition par défaut. Les clés
  // sont celles du stockage (`pro-<id>` pour un projet, `panneau:*` sinon) :
  // une seule convention, de bout en bout.
  useEffect(() => {
    const saved = layout?.data.positions ?? {}
    const next: Record<string, Pos> = {}
    for (const pan of panneaux) {
      next[pan.id] = saved[pan.id] ?? pan.defaut ?? { x: 0, y: 0 }
    }
    // Les projets se rangent sous les panneaux tant qu'ils n'ont pas été placés.
    const decalage = panneaux.length ? 250 : 0
    actifs.forEach((p, i) => {
      next[`pro-${p.id}`] = saved[`pro-${p.id}`]
        ?? { x: (i % 4) * (CARD_W + 16), y: decalage + Math.floor(i / 4) * 168 }
    })
    setPositions(next)
    setSizes(layout?.data.sizes ?? {})
    // `panneaux` est reconstruit à chaque rendu du parent : on ne s'y fie pas
    // pour déclencher l'effet, seules les clés comptent.
  }, [layout, actifs, panneaux.map((p) => p.id).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // Le cadre change de taille (fenêtre, barre latérale…) : on ramène les cartes
  // à l'intérieur. Purement visuel — la position enregistrée n'est réécrite
  // qu'au prochain déplacement volontaire.
  useEffect(() => {
    const cadre = containerRef.current
    if (!cadre) return
    const recadrer = () => {
      const box = cadre.getBoundingClientRect()
      setPositions((prev) => {
        let change = false
        const next: Record<string, Pos> = {}
        for (const [id, p] of Object.entries(prev)) {
          const el = cadre.querySelector<HTMLElement>(`[data-carte="${CSS.escape(id)}"]`)
          const b = borner(p.x, p.y, el?.offsetWidth ?? CARD_W, el?.offsetHeight ?? 120, box)
          if (b.x !== p.x || b.y !== p.y) change = true
          next[id] = b
        }
        return change ? next : prev
      })
    }
    const ro = new ResizeObserver(recadrer)
    ro.observe(cadre)
    return () => ro.disconnect()
  }, [])

  // Une tuile dont le contenu grandit (tâche épinglée, jour chargé…) change de
  // taille sans qu'on y touche : on le sait pour re-vérifier les superpositions.
  useEffect(() => {
    const cadre = containerRef.current
    if (!cadre) return
    const ro = new ResizeObserver(() => setMesure((m) => m + 1))
    cadre.querySelectorAll('[data-carte]').forEach((el) => ro.observe(el))
    return () => ro.disconnect()
  }, [ordre])

  // Aucune tuile ne doit en recouvrir une autre : disposition par défaut,
  // fenêtre rétrécie, contenu qui grandit… Purement visuel, comme `recadrer` —
  // la position enregistrée n'est réécrite qu'au prochain déplacement voulu.
  useEffect(() => {
    if (etroit || dragRef.current || redimRef.current) return
    const box = containerRef.current?.getBoundingClientRect()
    const items = ordre.flatMap((id) => {
      const r = rectDe(id)
      return r ? [{ id, ...r }] : []
    })
    const corrige = degager(items, box)
    if (corrige) setPositions((p) => ({ ...p, ...corrige }))
  }, [positions, sizes, mesure, ordre, etroit]) // eslint-disable-line react-hooks/exhaustive-deps

  const savePositions = async (pos: Record<string, Pos>, tailles: Record<string, Taille> = sizes) => {
    const data = { positions: pos, sizes: tailles }
    if (layout) await s.update('layouts', layout.id, { data, updated_at: new Date().toISOString() })
    else await s.insert('layouts', { name: 'Accueil', projection: 'accueil', is_default: false, data })
  }

  const onHandleDown = (e: React.PointerEvent, id: string) => {
    e.preventDefault(); e.stopPropagation()
    const cur = positions[id] ?? { x: 0, y: 0 }
    // La taille RÉELLE de l'élément déplacé : les panneaux sont plus larges que
    // les cartes projet, une borne unique les laisserait dépasser.
    const carte = (e.currentTarget as HTMLElement).parentElement
    dragRef.current = {
      id, sx: e.clientX, sy: e.clientY, ox: cur.x, oy: cur.y,
      w: carte?.offsetWidth ?? CARD_W, h: carte?.offsetHeight ?? 120,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onHandleMove = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return
    const box = containerRef.current?.getBoundingClientRect()
    setPositions((p) => ({
      ...p,
      [d.id]: borner(d.ox + (e.clientX - d.sx), d.oy + (e.clientY - d.sy), d.w, d.h, box),
    }))
  }
  const onHandleUp = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    dragRef.current = null
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    // Lâchée sur une autre tuile : elle va à la place libre la plus proche, ou
    // revient d'où elle est partie s'il n'y en a pas.
    let final = positions
    const moi = rectDe(d.id)
    if (moi && autresRects(d.id).some((o) => chevauche(moi, o, ECART))) {
      const box = containerRef.current?.getBoundingClientRect()
      const libre = placeLibre(moi, autresRects(d.id), box) ?? { x: d.ox, y: d.oy }
      final = { ...positions, [d.id]: libre }
      setPositions(final)
    }
    void savePositions(final)
  }

  // ---- Redimensionnement (poignée en bas à droite d'un panneau) ----
  const onResizeDown = (e: React.PointerEvent, id: string) => {
    e.preventDefault(); e.stopPropagation()
    const carte = (e.currentTarget as HTMLElement).parentElement
    redimRef.current = {
      id, sx: e.clientX, sy: e.clientY, w0: carte?.offsetWidth ?? MIN_W, h0: carte?.offsetHeight ?? MIN_H,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onResizeMove = (e: React.PointerEvent) => {
    const r = redimRef.current; if (!r) return
    const box = containerRef.current?.getBoundingClientRect()
    const moi = rectDe(r.id); if (!moi || !box) return
    const autres = autresRects(r.id)
    const veut = {
      w: Math.max(MIN_W, Math.min(box.width - moi.x, r.w0 + (e.clientX - r.sx))),
      h: Math.max(MIN_H, Math.min(box.height - moi.y, r.h0 + (e.clientY - r.sy))),
    }
    // On grandit jusqu'à toucher une autre tuile, pas au-delà : on essaie la
    // taille voulue, puis chaque axe seul, pour glisser le long d'un obstacle.
    const libre = (t: Taille) => !autres.some((o) => chevauche({ x: moi.x, y: moi.y, ...t }, o, ECART))
    const essais: Taille[] = [veut, { w: veut.w, h: moi.h }, { w: moi.w, h: veut.h }]
    const ok = essais.find(libre)
    if (ok) setSizes((p) => ({ ...p, [r.id]: ok }))
  }
  const onResizeUp = (e: React.PointerEvent) => {
    if (!redimRef.current) return
    redimRef.current = null
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    void savePositions(positions, sizes)
  }

  if (etroit) {
    return (
      <div ref={containerRef} aria-label="Accueil" className="flex h-full snap-x snap-mandatory items-start gap-3 overflow-x-auto overflow-y-hidden pb-2 [scrollbar-width:none]">
        {panneaux.map((pan) => (
          <div key={pan.id} data-carte={pan.id}
            className="flex max-h-full w-[86%] shrink-0 snap-center flex-col overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-white/8 to-black/25 text-white shadow-lg shadow-black/25 backdrop-blur-[3px]">
            <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2" style={{ background: `${pan.accent}22` }}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={{ background: `${pan.accent}33`, color: pan.accent }}>
                {pan.icone}
              </span>
              <p className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">{pan.titre}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3">{pan.contenu}</div>
          </div>
        ))}
        {actifs.map((p) => {
          const color = s.domains.find((d) => d.id === p.domain_id)?.color ?? '#f59e0b'
          const epinglees = ordreManuel(s.tasks.filter((t) => t.project_id === p.id && !t.is_recurring
            && t.home_pinned && (t.status === 'a_faire' || t.status === 'en_cours')))
          return (
            <div key={p.id} data-carte={`pro-${p.id}`}
              className="max-h-full w-[78%] shrink-0 snap-center overflow-y-auto rounded-xl border border-white/15 bg-black/45 text-white shadow-lg shadow-black/30 backdrop-blur-md">
              <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2" style={{ background: `${color}22` }}>
                <FolderKanban size={13} className="shrink-0" style={{ color }} />
                <button type="button" onClick={() => onOuvrirProjet ? onOuvrirProjet(p.id) : navigate('/projets', { state: { openProjectId: p.id } })}
                  className="min-w-0 flex-1 truncate text-left text-sm font-semibold">{p.title}</button>
                <span className="shrink-0 text-[11px] tabular-nums text-white/55">{p.progress}%</span>
              </div>
              <div className="space-y-1.5 p-2.5">
                {epinglees.length === 0 && (
                  <p className="px-1 py-0.5 text-xs text-white/45">Rien d’épinglé. Ouvre le projet pour choisir ce qui compte.</p>
                )}
                {epinglees.map((t) => <TaskLine key={t.id} task={t} color={color} />)}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {/* Panneaux déplaçables (Aujourd'hui, Habitudes…) : même mécanique que les projets. */}
      {panneaux.map((pan) => {
        const pos = positions[pan.id] ?? pan.defaut ?? { x: 0, y: 0 }
        const taille = sizes[pan.id]
        return (
          <div key={pan.id}
            data-carte={pan.id}
            className="absolute flex flex-col overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-white/8 to-black/25 text-white shadow-lg shadow-black/25 backdrop-blur-[3px]"
            // Taille choisie à la main : elle remplace la largeur par défaut et le
            // plafond de hauteur (le contenu défile alors dans le cadre).
            style={{
              left: pos.x, top: pos.y,
              ...(pan.largeur === 'contenu' && !taille
                ? { width: 'max-content', minWidth: MIN_W, maxWidth: '100%' }
                : { width: taille?.w ?? pan.largeur ?? 300 }),
              ...(taille ? { height: taille.h } : { maxHeight: pan.hauteurMax }),
            }}>
            <div onPointerDown={(e) => onHandleDown(e, pan.id)} onPointerMove={onHandleMove} onPointerUp={onHandleUp}
              className="flex shrink-0 touch-none cursor-grab items-center gap-2 border-b border-white/10 px-3 py-2 active:cursor-grabbing"
              style={{ background: `${pan.accent}22` }}>
              <GripVertical size={13} className="shrink-0 text-white/40" />
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                style={{ background: `${pan.accent}33`, color: pan.accent }}>
                {pan.icone}
              </span>
              <p className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">
                {pan.titre}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3">{pan.contenu}</div>
            {/* Poignée de redimensionnement : coin bas droit. */}
            <div onPointerDown={(e) => onResizeDown(e, pan.id)} onPointerMove={onResizeMove} onPointerUp={onResizeUp}
              role="separator" aria-label={`Redimensionner « ${pan.titre} »`} title="Redimensionner"
              className="absolute bottom-0 right-0 flex h-5 w-5 touch-none cursor-nwse-resize items-end justify-end p-1 text-white/40 hover:text-white/80">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <path d="M9 2 2 9M9 6 6 9" />
              </svg>
            </div>
          </div>
        )
      })}

      {actifs.length === 0 && panneaux.length === 0 && (
        <p className="flex h-full items-center justify-center text-sm text-white/50">
          Aucun projet actif à afficher ici.
        </p>
      )}

      {actifs.map((p) => {
        const pos = positions[`pro-${p.id}`] ?? { x: 0, y: 0 }
        const domain = s.domains.find((d) => d.id === p.domain_id)
        const color = domain?.color ?? '#f59e0b'
        // Seules les tâches épinglées remontent ici, dans l'ordre du projet.
        const epinglees = ordreManuel(s.tasks.filter((t) => t.project_id === p.id && !t.is_recurring
          && t.home_pinned && (t.status === 'a_faire' || t.status === 'en_cours')))

        return (
          <div key={p.id} data-carte={`pro-${p.id}`}
            className="absolute rounded-xl border border-white/15 bg-black/45 text-white shadow-lg shadow-black/30 backdrop-blur-md"
            style={{ left: pos.x, top: pos.y, width: CARD_W }}>
            {/* Poignée de déplacement + titre projet */}
            <div onPointerDown={(e) => onHandleDown(e, `pro-${p.id}`)} onPointerMove={onHandleMove} onPointerUp={onHandleUp}
              className="flex touch-none cursor-grab items-center gap-1.5 rounded-t-xl border-b border-white/10 px-2 py-1.5 active:cursor-grabbing"
              style={{ background: `${color}22` }}>
              <GripVertical size={13} className="shrink-0 text-white/40" />
              <FolderKanban size={12} className="shrink-0" style={{ color }} />
              {/* Le titre ouvre le projet au simple clic. Il arrête le pointerdown :
                  sans ça il déclencherait le déplacement de la carte, dont la
                  poignée est toute la barre. On glisse donc par la poignée. */}
              <button type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onOuvrirProjet
                  ? onOuvrirProjet(p.id)
                  : navigate('/projets', { state: { openProjectId: p.id } })}
                title="Ouvrir le projet"
                className="min-w-0 flex-1 cursor-pointer truncate text-left text-xs font-semibold hover:underline">
                {p.title}
              </button>
              <span className="shrink-0 text-[10px] tabular-nums text-white/55">{p.progress}%</span>
            </div>

            <div className="space-y-1 p-2">
              {epinglees.length === 0 && (
                <p className="px-1 py-0.5 text-[11px] text-white/45">
                  Rien d’épinglé. Ouvre le projet pour choisir ce qui compte.
                </p>
              )}
              {epinglees.map((t) => (
                <TaskLine key={t.id} task={t} color={color} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Une ligne épinglée : cocher (fait) pour les tâches, titre, et le bouton qui
 *  la retire de l'accueil — geste inverse de l'épinglage fait dans le projet. */
function TaskLine({ task, color }: { task: Task; color: string }) {
  const s = useHorizon()
  const isEvent = task.is_task === false
  return (
    <div className="group flex items-center gap-1.5 rounded-md px-1 py-0.5" style={{ borderLeft: `2px solid ${color}` }}>
      {isEvent ? (
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} title="Évènement" />
      ) : (
        <button onClick={() => void s.update('tasks', task.id, { status: 'fait', done_at: new Date().toISOString() })}
          className="shrink-0" aria-label="Marquer fait" title="Marquer fait">
          <Circle size={13} className="text-white/45 transition-colors hover:text-sun" />
        </button>
      )}
      <span className="min-w-0 flex-1 truncate text-[11px] text-white/90">{task.title}</span>
      <button onClick={() => void s.update('tasks', task.id, { home_pinned: false })}
        className="shrink-0 text-white/35 opacity-0 transition-opacity hover:text-white/80 group-hover:opacity-100"
        aria-label="Retirer de l'accueil" title="Retirer de l'accueil">
        <PinOff size={13} />
      </button>
    </div>
  )
}
