import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Plus, Target, CalendarClock, X } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { Card, Badge, DomainDot, Modal, EmptyState } from '../components/ui'
import type { Domain, Objective, ObjectiveCriterion, ObjectiveHorizon } from '../lib/types'

const HORIZON_LABEL: Record<ObjectiveHorizon, string> = {
  court_terme: 'Court terme (30 j)', trimestriel: 'Trimestriel', annuel: 'Annuel',
  long_terme: 'Long terme (3-5 ans)', libre: 'Libre',
}

const PALETTE = [
  '#d97706', '#0d9488', '#8b5cf6', '#dc4a6b', '#3987e5', '#65a30d',
  '#eab308', '#06b6d4', '#e0499c', '#ef6f4c',
]

const fmtTarget = (o: Objective) => {
  if (!o.target_date) return null
  const d = parseISO(o.target_date)
  if (o.target_granularity === 'mois') return format(d, 'MMM yyyy', { locale: fr })
  if (o.target_granularity === 'semaine') return 'sem. ' + format(d, "w '·' MMM", { locale: fr })
  return format(d, 'd MMM yyyy', { locale: fr })
}

/** Barres = nombre de critères ; remplies = critères atteints. */
function CriteriaBars({ criteria, color }: { criteria: ObjectiveCriterion[]; color: string }) {
  if (!criteria || criteria.length === 0) return null
  const done = criteria.filter((c) => c.done).length
  return (
    <span className="mt-1 flex items-center gap-1" title={`${done}/${criteria.length} critères atteints`}>
      {criteria.map((c, i) => (
        <span key={i} className="h-1.5 flex-1 rounded-full"
          style={{ background: c.done ? color : 'var(--color-panel-3)', minWidth: 8 }} />
      ))}
    </span>
  )
}

export function DomainsView() {
  const s = useHorizon()
  const [editDomain, setEditDomain] = useState<Domain | 'new' | null>(null)
  const [editObjective, setEditObjective] = useState<{ obj: Objective | null; domainId: string } | null>(null)

  return (
    <div className="rise space-y-4 pt-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Domaines & objectifs</h1>        </div>
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
            return (
              <Card key={d.id} className="card-hover cursor-pointer"
                onClick={() => setEditObjective({ obj: null, domainId: d.id })}>
                <div className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setEditDomain(d)}
                    className="flex items-center gap-2.5 text-left transition-opacity hover:opacity-70"
                    title="Modifier le domaine">
                    <DomainDot color={d.color} size={12} />
                    <h3 className="font-medium">{d.name}</h3>
                  </button>
                </div>

                {objectives.length === 0 ? (
                  <p className="mt-3 text-xs text-ink-3">Pas encore d'objectif : quel résultat viser ?</p>
                ) : (
                  <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2" onClick={(e) => e.stopPropagation()}>
                    {objectives.map((o) => {
                      const target = fmtTarget(o)
                      return (
                        <button key={o.id} onClick={() => setEditObjective({ obj: o, domainId: d.id })}
                          className="flex flex-col rounded-lg border border-line-2/60 px-2 py-1.5 text-left transition-colors hover:bg-panel-2">
                          <span className="flex items-start gap-1.5">
                            <Target size={13} className="mt-0.5 shrink-0" style={{ color: d.color }} />
                            <span className={`min-w-0 flex-1 truncate text-sm ${o.status === 'atteint' ? 'text-ink-3 line-through' : 'text-ink-2'}`}>
                              {o.title}
                            </span>
                            {o.status === 'atteint' && <Badge tone="good">✓</Badge>}
                          </span>
                          <CriteriaBars criteria={o.criteria} color={d.color} />
                          {target && (
                            <span className="mt-1 flex items-center gap-1 text-[10px] text-ink-3">
                              <CalendarClock size={10} /> {target}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
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
        <div className="flex flex-wrap gap-2">
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
  const [form, setForm] = useState<Record<string, unknown> | null>(null)
  if (!state) return null
  const { obj, domainId } = state
  const current = form ?? {
    title: obj?.title ?? '',
    horizon: obj?.horizon ?? 'libre',
    status: obj?.status ?? 'actif',
    description: obj?.description ?? '',
    target_date: obj?.target_date ?? '',
    target_granularity: obj?.target_granularity ?? 'mois',
    criteria: (obj?.criteria ?? []) as ObjectiveCriterion[],
  }
  const setF = (k: string, v: unknown) => setForm({ ...current, [k]: v })
  const criteria = current.criteria as ObjectiveCriterion[]
  const close = () => { setForm(null); onClose() }

  const setCrit = (next: ObjectiveCriterion[]) => setF('criteria', next)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleaned = criteria.filter((c) => c.label.trim()).map((c) => ({ label: c.label.trim(), done: c.done }))
    const values = {
      title: (current.title as string).trim(),
      horizon: current.horizon,
      status: current.status,
      description: (current.description as string).trim() || null,
      target_date: (current.target_date as string) || null,
      target_granularity: current.target_date ? current.target_granularity : null,
      criteria: cleaned,
      domain_id: domainId,
    }
    if (obj) await s.update('objectives', obj.id, values)
    else await s.insert('objectives', { ...values, sort_order: s.objectives.length })
    close()
  }

  return (
    <Modal open onClose={close} title={obj ? 'Modifier l’objectif' : 'Nouvel objectif'}>
      <form onSubmit={save} className="space-y-3">
        <input required value={current.title as string} onChange={(e) => setF('title', e.target.value)}
          placeholder="Résultat souhaité (vers quoi ?)" className="field" autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs text-ink-3">
            Horizon
            <select value={current.horizon as string} onChange={(e) => setF('horizon', e.target.value)} className="field">
              {Object.entries(HORIZON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-ink-3">
            Statut
            <select value={current.status as string} onChange={(e) => setF('status', e.target.value)} className="field">
              <option value="actif">Actif</option>
              <option value="atteint">Atteint</option>
              <option value="abandonne">Abandonné</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs text-ink-3">
            Échéance
            <input type="date" value={current.target_date as string}
              onChange={(e) => setF('target_date', e.target.value)} className="field" />
          </label>
          <label className="space-y-1 text-xs text-ink-3">
            Précision
            <select value={current.target_granularity as string} onChange={(e) => setF('target_granularity', e.target.value)}
              className="field" disabled={!current.target_date}>
              <option value="jour">Un jour</option>
              <option value="semaine">Une semaine</option>
              <option value="mois">Un mois</option>
            </select>
          </label>
        </div>

        {/* Critères de réussite (barres) */}
        <div className="space-y-1.5">
          <p className="text-xs text-ink-3">Critères de réussite (chaque critère = une barre qui se remplit)</p>
          {criteria.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="checkbox" checked={c.done} className="accent-[#f59e0b]"
                onChange={(e) => setCrit(criteria.map((x, j) => j === i ? { ...x, done: e.target.checked } : x))} />
              <input value={c.label} placeholder={`Critère ${i + 1}`}
                onChange={(e) => setCrit(criteria.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                className="field flex-1 py-1.5 text-sm" />
              <button type="button" onClick={() => setCrit(criteria.filter((_, j) => j !== i))}
                className="shrink-0 text-ink-3 hover:text-[#ec7f97]" aria-label="Retirer"><X size={14} /></button>
            </div>
          ))}
          <button type="button" onClick={() => setCrit([...criteria, { label: '', done: false }])}
            className="btn-ghost flex items-center gap-1 px-2.5 py-1.5 text-sm">
            <Plus size={14} /> Ajouter un critère
          </button>
        </div>

        <textarea value={current.description as string} onChange={(e) => setF('description', e.target.value)}
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
