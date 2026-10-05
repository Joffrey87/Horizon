import { useState } from 'react'
import { format, setMonth } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarCheck, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Modal } from '../../components/ui'

/** Navigation de la vue Mois, fusionnée avec le nom du mois : ‹ octobre 2026 ›.
 *  Les flèches changent de mois ; le nom ouvre un sélecteur (année + 12 mois)
 *  et un raccourci « Aujourd'hui » — ce que faisaient les trois boutons du haut. */
export function NavMois({ anchor, onShift, onGoto }: {
  anchor: Date
  onShift: (dir: 1 | -1) => void
  onGoto: (d: Date) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const [annee, setAnnee] = useState(anchor.getFullYear())

  const choisir = (mois: number) => {
    onGoto(setMonth(new Date(annee, 0, 1), mois))
    setOuvert(false)
  }

  return (
    <div className="flex shrink-0 items-center justify-center gap-1">
      <button onClick={() => onShift(-1)} className="btn-ghost p-2" aria-label="Mois précédent"><ChevronLeft size={16} /></button>
      <button onClick={() => { setAnnee(anchor.getFullYear()); setOuvert(true) }}
        aria-haspopup="dialog" title="Choisir un mois"
        className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-base font-semibold capitalize transition-colors hover:bg-panel-2">
        {format(anchor, 'MMMM yyyy', { locale: fr })}
        <ChevronDown size={14} className="text-ink-3" />
      </button>
      <button onClick={() => onShift(1)} className="btn-ghost p-2" aria-label="Mois suivant"><ChevronRight size={16} /></button>

      {ouvert && (
        <Modal open onClose={() => setOuvert(false)} title="Choisir un mois" compact>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <button onClick={() => setAnnee((a) => a - 1)} className="btn-ghost p-2" aria-label="Année précédente"><ChevronLeft size={16} /></button>
              <span className="text-base font-semibold tabular-nums">{annee}</span>
              <button onClick={() => setAnnee((a) => a + 1)} className="btn-ghost p-2" aria-label="Année suivante"><ChevronRight size={16} /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 12 }, (_, m) => {
                const actif = annee === anchor.getFullYear() && m === anchor.getMonth()
                return (
                  <button key={m} onClick={() => choisir(m)} aria-pressed={actif}
                    className={`rounded-xl border px-2 py-2 text-sm capitalize transition-colors ${
                      actif ? 'border-sun bg-sun/15 text-sun-soft' : 'border-line-2 text-ink-2 hover:bg-panel-2'}`}>
                    {format(new Date(annee, m, 1), 'MMMM', { locale: fr })}
                  </button>
                )
              })}
            </div>
            <button onClick={() => { onGoto(new Date()); setOuvert(false) }}
              className="btn-ghost flex w-full items-center justify-center gap-2 py-2 text-sm">
              <CalendarCheck size={15} /> Aujourd'hui
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
