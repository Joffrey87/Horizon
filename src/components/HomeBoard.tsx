import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { GripVertical, Circle, FolderKanban, PinOff } from 'lucide-react'
import { useHorizon } from '../lib/store'
import type { Task } from '../lib/types'
import { borner, type Pos } from '../lib/board'

const CARD_W = 224 // largeur des cartes projet (w-56)

/** Un panneau déplaçable qui n'est pas un projet (Aujourd'hui, Habitudes…).
 *  Il partage la mécanique et la mémoire de position des cartes projet. */
export interface PanneauAccueil {
  /** Clé de position, stable et distincte des projets (ex. `panneau:aujourdhui`). */
  id: string
  titre: string
  icone: ReactNode
  accent: string
  largeur?: number
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
export function HomeBoard({ panneaux = [] }: { panneaux?: PanneauAccueil[] }) {
  const s = useHorizon()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; w: number; h: number } | null>(null)

  const actifs = useMemo(() => s.projects.filter((p) => p.status === 'actif'), [s.projects])
  const layout = useMemo(() => s.layouts.find((l) => l.projection === 'accueil'), [s.layouts])
  const [positions, setPositions] = useState<Record<string, Pos>>({})

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

  const savePositions = async (pos: Record<string, Pos>) => {
    const data = { positions: pos }
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
    if (!dragRef.current) return
    dragRef.current = null
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    void savePositions(positions)
  }

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {/* Panneaux déplaçables (Aujourd'hui, Habitudes…) : même mécanique que les projets. */}
      {panneaux.map((pan) => {
        const pos = positions[pan.id] ?? pan.defaut ?? { x: 0, y: 0 }
        return (
          <div key={pan.id}
            data-carte={pan.id}
            className="absolute flex flex-col overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-white/8 to-black/25 text-white shadow-lg shadow-black/25 backdrop-blur-[3px]"
            style={{ left: pos.x, top: pos.y, width: pan.largeur ?? 300, maxHeight: pan.hauteurMax }}>
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
                onClick={() => navigate('/projets', { state: { openProjectId: p.id } })}
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
