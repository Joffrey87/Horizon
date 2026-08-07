import { useMemo, useState } from 'react'
import { useHorizon } from '../lib/store'
import { quadrant, todayIso } from '../lib/logic'
import { Card, Badge, DomainDot, Modal, Seg, Scale3 } from '../components/ui'
import type { Idea, Task } from '../lib/types'

type Item = { kind: 'idee'; idea: Idea } | { kind: 'tache'; task: Task }

const QUADRANTS = [
  { q: 1 as const, title: 'Important & urgent', hint: 'À faire', tone: 'text-[#eda145]' },
  { q: 2 as const, title: 'Important, pas urgent', hint: 'À planifier — le cœur du système', tone: 'text-sun-soft' },
  { q: 3 as const, title: 'Urgent, peu important', hint: 'Vite fait ou délégué', tone: 'text-[#6ea8ee]' },
  { q: 4 as const, title: 'Ni urgent ni important', hint: 'Abandonner ou différer', tone: 'text-ink-3' },
]

/** Vue de priorisation : compare idées et tâches sous l'angle urgence/importance.
 *  Elle PUISE dans les listes existantes — rien n'y est dupliqué. */
export function PrioritiesView() {
  const s = useHorizon()
  const [source, setSource] = useState<'tout' | 'idees' | 'taches'>('tout')
  const [selected, setSelected] = useState<Item | null>(null)

  const items: Item[] = useMemo(() => {
    const ideas: Item[] = s.ideas
      .filter((i) => i.status === 'active')
      .map((idea) => ({ kind: 'idee', idea }))
    const tasks: Item[] = s.tasks
      .filter((t) => (t.status === 'a_faire' || t.status === 'en_cours') && !t.is_recurring)
      .map((task) => ({ kind: 'tache', task }))
    if (source === 'idees') return ideas
    if (source === 'taches') return tasks
    return [...ideas, ...tasks]
  }, [s.ideas, s.tasks, source])

  const byQuadrant = (q: 1 | 2 | 3 | 4) => items.filter((it) => {
    const x = it.kind === 'idee' ? it.idea : it.task
    return quadrant(x.importance, x.urgence) === q
  })

  return (
    <div className="rise space-y-4 pt-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Priorités</h1>
          <p className="text-sm text-ink-3">Sur quoi concentrer mon énergie ? Une idée n'est pas automatiquement un projet.</p>
        </div>
        <Seg value={source} onChange={setSource} options={[
          { value: 'tout', label: 'Tout' }, { value: 'idees', label: 'Idées' }, { value: 'taches', label: 'Tâches' },
        ]} />
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {QUADRANTS.map(({ q, title, hint, tone }) => {
          const list = byQuadrant(q)
          return (
            <Card key={q}>
              <header className="mb-2">
                <h3 className={`text-sm font-semibold ${tone}`}>{title}</h3>
                <p className="text-xs text-ink-3">{hint}</p>
              </header>
              {list.length === 0 ? (
                <p className="py-3 text-center text-xs text-ink-3">Rien ici.</p>
              ) : (
                <ul className="space-y-1">
                  {list.map((it) => {
                    const x = it.kind === 'idee' ? it.idea : it.task
                    const domain = s.domains.find((d) => d.id ===
                      (it.kind === 'idee' ? it.idea.domain_id
                        : it.task.domain_id ?? s.projects.find((p) => p.id === it.task.project_id)?.domain_id))
                    return (
                      <li key={x.id}>
                        <button onClick={() => setSelected(it)}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-panel-2">
                          {domain && <DomainDot color={domain.color} size={7} />}
                          <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{x.title}</span>
                          <Badge tone={it.kind === 'idee' ? 'sun' : 'info'}>{it.kind}</Badge>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          )
        })}
      </div>

      <DecisionModal item={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

/** Décider : abandonner, reporter, planifier, convertir — l'élément change d'état,
 *  il n'est jamais copié dans une seconde liste. */
function DecisionModal({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const s = useHorizon()
  if (!item) return null
  const x = item.kind === 'idee' ? item.idea : item.task

  const setScales = async (field: 'importance' | 'urgence', v: number) => {
    if (item.kind === 'idee') await s.update('ideas', x.id, { [field]: v })
    else await s.update('tasks', x.id, { [field]: v })
  }

  return (
    <Modal open onClose={onClose} title={x.title}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-xs text-ink-3">Importance</p>
            <Scale3 value={x.importance} onChange={(v) => void setScales('importance', v)}
              labels={['Basse', 'Moyenne', 'Haute']} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-ink-3">Urgence</p>
            <Scale3 value={x.urgence} onChange={(v) => void setScales('urgence', v)}
              labels={['Basse', 'Moyenne', 'Haute']} />
          </div>
        </div>

        {item.kind === 'idee' ? (
          <div className="space-y-2">
            <p className="block-title">Décider</p>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost px-3 py-2 text-sm"
                onClick={() => {
                  const d = new Date(); d.setMonth(d.getMonth() + 6)
                  void s.update('ideas', x.id, { status: 'reportee', defer_until: d.toISOString().slice(0, 10) }); onClose()
                }}>
                Dans 6 mois
              </button>
              <button className="btn-ghost px-3 py-2 text-sm"
                onClick={async () => {
                  await s.insert('tasks', {
                    title: x.title, domain_id: item.idea.domain_id, status: 'a_faire',
                    importance: x.importance, urgence: x.urgence, scheduled_date: todayIso(),
                  })
                  await s.update('ideas', x.id, { status: 'convertie' }); onClose()
                }}>
                → Tâche
              </button>
              <button className="btn-ghost px-3 py-2 text-sm"
                onClick={async () => {
                  await s.insert('projects', {
                    title: x.title, domain_id: item.idea.domain_id, status: 'actif',
                    description: item.idea.description,
                  })
                  await s.update('ideas', x.id, { status: 'convertie' }); onClose()
                }}>
                → Projet
              </button>
              <button className="btn-ghost px-3 py-2 text-sm text-[#ec7f97]"
                onClick={() => { void s.update('ideas', x.id, { status: 'abandonnee' }); onClose() }}>
                Abandonner
              </button>
            </div>
            <p className="text-center text-xs text-ink-3">Convertir en projet ajoute au travail en cours — sûr de toi ?</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="block-title">Décider</p>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost px-3 py-2 text-sm"
                onClick={() => { void s.update('tasks', x.id, { scheduled_date: todayIso() }); onClose() }}>
                Aujourd'hui
              </button>
              <button className="btn-ghost px-3 py-2 text-sm"
                onClick={() => {
                  void s.update('tasks', x.id, { status: 'fait', done_at: new Date().toISOString() }); onClose()
                }}>
                ✓ Fait
              </button>
              <button className="btn-ghost px-3 py-2 text-sm"
                onClick={() => { void s.update('tasks', x.id, { scheduled_date: null }); onClose() }}>
                Déplanifier
              </button>
              <button className="btn-ghost px-3 py-2 text-sm text-[#ec7f97]"
                onClick={() => { void s.update('tasks', x.id, { status: 'annule' }); onClose() }}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
