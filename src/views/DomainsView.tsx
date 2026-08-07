import { useState } from 'react'
import { Plus, Pencil, Target } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { Card, Badge, DomainDot, Modal, EmptyState } from '../components/ui'
import type { Domain, Objective, ObjectiveHorizon } from '../lib/types'

const HORIZON_LABEL: Record<ObjectiveHorizon, string> = {
  court_terme: 'Court terme (30 j)', trimestriel: 'Trimestriel', annuel: 'Annuel',
  long_terme: 'Long terme (3-5 ans)', libre: 'Libre',
}

const PALETTE = ['#d97706', '#0d9488', '#8b5cf6', '#dc4a6b', '#3987e5', '#65a30d']

export function DomainsView() {
  const s = useHorizon()
  const [editDomain, setEditDomain] = useState<Domain | 'new' | null>(null)
  const [editObjective, setEditObjective] = useState<{ obj: Objective | null; domainId: string } | null>(null)

  return (
    <div className="rise space-y-4 pt-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Domaines & objectifs</h1>
          <p className="text-sm text-ink-3">Où va ma vie, et quels domaines sont servis ?</p>
        </div>
        <button onClick={() => setEditDomain('new')} className="btn-sun flex items-center gap-1.5 px-4 py-2 text-sm">
          <Plus size={15} /> Nouveau domaine
        </button>
      </header>

      {s.domains.length === 0 ? (
        <Card><EmptyState>Commence par créer tes domaines de vie depuis l'accueil.</EmptyState></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {s.domains.map((d) => {
            const objectives = s.objectives.filter((o) => o.domain_id === d.id && o.status !== 'abandonne')
            const projects = s.projects.filter((p) => p.domain_id === d.id && p.status === 'actif')
            const habits = s.habits.filter((h) => h.domain_id === d.id && h.active)
            const ideas = s.ideas.filter((i) => i.domain_id === d.id && (i.status === 'active' || i.status === 'reportee'))
            return (
              <Card key={d.id} className="card-hover">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <DomainDot color={d.color} size={12} />
                    <h3 className="font-medium">{d.name}</h3>
                  </div>
                  <button onClick={() => setEditDomain(d)} className="btn-ghost p-1.5" aria-label="Modifier"><Pencil size={14} /></button>
                </div>

                <p className="mt-1.5 text-xs text-ink-3">
                  {projects.length} projet{projects.length > 1 ? 's' : ''} actif{projects.length > 1 ? 's' : ''} ·{' '}
                  {habits.length} habitude{habits.length > 1 ? 's' : ''} · {ideas.length} idée{ideas.length > 1 ? 's' : ''}
                </p>

                <div className="mt-3 space-y-2">
                  {objectives.length === 0
                    ? <p className="text-xs text-ink-3">Pas encore d'objectif : quel résultat ce domaine devrait-il viser ?</p>
                    : objectives.map((o) => {
                      const serving = s.projects.filter((p) => p.objective_id === o.id && p.status === 'actif')
                      return (
                        <button key={o.id} onClick={() => setEditObjective({ obj: o, domainId: d.id })}
                          className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-panel-2">
                          <Target size={14} className="mt-0.5 shrink-0" style={{ color: d.color }} />
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-sm ${o.status === 'atteint' ? 'text-ink-3 line-through' : 'text-ink-2'}`}>
                              {o.title}
                            </span>
                            <span className="text-xs text-ink-3">
                              {HORIZON_LABEL[o.horizon]}
                              {serving.length > 0 && <> · servi par {serving.map((p) => p.title).join(', ')}</>}
                            </span>
                          </span>
                          {o.status === 'atteint' && <Badge tone="good">atteint</Badge>}
                        </button>
                      )
                    })}
                </div>

                <button onClick={() => setEditObjective({ obj: null, domainId: d.id })}
                  className="mt-3 text-xs text-ink-3 transition-colors hover:text-sun-soft">
                  + Ajouter un objectif
                </button>
              </Card>
            )
          })}
        </div>
      )}

      <DomainForm state={editDomain} onClose={() => setEditDomain(null)} />
      <ObjectiveForm state={editObjective} onClose={() => setEditObjective(null)} />
    </div>
  )
}

function DomainForm({ state, onClose }: { state: Domain | 'new' | null; onClose: () => void }) {
  const s = useHorizon()
  const domain = state === 'new' ? null : state
  const [form, setForm] = useState<{ name: string; color: string } | null>(null)
  const current = form ?? { name: domain?.name ?? '', color: domain?.color ?? PALETTE[s.domains.length % 6] }
  const close = () => { setForm(null); onClose() }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (domain) await s.update('domains', domain.id, current)
    else await s.insert('domains', { ...current, sort_order: s.domains.length })
    close()
  }

  return (
    <Modal open={state !== null} onClose={close} title={domain ? 'Modifier le domaine' : 'Nouveau domaine'}>
      <form onSubmit={save} className="space-y-3">
        <input required value={current.name} onChange={(e) => setForm({ ...current, name: e.target.value })}
          placeholder="Nom du domaine" className="field" autoFocus />
        <div className="flex gap-2">
          {PALETTE.map((c) => (
            <button key={c} type="button" onClick={() => setForm({ ...current, color: c })}
              className={`h-8 w-8 rounded-full border-2 transition-transform ${current.color === c ? 'scale-110 border-ink' : 'border-transparent'}`}
              style={{ background: c }} aria-label={`Couleur ${c}`} />
          ))}
        </div>
        <div className="flex justify-between gap-2 pt-1">
          {domain ? (
            <button type="button" className="btn-ghost px-3 py-2 text-sm text-[#ec7f97]"
              onClick={() => {
                if (confirm(`Supprimer « ${domain.name} » et tout ce qu'il contient (projets, tâches, idées, habitudes) ?`)) {
                  void s.remove('domains', domain.id); close()
                }
              }}>Supprimer</button>
          ) : <span />}
          <button type="submit" className="btn-sun px-5 py-2">{domain ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </form>
    </Modal>
  )
}

function ObjectiveForm({ state, onClose }: {
  state: { obj: Objective | null; domainId: string } | null; onClose: () => void
}) {
  const s = useHorizon()
  const [form, setForm] = useState<Record<string, string> | null>(null)
  if (!state) return null
  const { obj, domainId } = state
  const current = form ?? {
    title: obj?.title ?? '', horizon: obj?.horizon ?? 'libre', status: obj?.status ?? 'actif',
    description: obj?.description ?? '',
  }
  const close = () => { setForm(null); onClose() }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const values = { ...current, description: current.description.trim() || null, domain_id: domainId }
    if (obj) await s.update('objectives', obj.id, values)
    else await s.insert('objectives', { ...values, sort_order: s.objectives.length })
    close()
  }

  return (
    <Modal open onClose={close} title={obj ? 'Modifier l’objectif' : 'Nouvel objectif'}>
      <form onSubmit={save} className="space-y-3">
        <input required value={current.title} onChange={(e) => setForm({ ...current, title: e.target.value })}
          placeholder="Résultat souhaité (vers quoi ?)" className="field" autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs text-ink-3">
            Horizon
            <select value={current.horizon} onChange={(e) => setForm({ ...current, horizon: e.target.value })} className="field">
              {Object.entries(HORIZON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-ink-3">
            Statut
            <select value={current.status} onChange={(e) => setForm({ ...current, status: e.target.value })} className="field">
              <option value="actif">Actif</option>
              <option value="atteint">Atteint</option>
              <option value="abandonne">Abandonné</option>
            </select>
          </label>
        </div>
        <textarea value={current.description} onChange={(e) => setForm({ ...current, description: e.target.value })}
          placeholder="Pourquoi cet objectif ? (optionnel)" rows={2} className="field" />
        <div className="flex justify-between gap-2 pt-1">
          {obj ? (
            <button type="button" onClick={() => { void s.remove('objectives', obj.id); close() }}
              className="btn-ghost px-3 py-2 text-sm text-[#ec7f97]">Supprimer</button>
          ) : <span />}
          <button type="submit" className="btn-sun px-5 py-2">{obj ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </form>
    </Modal>
  )
}
