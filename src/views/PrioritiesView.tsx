import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { quadrant, todayIso } from '../lib/logic'
import { Badge, DomainDot, Modal, Seg, Scale3 } from '../components/ui'
import { TaskForm } from '../components/TaskForm'
import type { Idea, Task } from '../lib/types'

type Item = { kind: 'idee'; idea: Idea } | { kind: 'tache'; task: Task }

const QUADRANTS = [
  { q: 1 as const, title: 'Important & urgent', hint: 'À faire', tone: 'text-[#eda145]' },
  { q: 2 as const, title: 'Important, pas urgent', hint: 'À planifier — le cœur du système', tone: 'text-sun-soft' },
  { q: 3 as const, title: 'Urgent, peu important', hint: 'Vite fait ou délégué', tone: 'text-[#6ea8ee]' },
  { q: 4 as const, title: 'Ni urgent ni important', hint: 'Abandonner ou différer', tone: 'text-ink-3' },
]

// importance / urgence correspondant à chaque quadrant (au drop)
const QUADRANT_SCALES: Record<1 | 2 | 3 | 4, { importance: number; urgence: number }> = {
  1: { importance: 3, urgence: 3 },
  2: { importance: 3, urgence: 1 },
  3: { importance: 1, urgence: 3 },
  4: { importance: 1, urgence: 1 },
}

/** Vue de priorisation : compare idées et tâches sous l'angle urgence/importance.
 *  Elle PUISE dans les listes existantes — rien n'y est dupliqué. */
export function PrioritiesView() {
  const s = useHorizon()
  const [source, setSource] = useState<'tout' | 'idees' | 'taches'>('tout')
  const [selected, setSelected] = useState<Item | null>(null)
  const [createIn, setCreateIn] = useState<1 | 2 | 3 | 4 | 'triage' | null>(null)

  const items: Item[] = useMemo(() => {
    const ideas: Item[] = s.ideas
      .filter((i) => i.status === 'active')
      .map((idea) => ({ kind: 'idee', idea }))
    const tasks: Item[] = s.tasks
      .filter((t) => (t.status === 'a_faire' || t.status === 'en_cours') && !t.is_recurring && t.is_task !== false)
      .map((task) => ({ kind: 'tache', task }))
    if (source === 'idees') return ideas
    if (source === 'taches') return tasks
    return [...ideas, ...tasks]
  }, [s.ideas, s.tasks, source])

  const val = (it: Item) => (it.kind === 'idee' ? it.idea : it.task)
  // « À trier » = ni importance ni urgence renseignées (sinon quadrant() les classerait par défaut).
  const isUntriaged = (it: Item) => val(it).importance == null && val(it).urgence == null
  const byQuadrant = (q: 1 | 2 | 3 | 4) => items.filter((it) => !isUntriaged(it) && quadrant(val(it).importance, val(it).urgence) === q)
  const untriaged = items.filter(isUntriaged)

  // déplacer un item dans un quadrant : ajuste importance/urgence en conséquence
  const moveToQuadrant = (q: 1 | 2 | 3 | 4, kind: 'idee' | 'tache', id: string) =>
    void s.update(kind === 'idee' ? 'ideas' : 'tasks', id, QUADRANT_SCALES[q])
  // renvoyer un item « à trier » : on efface importance & urgence
  const untriage = (kind: 'idee' | 'tache', id: string) =>
    void s.update(kind === 'idee' ? 'ideas' : 'tasks', id, { importance: null, urgence: null })

  // Rendu d'un item (réutilisé par les quadrants et la zone « À trier »).
  const renderItem = (it: Item) => {
    const x = val(it)
    const domain = s.domains.find((d) => d.id ===
      (it.kind === 'idee' ? it.idea.domain_id : it.task.domain_id ?? s.projects.find((p) => p.id === it.task.project_id)?.domain_id))
    return (
      <li key={x.id}>
        <button onClick={(e) => { e.stopPropagation(); setSelected(it) }}
          draggable
          onDragStart={(e) => e.dataTransfer.setData('application/horizon-prio', JSON.stringify({ kind: it.kind, id: x.id }))}
          className="flex w-full cursor-grab items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-panel-2 active:cursor-grabbing">
          {domain && <DomainDot color={domain.color} size={7} />}
          <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{x.title}</span>
          <Badge tone={it.kind === 'idee' ? 'sun' : 'info'}>{it.kind}</Badge>
        </button>
      </li>
    )
  }

  return (
    <div className="rise space-y-4 pt-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Priorités</h1>        </div>
        <Seg value={source} onChange={setSource} options={[
          { value: 'tout', label: 'Tout' }, { value: 'idees', label: 'Idées' }, { value: 'taches', label: 'Tâches' },
        ]} />
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {QUADRANTS.map(({ q, title, hint, tone }) => {
          const list = byQuadrant(q)
          return (
            <QuadrantCard key={q} title={title} hint={hint} tone={tone}
              onDropItem={(kind, id) => moveToQuadrant(q, kind, id)} onCreate={() => setCreateIn(q)}>
              {list.length === 0 ? (
                <p className="py-3 text-center text-xs text-ink-3">Glisse un item ici, ou clique pour créer une tâche.</p>
              ) : (
                <ul className="space-y-1">{list.map(renderItem)}</ul>
              )}
            </QuadrantCard>
          )
        })}
      </div>

      {/* Zone libre « À trier » : items sans importance ni urgence, à classer. */}
      <QuadrantCard title="À trier" hint="Ni importance ni urgence — à glisser dans un quadrant"
        tone="text-ink-2" onDropItem={untriage} onCreate={() => setCreateIn('triage')}>
        {untriaged.length === 0 ? (
          <p className="py-3 text-center text-xs text-ink-3">Rien à trier. Clique pour créer une tâche à classer plus tard.</p>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">{untriaged.map(renderItem)}</ul>
        )}
      </QuadrantCard>

      <DecisionModal item={selected} onClose={() => setSelected(null)} />

      {/* Créer une tâche directement dans le quadrant / la zone cliqué·e (importance/urgence pré-réglées, ou vierges pour « À trier »). */}
      <TaskForm
        open={createIn !== null}
        task={null}
        defaultIsTask
        defaultImportance={typeof createIn === 'number' ? QUADRANT_SCALES[createIn].importance : null}
        defaultUrgence={typeof createIn === 'number' ? QUADRANT_SCALES[createIn].urgence : null}
        onClose={() => setCreateIn(null)} />
    </div>
  )
}

/** Quadrant (ou zone « À trier ») : zone de dépôt pour le drag & drop + création au clic dans le vide. */
function QuadrantCard({ title, hint, tone, onDropItem, onCreate, children }: {
  title: string; hint: string; tone: string
  onDropItem: (kind: 'idee' | 'tache', id: string) => void
  onCreate: () => void
  children: React.ReactNode
}) {
  const [over, setOver] = useState(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setOver(false)
    const raw = e.dataTransfer.getData('application/horizon-prio')
    if (!raw) return
    const { kind, id } = JSON.parse(raw)
    onDropItem(kind, id)
  }
  // Clic dans le vide (hors item, qui stoppe la propagation) → créer une tâche dans ce quadrant.
  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}
      onClick={onCreate}
      className={`group card cursor-pointer p-4 transition-colors ${over ? 'ring-2 ring-sun/60' : ''}`}>
      <header className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className={`text-sm font-semibold ${tone}`}>{title}</h3>
          <p className="text-xs text-ink-3">{hint}</p>
        </div>
        <Plus size={15} className="mt-0.5 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
      </header>
      {children}
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
