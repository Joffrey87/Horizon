import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

/** Choix de la vue (Semaine / Mois / Trimestre / Année) : un bouton qui déroule
 *  la liste, au lieu de quatre boutons côte à côte. */
export function SelecteurVue<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const racine = useRef<HTMLDivElement>(null)

  // Clic ailleurs ou Échap : la liste se referme.
  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: MouseEvent) => { if (!racine.current?.contains(e.target as Node)) setOuvert(false) }
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false) }
    document.addEventListener('mousedown', dehors)
    document.addEventListener('keydown', echap)
    return () => { document.removeEventListener('mousedown', dehors); document.removeEventListener('keydown', echap) }
  }, [ouvert])

  const actuel = options.find((o) => o.value === value)
  return (
    <div ref={racine} className="relative">
      <button onClick={() => setOuvert((o) => !o)} aria-haspopup="listbox" aria-expanded={ouvert}
        className="flex items-center gap-1.5 rounded-xl border border-line bg-panel-2 px-3 py-1.5 text-sm transition-colors hover:bg-panel-3">
        {actuel?.label}
        <ChevronDown size={14} className={`text-ink-3 transition-transform ${ouvert ? 'rotate-180' : ''}`} />
      </button>
      {ouvert && (
        <ul role="listbox" className="absolute right-0 z-30 mt-1 min-w-full overflow-hidden rounded-xl border border-line bg-panel py-1 shadow-xl shadow-black/40">
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button onClick={() => { onChange(o.value); setOuvert(false) }}
                className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm transition-colors hover:bg-panel-2 ${
                  o.value === value ? 'text-sun-soft' : 'text-ink-2'}`}>
                {o.label}
                {o.value === value && <Check size={13} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
