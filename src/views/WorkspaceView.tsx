import { useCallback, useEffect, useState } from 'react'
import {
  ReactFlow, Background, Controls, useNodesState, useEdgesState,
  type Node, type Edge, type NodeProps, Handle, Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { LayoutGrid, Save, Wand2 } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { Modal } from '../components/ui'

type NodeData = {
  label: string; sub?: string; color: string; kind: 'domaine' | 'objectif' | 'projet' | 'habitude' | 'idee'
  progress?: number
}

const KIND_STYLE: Record<NodeData['kind'], string> = {
  domaine: 'text-sm font-semibold px-4 py-2.5',
  objectif: 'text-xs px-3 py-2',
  projet: 'text-xs px-3 py-2',
  habitude: 'text-[11px] px-2.5 py-1.5',
  idee: 'text-[11px] px-2.5 py-1.5 italic',
}

function HorizonNode({ data }: NodeProps) {
  const d = data as NodeData
  return (
    <div className={`max-w-52 rounded-xl border bg-panel ${KIND_STYLE[d.kind]}`}
      style={{ borderColor: `${d.color}${d.kind === 'domaine' ? '' : '55'}` }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color }} />
        <span className="truncate text-ink">{d.label}</span>
      </div>
      {d.sub && <p className="mt-0.5 truncate text-[10px] text-ink-3">{d.sub}</p>}
      {typeof d.progress === 'number' && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-panel-3">
          <div className="h-full rounded-full" style={{ width: `${d.progress}%`, background: d.color }} />
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}

const nodeTypes = { horizon: HorizonNode }

type Filters = { objectifs: boolean; projets: boolean; habitudes: boolean; idees: boolean }
const DEFAULT_FILTERS: Filters = { objectifs: true, projets: true, habitudes: true, idees: false }

/** Espace visuel : penser par la disposition spatiale.
 *  Donnée (unique) ≠ projection (quoi montrer) ≠ layout (comment c'est disposé). */
export function WorkspaceView() {
  const s = useHorizon()
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges] = useEdgesState<Edge>([])
  const [layoutId, setLayoutId] = useState<string>('')
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')

  /* -------- construire les nœuds/arêtes depuis la source de vérité -------- */
  const build = useCallback((positions?: Record<string, { x: number; y: number }>) => {
    const N: Node[] = []
    const E: Edge[] = []
    const pos = (id: string, fallback: { x: number; y: number }) => positions?.[id] ?? fallback

    s.domains.forEach((d, i) => {
      N.push({
        id: `dom-${d.id}`, type: 'horizon', position: pos(`dom-${d.id}`, { x: i * 320, y: 0 }),
        data: { label: d.name, color: d.color, kind: 'domaine' } satisfies NodeData,
      })
      let row = 1
      if (filters.objectifs) {
        s.objectives.filter((o) => o.domain_id === d.id && o.status === 'actif').forEach((o) => {
          N.push({
            id: `obj-${o.id}`, type: 'horizon', position: pos(`obj-${o.id}`, { x: i * 320, y: row++ * 90 }),
            data: { label: o.title, sub: 'objectif', color: d.color, kind: 'objectif' } satisfies NodeData,
          })
          E.push({ id: `e-dom${d.id}-obj${o.id}`, source: `dom-${d.id}`, target: `obj-${o.id}`, style: { stroke: '#3a3129' } })
        })
      }
      if (filters.projets) {
        s.projects.filter((p) => p.domain_id === d.id && (p.status === 'actif' || p.status === 'pause')).forEach((p) => {
          N.push({
            id: `pro-${p.id}`, type: 'horizon', position: pos(`pro-${p.id}`, { x: i * 320 + 40, y: row++ * 90 }),
            data: {
              label: p.title, sub: p.status === 'pause' ? 'projet en pause' : 'projet',
              color: d.color, kind: 'projet', progress: p.progress,
            } satisfies NodeData,
          })
          const parent = filters.objectifs && p.objective_id ? `obj-${p.objective_id}` : `dom-${d.id}`
          E.push({ id: `e-${parent}-pro${p.id}`, source: parent, target: `pro-${p.id}`, style: { stroke: '#3a3129' } })
        })
      }
      if (filters.habitudes) {
        s.habits.filter((h) => h.domain_id === d.id && h.active).forEach((h) => {
          N.push({
            id: `hab-${h.id}`, type: 'horizon', position: pos(`hab-${h.id}`, { x: i * 320 + 80, y: row++ * 90 }),
            data: { label: h.title, sub: 'habitude', color: d.color, kind: 'habitude' } satisfies NodeData,
          })
          E.push({ id: `e-dom${d.id}-hab${h.id}`, source: `dom-${d.id}`, target: `hab-${h.id}`, style: { stroke: '#3a3129', strokeDasharray: '4 3' } })
        })
      }
      if (filters.idees) {
        s.ideas.filter((idea) => idea.domain_id === d.id && idea.status === 'active').forEach((idea) => {
          N.push({
            id: `ide-${idea.id}`, type: 'horizon', position: pos(`ide-${idea.id}`, { x: i * 320 + 120, y: row++ * 90 }),
            data: { label: idea.title, sub: 'idée', color: d.color, kind: 'idee' } satisfies NodeData,
          })
          E.push({ id: `e-dom${d.id}-ide${idea.id}`, source: `dom-${d.id}`, target: `ide-${idea.id}`, style: { stroke: '#3a3129', strokeDasharray: '2 4' } })
        })
      }
    })
    return { N, E }
  }, [s.domains, s.objectives, s.projects, s.habits, s.ideas, filters])

  useEffect(() => {
    const def = s.layouts.find((l) => l.id === layoutId) ?? s.layouts.find((l) => l.is_default)
    const { N, E } = build(def?.data.positions)
    setNodes(N); setEdges(E)
    if (def && !layoutId) setLayoutId(def.id)
  }, [build, s.layouts]) // eslint-disable-line react-hooks/exhaustive-deps

  /* -------- organisations automatiques (l'utilisateur garde la main) -------- */
  const organize = (mode: 'domaine' | 'avancement' | 'carre') => {
    if (mode === 'carre') {
      // « Mettre au carré » : aligner sur une grille sans perdre l'ordre spatial voulu
      const GRID = 40
      setNodes((ns) => ns.map((n) => ({
        ...n,
        position: { x: Math.round(n.position.x / GRID) * GRID, y: Math.round(n.position.y / GRID) * GRID },
      })))
      return
    }
    if (mode === 'domaine') {
      const { N, E } = build(undefined)
      setNodes(N); setEdges(E)
      return
    }
    // par avancement : projets triés par progression, en colonnes 0-33 / 33-66 / 66-100
    setNodes((ns) => {
      const cols: Record<number, number> = { 0: 0, 1: 0, 2: 0 }
      return ns.map((n) => {
        if (!n.id.startsWith('pro-')) return n
        const p = s.projects.find((x) => `pro-${x.id}` === n.id)
        const col = p ? Math.min(2, Math.floor(p.progress / 34)) : 0
        const rank = cols[col] ?? 0
        cols[col] = rank + 1
        const y = 120 + rank * 100
        return { ...n, position: { x: col * 360, y } }
      })
    })
  }

  const saveLayout = async () => {
    const positions: Record<string, { x: number; y: number }> = {}
    nodes.forEach((n) => { positions[n.id] = { x: n.position.x, y: n.position.y } })
    if (layoutId) {
      await s.update('layouts', layoutId, { data: { positions }, updated_at: new Date().toISOString() })
    } else {
      const created = await s.insert<{ id: string }>('layouts', {
        name: saveName.trim() || 'Ma disposition', projection: 'graphe',
        is_default: s.layouts.length === 0, data: { positions },
      })
      if (created) setLayoutId(created.id)
    }
    setSaveOpen(false); setSaveName('')
  }

  return (
    <div className="rise flex h-[calc(100vh-6rem)] flex-col space-y-3 pt-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Espace visuel</h1>
      </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={layoutId} className="field w-auto"
            onChange={(e) => {
              setLayoutId(e.target.value)
              const l = s.layouts.find((x) => x.id === e.target.value)
              const { N, E } = build(l?.data.positions)
              setNodes(N); setEdges(E)
            }}>
            <option value="">Disposition libre</option>
            {s.layouts.map((l) => <option key={l.id} value={l.id}>{l.name}{l.is_default ? ' ★' : ''}</option>)}
          </select>
          <button onClick={() => organize('carre')} className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs"
            title="Aligner proprement sans perdre l'intention">
            <Wand2 size={13} /> Mettre au carré
          </button>
          <button onClick={() => organize('domaine')} className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs">
            <LayoutGrid size={13} /> Par domaine
          </button>
          <button onClick={() => organize('avancement')} className="btn-ghost px-3 py-2 text-xs">Par avancement</button>
          <button onClick={() => (layoutId ? void saveLayout() : setSaveOpen(true))}
            className="btn-sun flex items-center gap-1.5 px-3 py-2 text-xs">
            <Save size={13} /> {layoutId ? 'Enregistrer' : 'Sauvegarder…'}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(filters) as (keyof Filters)[]).map((k) => (
          <button key={k} onClick={() => setFilters({ ...filters, [k]: !filters[k] })}
            className={`rounded-full border px-3 py-1 text-xs capitalize transition-colors ${
              filters[k] ? 'border-sun/50 bg-sun/10 text-sun-soft' : 'border-line-2 text-ink-3'
            }`}>
            {k}
          </button>
        ))}
      </div>

      <div className="card min-h-0 flex-1 overflow-hidden !p-0">
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange}
          nodeTypes={nodeTypes} fitView proOptions={{ hideAttribution: true }}
          colorMode="dark" minZoom={0.15}>
          <Background color="#2e2721" gap={24} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Sauvegarder la disposition">
        <form onSubmit={(e) => { e.preventDefault(); void saveLayout() }} className="space-y-3">
          <input value={saveName} onChange={(e) => setSaveName(e.target.value)}
            placeholder="Nom (ex. Vue stratégique)" className="field" autoFocus />
          <button type="submit" className="btn-sun w-full py-2">Sauvegarder</button>
        </form>
      </Modal>
    </div>
  )
}
