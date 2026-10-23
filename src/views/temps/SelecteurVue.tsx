import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

/** Choix de la vue (Semaine / Mois / Trimestre / Année) : un seul bouton-liste qui affiche la vue
 *  courante et déroule les autres. Typographie de l'écran de connexion : initiale manuscrite
 *  (Champignon) suivie du reste en écriture normale, sur la même ligne de base. */
export function SelecteurVue<T extends string>({ options, value, onChange, compact = false }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void
  /** Téléphone : un seul bouton-liste. Sinon (ordinateur) : boutons côte à côte. */
  compact?: boolean
}) {
  return compact ? <ListeVue options={options} value={value} onChange={onChange} /> : <BoutonsVue options={options} value={value} onChange={onChange} />
}

function BoutonsVue<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label="Vue" className="flex rounded-xl border border-line bg-panel-2 p-0.5">
      {options.map((o) => {
        const actif = o.value === value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={actif} onClick={() => onChange(o.value)}
            className={`rounded-lg px-3 py-1 text-sm transition-colors ${
              actif ? 'bg-sun/15 font-medium text-sun-soft' : 'text-ink-2 hover:bg-panel-3'}`}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function ListeVue<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const racine = useRef<HTMLDivElement>(null)
  const courant = options.find((o) => o.value === value) ?? options[0]!

  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: PointerEvent) => { if (!racine.current?.contains(e.target as Node)) setOuvert(false) }
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false) }
    document.addEventListener('pointerdown', dehors)
    document.addEventListener('keydown', echap)
    return () => { document.removeEventListener('pointerdown', dehors); document.removeEventListener('keydown', echap) }
  }, [ouvert])

  return (
    <div ref={racine} className="relative shrink-0">
      <button type="button" aria-haspopup="listbox" aria-expanded={ouvert} aria-label={`Vue : ${courant.label}`} onClick={() => setOuvert(!ouvert)}
        className="flex h-7 items-baseline rounded-xl border border-line bg-panel-2 pl-1.5 pr-1 pt-0.5 text-[12.5px] tracking-wide text-ink transition-colors hover:bg-panel-3">
        <Lettrine texte={courant.label} actif />
        <ChevronDown size={11} className={`ml-0.5 self-center text-ink-3 transition-transform ${ouvert ? 'rotate-180' : ''}`} />
      </button>
      {ouvert && (
        <ul role="listbox" aria-label="Vue" className="absolute right-0 z-50 mt-1 min-w-[9.5rem] rounded-xl border border-line-2 bg-panel p-1 shadow-lg shadow-black/50 max-md:left-0 max-md:right-auto">
          {options.map((o) => {
            const actif = o.value === value
            return (
              <li key={o.value} role="option" aria-selected={actif}>
                <button type="button" aria-label={o.label} onClick={() => { onChange(o.value); setOuvert(false) }}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm tracking-wide transition-colors ${
                    actif ? 'bg-sun/15 text-sun-soft' : 'text-ink-2 hover:bg-panel-3'}`}>
                  <span className="flex items-baseline"><Lettrine texte={o.label} actif={actif} /></span>
                  {actif && <Check size={13} />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Initiale manuscrite (police de l'écran de connexion) + reste du mot. */
function Lettrine({ texte, actif }: { texte: string; actif: boolean }) {
  return (
    <>
      <span aria-hidden className={`font-['Champignon',cursive] text-[20px] leading-none ${actif ? 'text-sun-soft' : 'text-sun-soft/75'}`}>{texte[0]}</span>
      <span aria-hidden>{texte.slice(1)}</span>
    </>
  )
}
