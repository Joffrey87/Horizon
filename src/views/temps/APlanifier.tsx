import { useEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { useHorizon } from '../../lib/store'

/** Colonne « À planifier » de la vue Semaine (ordinateur), en deux parties : en haut une liste COMMUNE à toutes les
 *  semaines (`commun`), en bas une liste propre à la semaine affichée. Chaque élément se coche
 *  quand il est planifié dans la semaine. Mémorisée dans un layout (projection `temps-aplanifier`, une entrée par lundi),
 *  donc retrouvée sur tous les appareils ; les semaines de plus de 10 semaines sont oubliées. */
const PROJECTION = 'temps-aplanifier'
const GARDER_SEMAINES = 10

interface Element { id: string; texte: string; fait: boolean }
type Semaines = Record<string, Element[]>
type Donnees = { semaines?: Semaines; commun?: Element[] }

const lire = (data: unknown, semaine: string): Element[] => {
  const s = (data as { semaines?: Semaines } | undefined)?.semaines
  return Array.isArray(s?.[semaine]) ? s![semaine]! : []
}

const lireCommun = (data: unknown): Element[] => {
  const c = (data as Donnees | undefined)?.commun
  return Array.isArray(c) ? c : []
}

export function APlanifier({ semaine }: { semaine: string }) {
  const layout = useHorizon((s) => s.layouts.find((l) => l.projection === PROJECTION))
  const [items, setItems] = useState<Element[]>(() => lire(layout?.data, semaine))
  const [commun, setCommun] = useState<Element[]>(() => lireCommun(layout?.data))
  const modifie = useRef(false)
  const file = useRef<Promise<void>>(Promise.resolve())

  // Changement de semaine, ou données serveur arrivées : on repart de ce qui est enregistré (sauf frappe en cours).
  const recharger = () => { setItems(lire(layout?.data, semaine)); setCommun(lireCommun(layout?.data)) }
  useEffect(() => { modifie.current = false; recharger() }, [semaine]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!modifie.current) recharger() }, [layout]) // eslint-disable-line react-hooks/exhaustive-deps

  const ecrire = (fusion: (d: Donnees) => Donnees) => {
    file.current = file.current.then(async () => {
      const s = useHorizon.getState()
      const cur = s.layouts.find((l) => l.projection === PROJECTION)
      const data = fusion({ ...((cur?.data as Donnees | undefined) ?? {}) })
      if (cur) await s.update('layouts', cur.id, { data, updated_at: new Date().toISOString() })
      else await s.insert('layouts', { name: 'À planifier', projection: PROJECTION, is_default: false, data })
    })
  }
  const majSemaine = (next: Element[]) => {
    modifie.current = true; setItems(next)
    ecrire((d) => {
      const semaines: Semaines = { ...(d.semaines ?? {}), [semaine]: next }
      for (const k of Object.keys(semaines).sort().slice(0, -GARDER_SEMAINES)) delete semaines[k]
      return { ...d, semaines }
    })
  }
  const majCommun = (next: Element[]) => {
    modifie.current = true; setCommun(next)
    ecrire((d) => ({ ...d, commun: next }))
  }

  return (
    <section aria-label="À planifier" data-testid="a-planifier" style={{ gridColumn: 1, gridRow: '1 / span 3' }}
      // Sans coller au bord : le contenu a sa propre marge intérieure.
      className="flex min-h-0 min-w-0 flex-col gap-2 rounded-xl bg-white/[0.03] px-2.5 pb-2">
      <ListeLibre titre="Toutes les semaines" items={commun} onChange={majCommun} />
      <div className="border-t border-line-2/50" />
      <ListeLibre titre="Cette semaine" items={items} onChange={majSemaine} />
    </section>
  )
}

function ListeLibre({ titre, items, onChange }: { titre: string; items: Element[]; onChange: (next: Element[]) => void }) {
  const [texte, setTexte] = useState('')
  // Glisser-déposer pour réordonner : l'élément saisi et l'endroit visé (avant/après un autre, ou tout en bas).
  const [saisi, setSaisi] = useState<string | null>(null)
  const [visee, setVisee] = useState<{ id: string | null; apres: boolean } | null>(null)
  const maj = onChange

  const ajouter = (e: React.FormEvent) => {
    e.preventDefault()
    const t = texte.trim()
    if (!t) return
    setTexte('')
    maj([...items, { id: crypto.randomUUID(), texte: t, fait: false }])
  }

  const deposer = () => {
    const v = visee
    setSaisi(null); setVisee(null)
    const mobile = items.find((x) => x.id === saisi)
    if (!mobile || !v) return
    const reste = items.filter((x) => x.id !== mobile.id)
    const cible = v.id ? reste.findIndex((x) => x.id === v.id) : -1
    const idx = cible < 0 ? reste.length : cible + (v.apres ? 1 : 0)
    const suivant = [...reste.slice(0, idx), mobile, ...reste.slice(idx)]
    if (suivant.some((x, i) => x.id !== items[i]?.id)) maj(suivant)
  }

  const restants = items.filter((i) => !i.fait).length
  return (
    <div aria-label={titre} className="flex min-h-0 flex-1 flex-col"
      onDragOver={(e) => { if (saisi) { e.preventDefault(); setVisee((v) => v ?? { id: null, apres: true }) } }}
      onDrop={(e) => { if (saisi) { e.preventDefault(); deposer() } }}>
      <div className="mb-1.5 w-full py-1 text-center">
        <small className="block text-[10px] uppercase tracking-[0.08em] text-ink-3">{titre}</small>
        <span className="inline-block px-1.5 py-px text-[13px] font-semibold text-ink">{items.length ? `${restants}/${items.length}` : '—'}</span>
      </div>
      <ul className="flex flex-col gap-1 overflow-y-auto">
        {items.map((i) => (
          <li key={i.id} draggable
            onDragStart={(e) => { e.dataTransfer.setData('application/horizon-aplanifier', i.id); e.dataTransfer.effectAllowed = 'move'; setSaisi(i.id) }}
            onDragEnd={() => { setSaisi(null); setVisee(null) }}
            onDragOver={(e) => {
              if (!saisi || saisi === i.id) return
              e.preventDefault(); e.stopPropagation()
              const r = e.currentTarget.getBoundingClientRect()
              setVisee({ id: i.id, apres: e.clientY > r.top + r.height / 2 })
            }}
            className={`group flex cursor-grab items-start gap-1.5 rounded-lg border border-dashed border-line-2/70 px-1.5 py-1 ${saisi === i.id ? 'opacity-40' : ''} ${
              visee?.id === i.id ? (visee.apres ? 'border-b-2 border-b-sun' : 'border-t-2 border-t-sun') : ''}`}>
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
        <input value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="À planifier…" aria-label={`Ajouter — ${titre}`}
          className="field w-full !px-2 !py-1 text-[12px]" />
      </form>
    </div>
  )
}
