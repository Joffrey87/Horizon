import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { Modal } from '../../components/ui'

/** Alerte « Marché / Parking » d'un dimanche travaillé : on peut l'acquitter (c'est géré) et y noter ce qui est prévu.
 *  Mémorisé dans un layout (projection `temps-parking`, une entrée par jour), donc retrouvé d'un appareil à l'autre. */
const PROJECTION = 'temps-parking'

interface Entree { acquitte: boolean; note: string }
type Jours = Record<string, Entree>

const lire = (data: unknown): Jours => {
  const j = (data as { jours?: Jours } | undefined)?.jours
  return j && typeof j === 'object' ? j : {}
}

function useParking() {
  const layout = useHorizon((s) => s.layouts.find((l) => l.projection === PROJECTION))
  const [jours, setJours] = useState<Jours>(() => lire(layout?.data))
  const modifie = useRef(false)
  const file = useRef<Promise<void>>(Promise.resolve())
  useEffect(() => { if (!modifie.current) setJours(lire(layout?.data)) }, [layout])
  const maj = (jour: string, entree: Entree | null) => {
    modifie.current = true
    const suivant = { ...jours }
    if (entree === null) delete suivant[jour]
    else suivant[jour] = entree
    setJours(suivant)
    file.current = file.current.then(async () => {
      const s = useHorizon.getState()
      const cur = s.layouts.find((l) => l.projection === PROJECTION)
      const data = { ...(cur?.data ?? {}), jours: suivant }
      if (cur) await s.update('layouts', cur.id, { data, updated_at: new Date().toISOString() })
      else await s.insert('layouts', { name: 'Alertes parking', projection: PROJECTION, is_default: false, data })
    })
  }
  return { jours, maj }
}

export function AlerteParking({ jour }: { jour: string }) {
  const { jours, maj } = useParking()
  const e = jours[jour] ?? { acquitte: false, note: '' }
  const [ouvert, setOuvert] = useState(false)
  const [note, setNote] = useState(e.note)
  const titre = `Dimanche travaillé (début ≤ 15h) — marché dominical & stationnement compliqués${e.note ? `\n${e.note}` : ''}\nCliquer pour modifier ou acquitter`
  return (
    <>
      <button type="button" onClick={(ev) => { ev.stopPropagation(); setNote(e.note); setOuvert(true) }} title={titre}
        className={`flex w-full items-center justify-center gap-1 rounded-lg px-1 py-1 text-[9px] font-bold uppercase tracking-wide ring-1 ${
          e.acquitte ? 'bg-[#4cc79a]/15 text-[#4cc79a] ring-[#4cc79a]/40' : 'bg-[#ef4444]/20 text-[#ff6b6b] ring-[#ef4444]/40'}`}>
        {e.acquitte ? <Check size={10} /> : <AlertTriangle size={10} />} {e.acquitte ? 'Parking OK' : 'Marché / Parking'}
      </button>
      {ouvert && (
        <Modal open onClose={() => setOuvert(false)} title="Marché / Parking" compact>
          <div onClick={(ev) => ev.stopPropagation()} className="space-y-3">
            <p className="text-sm text-ink-3">Dimanche travaillé avec un début avant 15h : marché dominical et stationnement compliqués.</p>
            <textarea value={note} onChange={(ev) => setNote(ev.target.value)} rows={3} autoFocus
              placeholder="Où je me gare, ce qui est prévu…" className="field w-full text-sm" />
            <div className="flex justify-end gap-2">
              {(e.note || e.acquitte) && <button type="button" onClick={() => { maj(jour, null); setOuvert(false) }} className="btn-ghost px-3 py-1.5 text-sm">Réinitialiser</button>}
              <button type="button" onClick={() => { maj(jour, { acquitte: e.acquitte, note: note.trim() }); setOuvert(false) }} className="btn-ghost px-3 py-1.5 text-sm">Enregistrer</button>
              <button type="button" onClick={() => { maj(jour, { acquitte: !e.acquitte, note: note.trim() }); setOuvert(false) }} className="btn-sun px-3 py-1.5 text-sm">
                {e.acquitte ? 'Remettre l’alerte' : 'Acquitter'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
