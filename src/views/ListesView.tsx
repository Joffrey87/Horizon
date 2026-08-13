import { useEffect, useMemo, useState } from 'react'
import { ShoppingCart, Plus, Check, Trash2, RotateCcw, Repeat } from 'lucide-react'
import { useHorizon } from '../lib/store'
import type { ShoppingItem, ShoppingList, ShoppingSection } from '../lib/types'
import { Card, Modal, EmptyState, Badge } from '../components/ui'

const SECTIONS: { key: ShoppingSection; label: string }[] = [
  { key: 'alimentaire', label: 'Alimentaire' },
  { key: 'bio', label: 'Bio' },
  { key: 'non_alimentaire', label: 'Non-alimentaire' },
  { key: 'boucherie', label: 'Boucherie' },
]

/** Regroupe des items par sous-catégorie, en respectant l'ordre d'apparition. */
function groupByCategory(items: ShoppingItem[]): { category: string | null; items: ShoppingItem[] }[] {
  const groups: { category: string | null; items: ShoppingItem[] }[] = []
  for (const it of items) {
    const cat = it.category ?? null
    let g = groups.find((x) => x.category === cat)
    if (!g) { g = { category: cat, items: [] }; groups.push(g) }
    g.items.push(it)
  }
  // les items sans catégorie en dernier
  return groups.sort((a, b) => (a.category === null ? 1 : 0) - (b.category === null ? 1 : 0))
}

export function ListesView() {
  const s = useHorizon()
  const lists = useMemo(
    () => [...s.shoppingLists].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [s.shoppingLists])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<ShoppingSection>('alimentaire')
  const [creating, setCreating] = useState(false)

  // sélection par défaut = 1re liste
  useEffect(() => {
    if (selectedId && lists.some((l) => l.id === selectedId)) return
    setSelectedId(lists[0]?.id ?? null)
  }, [lists, selectedId])

  const selected = lists.find((l) => l.id === selectedId) ?? null
  const items = useMemo(
    () => s.shoppingItems.filter((it) => it.list_id === selectedId).sort((a, b) => a.sort_order - b.sort_order),
    [s.shoppingItems, selectedId])

  return (
    <div className="rise space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sun/15 text-sun">
            <ShoppingCart size={18} />
          </span>
          <div>
            <h1 className="text-xl font-semibold">Listes</h1>
            <p className="text-xs text-ink-3">Tes listes de courses : coche ce que tu as acheté.</p>
          </div>
        </div>
        <button onClick={() => setCreating(true)} className="btn-sun flex items-center gap-1.5 px-4 py-2 text-sm">
          <Plus size={15} /> Nouvelle liste
        </button>
      </header>

      {lists.length === 0 ? (
        <Card>
          <EmptyState hint="Crée une liste simple (ex. « Travaux ») ou une liste récurrente à 3 rayons.">
            Aucune liste pour l’instant.
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row">
          {/* Sélecteur de listes */}
          <div className="flex flex-row flex-wrap gap-1.5 lg:w-52 lg:flex-col">
            {lists.map((l) => (
              <button key={l.id} onClick={() => setSelectedId(l.id)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selectedId === l.id ? 'border-sun/50 bg-sun/10 text-ink' : 'border-line text-ink-2 hover:bg-panel-2 hover:text-ink'
                }`}>
                {l.recurrent && <Repeat size={13} className="shrink-0 text-ink-3" />}
                <span className="truncate">{l.name}</span>
              </button>
            ))}
          </div>

          {/* Contenu de la liste sélectionnée */}
          <div className="min-w-0 flex-1">
            {selected && <ListPanel list={selected} items={items} tab={tab} onTab={setTab} />}
          </div>
        </div>
      )}

      {creating && <ListForm onClose={() => setCreating(false)} onCreated={setSelectedId} count={lists.length} />}
    </div>
  )
}

function ListPanel({ list, items, tab, onTab }: {
  list: ShoppingList; items: ShoppingItem[]; tab: ShoppingSection; onTab: (t: ShoppingSection) => void
}) {
  const s = useHorizon()
  const shown = list.recurrent ? items.filter((it) => it.section === tab) : items
  const groups = groupByCategory(shown)
  const bought = shown.filter((it) => it.checked).length

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">{list.name}</h2>
          {list.recurrent && <Badge>récurrente</Badge>}
          {shown.length > 0 && <span className="text-xs text-ink-3">{bought}/{shown.length} acheté{bought > 1 ? 's' : ''}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {bought > 0 && (
            <button onClick={() => void s.resetShopping(list.id)}
              className="btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-xs" title="Tout décocher pour la prochaine fois">
              <RotateCcw size={13} /> Décocher
            </button>
          )}
          <button onClick={() => { if (confirm(`Supprimer la liste « ${list.name} » et tous ses articles ?`)) void s.remove('shopping_lists', list.id) }}
            className="btn-ghost p-1.5" title="Supprimer la liste" aria-label="Supprimer la liste">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {list.recurrent && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {SECTIONS.map((sec) => (
            <button key={sec.key} onClick={() => onTab(sec.key)}
              className={`rounded-lg px-3 py-1 text-sm transition-colors ${
                tab === sec.key ? 'bg-sun/15 text-sun-soft' : 'text-ink-2 hover:bg-panel-2 hover:text-ink'
              }`}>
              {sec.label}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="py-4 text-sm text-ink-3">Aucun article ici. Ajoute-en un ci-dessous.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.category ?? '__'}>
              {g.category && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{g.category}</p>}
              <ul className="space-y-0.5">
                {g.items.map((it) => (
                  <li key={it.id} className="group flex items-center gap-2">
                    <button onClick={() => void s.update('shopping_items', it.id, { checked: !it.checked })}
                      className="flex flex-1 items-center gap-2.5 py-1 text-left">
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                        it.checked ? 'border-good/70 bg-good/70 text-white' : 'border-line-2 hover:border-ink-3'
                      }`}>
                        {it.checked && <Check size={13} />}
                      </span>
                      <span className="text-sm text-ink">{it.label}</span>
                    </button>
                    <button onClick={() => void s.remove('shopping_items', it.id)}
                      className="btn-ghost p-1 opacity-0 transition-opacity group-hover:opacity-100" title="Retirer" aria-label="Retirer">
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <AddItem list={list} section={list.recurrent ? tab : null} count={items.length} />
    </Card>
  )
}

function AddItem({ list, section, count }: { list: ShoppingList; section: ShoppingSection | null; count: number }) {
  const s = useHorizon()
  const [label, setLabel] = useState('')

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = label.trim()
    if (!v) return
    setLabel('')
    await s.insert('shopping_items', { list_id: list.id, label: v, section, category: null, sort_order: count })
  }

  return (
    <form onSubmit={add} className="mt-3 flex gap-2 border-t border-line pt-3">
      <input value={label} onChange={(e) => setLabel(e.target.value)}
        placeholder={section ? `Ajouter dans « ${SECTIONS.find((x) => x.key === section)?.label} »…` : 'Ajouter un article…'}
        className="field flex-1" />
      <button type="submit" disabled={!label.trim()} className="btn-sun px-3 py-2 text-sm disabled:opacity-50">
        <Plus size={15} />
      </button>
    </form>
  )
}

function ListForm({ onClose, onCreated, count }: { onClose: () => void; onCreated: (id: string) => void; count: number }) {
  const s = useHorizon()
  const [name, setName] = useState('')
  const [recurrent, setRecurrent] = useState(false)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = name.trim()
    if (!v) return
    const row = await s.insert<ShoppingList>('shopping_lists', { name: v, recurrent, sort_order: count })
    if (row) onCreated(row.id)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Nouvelle liste">
      <form onSubmit={save} className="space-y-3">
        <input required value={name} onChange={(e) => setName(e.target.value)} autoFocus
          placeholder="Nom de la liste (ex. Travaux)" className="field w-full" />
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={recurrent} onChange={(e) => setRecurrent(e.target.checked)}
            className="accent-[color:var(--color-sun)]" />
          Liste récurrente (3 rayons : alimentaire, bio, non-alimentaire)
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-sm">Annuler</button>
          <button type="submit" className="btn-sun px-4 py-2 text-sm">Créer</button>
        </div>
      </form>
    </Modal>
  )
}
