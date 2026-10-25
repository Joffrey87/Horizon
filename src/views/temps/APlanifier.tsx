import { useEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { useHorizon } from '../../lib/store'

/** Colonne « À planifier » de la vue Semaine (ordinateur) : une liste libre par semaine, chaque élément se coche
 *  quand il est planifié dans la semaine. Mémorisée dans un layout (projection `temps-aplanifier`, une entrée par lundi),
 *  donc retrouvée sur tous les appareils ; les semaines de plus de 10 semaines sont oubliées. */
const PROJECTION = 'temps-aplanifier'
const GARDER_SEMAINES = 10

interface Element { id: string; texte: string; fait: boolean }
type Semaines = Record<string, Element[]>

const lire = (data: unknown, semaine: string): Element[] => {
  const s = (data as { semaines?: Semaines } | undefined)?.semaines
  return Array.isArray(s?.[semaine]) ? s![semaine]! : []
}

export function APlanifier({ semaine }: { semaine: string }) {
  const layout = useHorizon((s) => s.layouts.find((l) => l.projection === PROJECTION))
  const [items, setItems] = useState<Element[]>(() => lire(layout?.data, semaine))
  const [texte, setTexte] = useState('')
  const modifie = useRef(false)
  const file = useRef<Promise<void>>(Promise.resolve())

  // Changement de semaine, ou données serveur arrivées : on repart de ce qui est enregistré (sauf frappe en cours).
  useEffect(() => { modifie.current = false; setItems(lire(layout?.data, semaine)) }, [semaine]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!modifie.current) setItems(lire(layout?.data, semaine)) }, [layout]) // eslint-disable-line react-hooks/exhaustive-deps

  const ecrire = (next: Element[]) => {
    file.current = file.current.then(async () => {
      const s = useHorizon.getState()
      const cur = s.layouts.find((l) => l.projection === PROJECTION)
      const semaines: Semaines = { ...((cur?.data as { semaines?: Semaines } | undefined)?.semaines ?? {}), [semaine]: next }
      for (const k of Object.keys(semaines).sort().slice(0, -GARDER_SEMAINES)) delete semaines[k]
      const data = { ...(cur?.data ?? {}), semaines }
      if (cur) await s.update('layouts', cur.id, { data, updated_at: new Date().toISOString() })
      else await s.insert('layouts', { name: 'À planifier', projection: PROJECTION, is_default: false, data })
    })
  }
  const maj = (next: Element[]) => { modifie.current = true; setItems(next); ecrire(next) }

  const ajouter = (e: React.FormEvent) => {
    e.preventDefault()
    const t = texte.trim()
    if (!t) return
    setTexte('')
    maj([...items, { id: crypto.randomUUID(), texte: t, fait: false }])
  }

  const restants = items.filter((i) => !i.fait).length
  return (
    <section aria-label="À planifier" className="flex min-w-0 flex-col rounded-xl px-0.5 pb-2" data-testid="a-planifier">
      <div className="mb-1.5 w-full py-1 text-center">
        <small className="block text-[10px] uppercase tracking-[0.08em] text-ink-3">À planifier</small>
        <span className="inline-block px-1.5 py-px text-[13px] font-semibold text-ink">{items.length ? `${restants}/${items.length}` : '—'}</span>
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((i) => (
          <li key={i.id} className="group flex items-start gap-1.5 rounded-lg border border-dashed border-line-2/70 px-1.5 py-1">
            <button type="button" onClick={() => maj(items.map((x) => (x.id === i.id ? { ...x, fait: !x.fait } : x)))}
              aria-label={i.fait ? 'Remettre à planifier' : 'Marquer planifié'} aria-pressed={i.fait}
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${i.fait ? 'border-[#4cc79a] bg-[#4cc79a] text-[#0f0d0a]' : 'border-ink-3 hover:border-sun'}`}>
              {i.fait && <Check size={11} strokeWidth={3} />}
            </button>
            <span className={`min-w-0 flex-1 break-words text-[12px] leading-snug ${i.fait ? 'text-ink-3 line-through' : 'text-ink'}`}>{i.texte}</span>
            <button type="button" onClick={() => maj(items.filter((x) => x.id !== i.id))} aria-label="Retirer"
              className="shrink-0 text-ink-3 opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"><X size={12} /></button>
          </li>
        ))}
      </ul>
      <form onSubmit={ajouter} className="mt-1.5">
        <input value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="À planifier…" aria-label="Ajouter à planifier"
          className="field w-full !px-2 !py-1 text-[12px]" />
      </form>
    </section>
  )
}
