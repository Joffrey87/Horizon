/** Choix de la vue (Semaine / Mois / Trimestre / Année) : quatre boutons côte à
 *  côte, sur ordinateur comme sur téléphone (plus compacts sur téléphone). */
export function SelecteurVue<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label="Vue" className="flex rounded-xl border border-line bg-panel-2 p-0.5">
      {options.map((o) => {
        const actif = o.value === value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={actif} onClick={() => onChange(o.value)}
            className={`rounded-lg px-3 py-1 text-sm transition-colors max-md:px-2 max-md:py-0.5 max-md:text-xs ${
              actif ? 'bg-sun/15 font-medium text-sun-soft' : 'text-ink-2 hover:bg-panel-3'}`}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
