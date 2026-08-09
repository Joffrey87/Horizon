import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GripVertical, Circle, Eye, EyeOff, FolderKanban } from 'lucide-react'
import { useHorizon } from '../lib/store'
import type { Task } from '../lib/types'

type Pos = { x: number; y: number }

const CARD_W = 224 // largeur des cartes (w-56)
const VISIBLE_MAX = 3 // nb de tâches « visibles » montrées par projet

/** Ordonne les prochaines tâches ouvertes d'un projet : planifiées d'abord (date la
 *  plus proche), puis par échéance, puis par importance/urgence, puis ancienneté. */
function orderTasks(tasks: Task[]): Task[] {
  const key = (t: Task) => [
    t.scheduled_date ?? t.due_date ?? '9999-12-31',
    -((t.importance ?? 0) * 3 + (t.urgence ?? 0) * 2),
  ] as const
  return [...tasks].sort((a, b) => {
    const [ad, ap] = key(a), [bd, bp] = key(b)
    if (ad !== bd) return ad < bd ? -1 : 1
    if (ap !== bp) return ap - bp
    return a.created_at.localeCompare(b.created_at)
  })
}

/** Espace visuel de l'accueil : une carte déplaçable par projet actif, montrant
 *  ses 3 prochaines tâches « visibles ». L'œil masque/révèle une tâche de cet espace.
 *  Les positions sont mémorisées dans un layout dédié (projection « accueil »). */
export function HomeBoard() {
  const s = useHorizon()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null)

  const actifs = useMemo(() => s.projects.filter((p) => p.status === 'actif'), [s.projects])
  const layout = useMemo(() => s.layouts.find((l) => l.projection === 'accueil'), [s.layouts])
  const [positions, setPositions] = useState<Record<string, Pos>>({})
  const [revealed, setRevealed] = useState<Record<string, boolean>>({}) // projets dont on montre les tâches masquées

  // Positions initiales : mémorisées, sinon disposition en grille par défaut.
  useEffect(() => {
    const saved = layout?.data.positions ?? {}
    const next: Record<string, Pos> = {}
    actifs.forEach((p, i) => {
      next[p.id] = saved[`pro-${p.id}`] ?? { x: (i % 4) * (CARD_W + 16), y: Math.floor(i / 4) * 168 }
    })
    setPositions(next)
  }, [layout, actifs])

  const savePositions = async (pos: Record<string, Pos>) => {
    const data = { positions: Object.fromEntries(Object.entries(pos).map(([id, p]) => [`pro-${id}`, p])) }
    if (layout) await s.update('layouts', layout.id, { data, updated_at: new Date().toISOString() })
    else await s.insert('layouts', { name: 'Accueil', projection: 'accueil', is_default: false, data })
  }

  const onHandleDown = (e: React.PointerEvent, id: string) => {
    e.preventDefault(); e.stopPropagation()
    const cur = positions[id] ?? { x: 0, y: 0 }
    dragRef.current = { id, sx: e.clientX, sy: e.clientY, ox: cur.x, oy: cur.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onHandleMove = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return
    const box = containerRef.current?.getBoundingClientRect()
    const maxX = box ? box.width - CARD_W : 9999
    const maxY = box ? box.height - 60 : 9999
    const x = Math.max(0, Math.min(maxX, d.ox + (e.clientX - d.sx)))
    const y = Math.max(0, Math.min(maxY, d.oy + (e.clientY - d.sy)))
    setPositions((p) => ({ ...p, [d.id]: { x, y } }))
  }
  const onHandleUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    dragRef.current = null
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    void savePositions(positions)
  }

  if (actifs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-white/50">Aucun projet actif à afficher ici.</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {actifs.map((p) => {
        const pos = positions[p.id] ?? { x: 0, y: 0 }
        const domain = s.domains.find((d) => d.id === p.domain_id)
        const color = domain?.color ?? '#f59e0b'
        // Tâches ET évènements (ex. neuvaine) ouverts du projet.
        const open = s.tasks.filter((t) => t.project_id === p.id && !t.is_recurring
          && (t.status === 'a_faire' || t.status === 'en_cours'))
        const ordered = orderTasks(open)
        const visible = ordered.filter((t) => !t.home_hidden).slice(0, VISIBLE_MAX)
        const hidden = ordered.filter((t) => t.home_hidden)
        const showHidden = revealed[p.id]

        return (
          <div key={p.id} className="absolute rounded-xl border border-white/15 bg-black/45 text-white shadow-lg shadow-black/30 backdrop-blur-md"
            style={{ left: pos.x, top: pos.y, width: CARD_W }}>
            {/* Poignée de déplacement + titre projet */}
            <div onPointerDown={(e) => onHandleDown(e, p.id)} onPointerMove={onHandleMove} onPointerUp={onHandleUp}
              className="flex touch-none cursor-grab items-center gap-1.5 rounded-t-xl border-b border-white/10 px-2 py-1.5 active:cursor-grabbing"
              style={{ background: `${color}22` }}>
              <GripVertical size={13} className="shrink-0 text-white/40" />
              <FolderKanban size={12} className="shrink-0" style={{ color }} />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold"
                onDoubleClick={() => navigate('/projets', { state: { openProjectId: p.id } })}
                title="Double-clic : ouvrir le projet">{p.title}</span>
              <span className="shrink-0 text-[10px] tabular-nums text-white/55">{p.progress}%</span>
            </div>

            <div className="space-y-1 p-2">
              {visible.length === 0 && hidden.length === 0 && (
                <p className="px-1 py-0.5 text-[11px] text-white/45">Pas de tâche à faire.</p>
              )}
              {visible.map((t) => (
                <TaskLine key={t.id} task={t} color={color} hidden={false} />
              ))}
              {showHidden && hidden.map((t) => (
                <TaskLine key={t.id} task={t} color={color} hidden />
              ))}
              {hidden.length > 0 && (
                <button onClick={() => setRevealed((r) => ({ ...r, [p.id]: !r[p.id] }))}
                  className="mt-0.5 flex w-full items-center justify-center gap-1 rounded-md py-0.5 text-[10px] text-white/45 transition-colors hover:bg-white/5 hover:text-white/70">
                  <EyeOff size={11} /> {showHidden ? 'Masquer' : `${hidden.length} masquée${hidden.length > 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Une ligne de tâche/évènement : cocher (fait) pour les tâches, titre, et l'œil pour masquer/révéler. */
function TaskLine({ task, color, hidden }: { task: Task; color: string; hidden: boolean }) {
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
      <span className={`min-w-0 flex-1 truncate text-[11px] ${hidden ? 'text-white/40 line-through' : 'text-white/90'}`}>{task.title}</span>
      <button onClick={() => void s.update('tasks', task.id, { home_hidden: !task.home_hidden })}
        className="shrink-0 text-white/35 transition-colors hover:text-white/80"
        aria-label={hidden ? 'Réafficher sur l\'accueil' : 'Masquer de l\'accueil'}
        title={hidden ? 'Réafficher sur l\'accueil' : 'Masquer de l\'accueil'}>
        {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </div>
  )
}
