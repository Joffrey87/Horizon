import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Check, Trash2, RotateCcw, Repeat, ListPlus, GripVertical, Pencil } from 'lucide-react'
import { useHorizon } from '../lib/store'
import type { ShoppingItem, ShoppingList, ShoppingSection } from '../lib/types'
import { Card, Modal, EmptyState } from '../components/ui'
import { trouverListeCourses } from '../lib/courses'

const SECTIONS: { key: ShoppingSection; label: string }[] = [
  { key: 'alimentaire', label: 'Alimentaire' },
  { key: 'bio', label: 'Bio' },
  { key: 'non_alimentaire', label: 'Non-alimentaire' },
  { key: 'boucherie', label: 'Boucherie' },
]

const LIBELLES: Record<string, string> = Object.fromEntries(SECTIONS.map((x) => [x.key, x.label]))
/** Nom affiché d'une sous-liste : rayon connu, sinon le nom saisi ; '' = articles sans sous-liste. */
const libelleSection = (cle: string) => cle === '' ? 'Général' : LIBELLES[cle] ?? cle

/** Sous-listes d'une liste : celles choisies, sinon les 4 rayons d'une liste récurrente, sinon aucune ; « Général » si des articles n'en ont pas. */
function sectionsDe(list: ShoppingList, items: ShoppingItem[]): string[] {
  const base = list.sections?.length ? list.sections : list.recurrent ? SECTIONS.map((x) => x.key) : []
  if (!base.length) return []
  const orphelines = [...new Set(items.map((it) => it.section).filter((x): x is string => !!x && !base.includes(x)))]
  return [...(items.some((it) => !it.section) ? [''] : []), ...base, ...orphelines]
}

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

const eur = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')} €`
/** « 3 € » ou « 3–5 € » ; '' sans prix. */
function textePrix(it: Pick<ShoppingItem, 'price_min' | 'price_max'>): string {
  const { price_min: a, price_max: b } = it
  if (a == null && b == null) return ''
  if (a == null || b == null || a === b) return eur((a ?? b)!)
  return `${eur(Math.min(a, b)).replace(' €', '')}–${eur(Math.max(a, b))}`
}
const nombre = (v: string): number | null => {
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function ListesView() {
  const s = useHorizon()
  const lists = useMemo(
    () => [...s.shoppingLists].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [s.shoppingLists])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<string>('alimentaire')
  const [creating, setCreating] = useState(false)

  // sélection par défaut = la liste « Courses » (raccourci du caddie), sinon la 1re liste
  useEffect(() => {
    if (selectedId && lists.some((l) => l.id === selectedId)) return
    setSelectedId((trouverListeCourses(lists) ?? lists[0])?.id ?? null)
  }, [lists, selectedId])

  const selected = lists.find((l) => l.id === selectedId) ?? null
  const items = useMemo(
    () => s.shoppingItems.filter((it) => it.list_id === selectedId).sort((a, b) => a.sort_order - b.sort_order),
    [s.shoppingItems, selectedId])

  return (
    <div className="rise space-y-2 pb-24">
      {lists.length === 0 ? (
        <Card>
          <EmptyState hint="Crée une liste simple (ex. « Travaux ») ou une liste récurrente à 4 rayons.">
            Aucune liste pour l’instant.
          </EmptyState>
          <button onClick={() => setCreating(true)} className="btn-sun mx-auto mt-2 flex items-center gap-1.5 px-4 py-2 text-sm">
            <Plus size={15} /> Nouvelle liste
          </button>
        </Card>
      ) : (
        <div className="flex flex-col gap-2 lg:flex-row lg:gap-4">
          {/* Sélecteur de listes : une seule ligne défilante, « + » pour en créer une */}
          <div className="flex flex-row items-center gap-1.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:w-52 lg:flex-col lg:items-stretch lg:overflow-visible lg:overflow-y-visible">
            {lists.map((l) => (
              <button key={l.id} onClick={() => setSelectedId(l.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-left text-sm transition-colors ${
                  selectedId === l.id ? 'border-sun/50 bg-sun/10 text-ink' : 'border-line text-ink-2 hover:bg-panel-2 hover:text-ink'
                }`}>
                {l.recurrent && <Repeat size={12} className="shrink-0 text-ink-3" />}
                <span className="truncate">{l.name}</span>
              </button>
            ))}
            <button onClick={() => setCreating(true)} title="Nouvelle liste" aria-label="Nouvelle liste"
              className="btn-ghost flex shrink-0 items-center gap-1 rounded-lg border border-dashed border-line px-2.5 py-1 text-sm">
              <Plus size={14} /> <span className="max-lg:hidden">Nouvelle liste</span>
            </button>
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
  list: ShoppingList; items: ShoppingItem[]; tab: string; onTab: (t: string) => void
}) {
  const s = useHorizon()
  const sections = sectionsDe(list, items)
  const avecSous = sections.length > 0
  const courant = sections.includes(tab) ? tab : sections[0] ?? ''
  const shown = avecSous ? items.filter((it) => (it.section ?? '') === courant) : items
  const bought = shown.filter((it) => it.checked).length
  const reste = shown.filter((it) => !it.checked)
  const tMin = reste.reduce((n, it) => n + (it.price_min ?? it.price_max ?? 0), 0)
  const tMax = reste.reduce((n, it) => n + (it.price_max ?? it.price_min ?? 0), 0)
  const totalTexte = tMax > 0 ? textePrix({ price_min: tMin, price_max: tMax }) : ''
  const volet = useRef<HTMLDivElement>(null)
  const [edition, setEdition] = useState<ShoppingItem | null>(null)
  // Glisser-déposer (doigt ou souris) par la poignée : avant/après un article (même liste, même sous-liste ou une autre),
  // ou sur l'onglet d'une sous-liste pour y déposer l'article en dernier.
  const [drag, setDrag] = useState<{ id: string; sur: { id: string; apres: boolean } | null; onglet: string | null } | null>(null)
  const debutDrag = (e: React.PointerEvent, it: ShoppingItem) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ id: it.id, sur: null, onglet: null })
  }
  const bougeDrag = (e: React.PointerEvent) => {
    if (!drag) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const ligne = el?.closest<HTMLElement>('[data-item-id]')
    const onglet = el?.closest<HTMLElement>('[data-onglet]')
    if (ligne && ligne.dataset.itemId !== drag.id) {
      const r = ligne.getBoundingClientRect()
      setDrag({ ...drag, sur: { id: ligne.dataset.itemId!, apres: e.clientY > r.top + r.height / 2 }, onglet: null })
    } else setDrag({ ...drag, sur: null, onglet: onglet ? onglet.dataset.onglet ?? null : null })
  }
  const finDrag = () => {
    const d = drag
    setDrag(null)
    const mobile = d && items.find((x) => x.id === d.id)
    if (!d || !mobile) return
    const reste = items.filter((x) => x.id !== d.id)
    let section = mobile.section ?? null
    let category = mobile.category
    let idx: number
    if (d.sur) {
      const cible = reste.find((x) => x.id === d.sur!.id)
      if (!cible) return
      idx = reste.indexOf(cible) + (d.sur.apres ? 1 : 0)
      section = cible.section ?? null
      category = cible.category
    } else if (d.onglet !== null) {
      section = d.onglet === '' ? null : d.onglet
      category = null
      idx = reste.length
    } else return
    const ordre = [...reste.slice(0, idx), { ...mobile, section, category }, ...reste.slice(idx)]
    ordre.forEach((x, i) => {
      const avant = items.find((y) => y.id === x.id)
      if (avant && (avant.sort_order !== i || (avant.section ?? null) !== (x.section ?? null) || avant.category !== x.category)) {
        void s.update('shopping_items', x.id, { sort_order: i, section: x.section ?? null, category: x.category })
      }
    })
  }
  const index = Math.max(0, sections.indexOf(courant))

  // Liste récurrente : un volet par rayon, on passe de l'un à l'autre en glissant le doigt (les onglets suivent, et inversement).
  const aller = (i: number, doux = true) => {
    const el = volet.current
    if (el && Math.round(el.scrollLeft / Math.max(1, el.clientWidth)) !== i) el.scrollTo({ left: i * el.clientWidth, behavior: doux ? 'smooth' : 'auto' })
  }
  useEffect(() => { if (avecSous) aller(index, false) }, [list.id, avecSous]) // eslint-disable-line react-hooks/exhaustive-deps
  // Molette sur la rangée des sous-listes : une cran = sous-liste suivante / précédente.
  const derniereMolette = useRef(0)
  const surMolette = (e: React.WheelEvent) => {
    if (sections.length < 2 || Date.now() - derniereMolette.current < 200) return
    const sens = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
    if (!sens) return
    const i = Math.min(sections.length - 1, Math.max(0, index + (sens > 0 ? 1 : -1)))
    const cible = sections[i]
    if (i === index || cible === undefined) return
    derniereMolette.current = Date.now()
    onTab(cible)
    aller(i)
  }
  const surDefilement = () => {
    const el = volet.current
    if (!el) return
    const sec = sections[Math.round(el.scrollLeft / Math.max(1, el.clientWidth))]
    if (sec !== undefined && sec !== courant) onTab(sec)
  }
  // Nouvelle sous-liste (comme les rayons de Courses) : le nom est gardé dans la liste, même vide.
  const ajouterSousListe = () => {
    const nom = window.prompt('Nom de la sous-liste')?.trim()
    if (!nom) return
    const existante = sections.find((x) => libelleSection(x).toLowerCase() === nom.toLowerCase())
    if (existante !== undefined) { onTab(existante); return }
    const base = list.sections?.length ? list.sections : list.recurrent ? SECTIONS.map((x) => x.key) : []
    void s.update('shopping_lists', list.id, { sections: [...base, nom] })
    onTab(nom)
  }

  const articles = (liste: ShoppingItem[]) => liste.length === 0 ? (
    <p className="py-3 text-sm text-ink-3">Aucun article ici. Ajoute-en un ci-dessous.</p>
  ) : (
    <div className="space-y-2">
      {groupByCategory(liste).map((g) => (
        <div key={g.category ?? '__'}>
          {g.category && <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{g.category}</p>}
          <ul className="space-y-0.5">
            {g.items.map((it) => (
              <li key={it.id} data-item-id={it.id}
                className={`group flex items-center gap-1 ${drag?.id === it.id ? 'opacity-40' : ''} ${
                  drag?.sur?.id === it.id ? (drag.sur.apres ? 'border-b-2 border-sun' : 'border-t-2 border-sun') : ''}`}>
                <button type="button" aria-label="Déplacer" title="Glisser pour déplacer"
                  onPointerDown={(e) => debutDrag(e, it)} onPointerMove={bougeDrag} onPointerUp={finDrag} onPointerCancel={() => setDrag(null)}
                  className="shrink-0 cursor-grab touch-none p-1 text-ink-3 active:cursor-grabbing"><GripVertical size={14} /></button>
                <button onClick={() => setEdition(it)}
                  className="btn-ghost p-1 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-60" title="Modifier" aria-label="Modifier">
                  <Pencil size={13} />
                </button>
                <button onClick={() => void s.remove('shopping_items', it.id)}
                  className="btn-ghost p-1 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-60" title="Retirer" aria-label="Retirer">
                  <Trash2 size={13} />
                </button>
                <button onClick={() => void s.update('shopping_items', it.id, { checked: !it.checked })}
                  className="flex flex-1 items-center gap-2.5 py-1 text-left">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                    it.checked ? 'border-good/70 bg-good/70 text-white' : 'border-line-2 hover:border-ink-3'
                  }`}>
                    {it.checked && <Check size={13} />}
                  </span>
                  <span className="text-sm text-ink">{it.label}</span>
                  {textePrix(it) && <span className="ml-auto shrink-0 text-xs tabular-nums text-ink-3">{textePrix(it)}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )

  return (
    <div onWheel={surMolette}>
    <Card className="!p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="truncate font-semibold">{list.name}</h2>
          {shown.length > 0 && <span className="shrink-0 text-xs text-ink-3">{bought}/{shown.length}</span>}
          {totalTexte && <span className="shrink-0 text-xs text-ink-3" title="Estimation des articles non cochés">· ≈ {totalTexte}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!avecSous && (
            <button onClick={ajouterSousListe} className="btn-ghost p-1.5" title="Créer une sous-liste" aria-label="Créer une sous-liste">
              <ListPlus size={15} />
            </button>
          )}
          {bought > 0 && (
            <button onClick={() => void s.resetShopping(list.id)}
              className="btn-ghost flex items-center gap-1 px-2 py-1 text-xs" title="Tout décocher pour la prochaine fois">
              <RotateCcw size={13} /> Décocher
            </button>
          )}
          <button onClick={() => { if (confirm(`Supprimer la liste « ${list.name} » et tous ses articles ?`)) void s.remove('shopping_lists', list.id) }}
            className="btn-ghost p-1.5" title="Supprimer la liste" aria-label="Supprimer la liste">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {avecSous ? (
        <>
          <div className="mb-2 flex gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {sections.map((sec, i) => (
              <button key={sec || '__'} data-onglet={sec} onClick={() => { onTab(sec); aller(i) }}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-sm transition-colors ${
                  courant === sec ? 'bg-sun/15 text-sun-soft' : 'text-ink-2 hover:bg-panel-2 hover:text-ink'
                } ${drag?.onglet === sec ? 'ring-2 ring-sun' : ''}`}>
                {libelleSection(sec)}
              </button>
            ))}
            <button onClick={ajouterSousListe} title="Nouvelle sous-liste" aria-label="Nouvelle sous-liste"
              className="btn-ghost flex shrink-0 items-center rounded-lg border border-dashed border-line px-2 py-1"><Plus size={14} /></button>
          </div>
          <div ref={volet} onScroll={surDefilement} data-testid="volets-rayons"
            className="-mx-3 flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {sections.map((sec) => (
              <div key={sec || '__'} className="w-full shrink-0 snap-center snap-always px-3">
                {articles(items.filter((it) => (it.section ?? '') === sec))}
              </div>
            ))}
          </div>
        </>
      ) : articles(shown)}

      {edition && <EditItem item={edition} onClose={() => setEdition(null)} />}
      <AddItem list={list} section={avecSous && courant !== '' ? courant : null} count={items.length} />
    </Card>
    </div>
  )
}

function EditItem({ item, onClose }: { item: ShoppingItem; onClose: () => void }) {
  const s = useHorizon()
  const [label, setLabel] = useState(item.label)
  const [min, setMin] = useState(item.price_min?.toString().replace('.', ',') ?? '')
  const [max, setMax] = useState(item.price_max?.toString().replace('.', ',') ?? '')
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = label.trim()
    if (!v) return
    let a = nombre(min), b = nombre(max)
    if (a === null && b !== null) { a = b; b = null }
    if (a !== null && b !== null && b < a) [a, b] = [b, a]
    await s.update('shopping_items', item.id, { label: v, price_min: a, price_max: b === a ? null : b })
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="Modifier l’article">
      <form onSubmit={save} className="space-y-3">
        <input required value={label} onChange={(e) => setLabel(e.target.value)} autoFocus className="field w-full" />
        <div className="flex items-center gap-2 text-sm text-ink-2">
          <input value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" placeholder="Prix" className="field w-24" />
          <span>à</span>
          <input value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" placeholder="(fourchette)" className="field w-28" />
          <span>€</span>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-sm">Annuler</button>
          <button type="submit" className="btn-sun px-4 py-2 text-sm">Enregistrer</button>
        </div>
      </form>
    </Modal>
  )
}

function AddItem({ list, section, count }: { list: ShoppingList; section: string | null; count: number }) {
  const s = useHorizon()
  const [label, setLabel] = useState('')

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = label.trim()
    if (!v) return
    setLabel('')
    await s.insert('shopping_items', { list_id: list.id, label: v, section, category: null, sort_order: count })
  }

  // Barre d'ajout flottante : champ et bouton de validation toujours visibles en bas (au-dessus de la barre de raccourcis du téléphone).
  return (
    <form onSubmit={add}
      className="fixed inset-x-3 bottom-6 z-30 flex gap-2 rounded-2xl border border-line-2 bg-panel/95 p-2 shadow-lg shadow-black/40 backdrop-blur max-md:bottom-[calc(76px+env(safe-area-inset-bottom))] lg:left-56 lg:right-24">
      <input value={label} onChange={(e) => setLabel(e.target.value)}
        placeholder={section ? `Ajouter dans « ${libelleSection(section)} »…` : 'Ajouter un article…'}
        className="field flex-1" />
      <button type="submit" disabled={!label.trim()} aria-label="Ajouter" className="btn-sun px-3.5 py-2 text-sm disabled:opacity-50">
        <Plus size={16} />
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
          Liste récurrente (4 rayons : alimentaire, bio, non-alimentaire)
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-sm">Annuler</button>
          <button type="submit" className="btn-sun px-4 py-2 text-sm">Créer</button>
        </div>
      </form>
    </Modal>
  )
}
