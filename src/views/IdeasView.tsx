import { useMemo, useState } from 'react'
import { Plus, Lightbulb } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { todayIso } from '../lib/logic'
import { Card, Badge, DomainDot, Modal, EmptyState, Seg } from '../components/ui'
import type { Idea } from '../lib/types'

/** UNE seule liste d'idées, classée par domaine. Une idée conservée rassure ;
 *  elle ne devient un projet que par décision explicite (vue Priorités). */
export function IdeasView() {
  const s = useHorizon()
  const [tab, setTab] = useState<'active' | 'reportee' | 'traitee'>('active')
  const [domainFilter, setDomainFilter] = useState<string>('')
  const [editing, setEditing] = useState<Idea | 'new' | null>(null)

  const today = todayIso()
  // Les idées reportées dont l'échéance est passée redeviennent visibles dans « à trier »
  const shown = useMemo(() => s.ideas.filter((i) => {
    if (domainFilter && i.domain_id !== domainFilter) return false
    if (tab === 'active') return i.status === 'active' || (i.status === 'reportee' && (i.defer_until ?? '') <= today)
    if (tab === 'reportee') return i.status === 'reportee' && (i.defer_until ?? '') > today
    return i.status === 'convertie' || i.status === 'abandonnee'
  }), [s.ideas, tab, domainFilter, today])

  return (
    <div className="rise space-y-4 pt-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Idées</h1>
          <p className="text-sm text-ink-3">Et si… ? Tout est conservé, rien n'interrompt le travail en cours.</p>
        </div>
        <button onClick={() => setEditing('new')} className="btn-sun flex items-center gap-1.5 px-4 py-2 text-sm">
          <Plus size={15} /> Nouvelle idée
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Seg value={tab} onChange={setTab} options={[
          { value: 'active', label: 'À trier' },
          { value: 'reportee', label: 'Pour dans 6 mois' },
          { value: 'traitee', label: 'Traitées' },
        ]} />
        <select value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)} className="field w-auto">
          <option value="">Tous les domaines</option>
          {s.domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState hint="Le bouton + en bas à droite capture une idée sans casser le focus.">
            {tab === 'active' ? 'Aucune idée à trier.' : tab === 'reportee' ? 'Rien en sommeil.' : 'Rien encore.'}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-2">
          {shown.map((idea) => {
            const domain = s.domains.find((d) => d.id === idea.domain_id)
            const project = s.projects.find((p) => p.id === idea.project_id)
            return (
              <button key={idea.id} onClick={() => setEditing(idea)}
                className="card card-hover flex items-center gap-3 px-4 py-3 text-left">
                <Lightbulb size={16} className="shrink-0 text-sun/70" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{idea.title}</p>
                  <p className="truncate text-xs text-ink-3">
                    {domain?.name}
                    {project && <> · liée à « {project.title} »</>}
                    {idea.status === 'reportee' && idea.defer_until && <> · réveil le {idea.defer_until}</>}
                  </p>
                </div>
                {domain && <DomainDot color={domain.color} />}
                {idea.status === 'convertie' && <Badge tone="good">convertie</Badge>}
                {idea.status === 'abandonnee' && <Badge>abandonnée</Badge>}
                {idea.status === 'reportee' && (idea.defer_until ?? '') <= today && <Badge tone="sun">réveillée</Badge>}
              </button>
            )
          })}
        </div>
      )}

      <IdeaForm state={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function IdeaForm({ state, onClose }: { state: Idea | 'new' | null; onClose: () => void }) {
  const s = useHorizon()
  const idea = state === 'new' ? null : state
  const [form, setForm] = useState<Record<string, string> | null>(null)
  if (!state) return null

  const current = form ?? {
    title: idea?.title ?? '',
    domain_id: idea?.domain_id ?? s.domains[0]?.id ?? '',
    project_id: idea?.project_id ?? '',
    description: idea?.description ?? '',
    status: idea?.status ?? 'active',
    defer_until: idea?.defer_until ?? '',
  }
  const close = () => { setForm(null); onClose() }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const values = {
      title: current.title.trim(),
      domain_id: current.domain_id,
      project_id: current.project_id || null,
      description: current.description.trim() || null,
      status: current.status,
      defer_until: current.status === 'reportee' ? (current.defer_until || null) : null,
    }
    if (idea) await s.update('ideas', idea.id, values)
    else await s.insert('ideas', values)
    close()
  }

  return (
    <Modal open onClose={close} title={idea ? 'Idée' : 'Nouvelle idée'}>
      <form onSubmit={save} className="space-y-3">
        <input required value={current.title} onChange={(e) => setForm({ ...current, title: e.target.value })}
          placeholder="Suffisamment claire pour être comprise dans 6 mois" className="field" autoFocus />
        <textarea value={current.description} onChange={(e) => setForm({ ...current, description: e.target.value })}
          placeholder="Détails (optionnel)" rows={2} className="field" />
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs text-ink-3">
            Domaine
            <select value={current.domain_id} onChange={(e) => setForm({ ...current, domain_id: e.target.value, project_id: '' })} className="field">
              {s.domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-ink-3">
            Projet lié (optionnel)
            <select value={current.project_id} onChange={(e) => setForm({ ...current, project_id: e.target.value })} className="field">
              <option value="">—</option>
              {s.projects.filter((p) => p.domain_id === current.domain_id && p.status !== 'abandonne')
                .map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs text-ink-3">
            Statut
            <select value={current.status} onChange={(e) => setForm({ ...current, status: e.target.value })} className="field">
              <option value="active">À trier</option>
              <option value="reportee">Reportée</option>
              <option value="convertie">Convertie</option>
              <option value="abandonnee">Abandonnée</option>
            </select>
          </label>
          {current.status === 'reportee' && (
            <label className="space-y-1 text-xs text-ink-3">
              Réveil le
              <input type="date" value={current.defer_until}
                onChange={(e) => setForm({ ...current, defer_until: e.target.value })} className="field" />
            </label>
          )}
        </div>
        <div className="flex justify-between gap-2 pt-1">
          {idea ? (
            <button type="button" onClick={() => { void s.remove('ideas', idea.id); close() }}
              className="btn-ghost px-3 py-2 text-sm text-[#ec7f97]">Supprimer</button>
          ) : <span />}
          <button type="submit" className="btn-sun px-5 py-2">{idea ? 'Enregistrer' : 'Conserver'}</button>
        </div>
      </form>
    </Modal>
  )
}
