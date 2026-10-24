import { euros } from '../../lib/finances'
import type { Soldes } from '../../lib/soldes'
import { IconeDeCompte } from './IconeCompte'

const jour = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })

/** Une ligne par compte (icône, nom, solde, date du solde en petit), total en bas. */
export function ListeSoldes({ soldes }: { soldes: Soldes }) {
  return (
    <div data-testid="liste-soldes" className="space-y-2 text-sm">
      {soldes.comptes.map((a) => (
        <div key={a.id} data-testid="ligne-solde" className="flex items-center gap-2.5">
          <IconeDeCompte compte={a} taille={22} />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{a.name}</span>
            {a.balance_at && <span className="block text-[11px] leading-tight text-ink-3">{jour(a.balance_at)}</span>}
          </span>
          <span className={`shrink-0 tabular-nums ${Number(a.balance) < 0 ? 'text-[#ef5a36]' : ''}`}>{euros(Number(a.balance), true)}</span>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2 font-semibold">
        <span>Total</span><span data-testid="total-soldes" className="tabular-nums">{euros(soldes.total, true)}</span>
      </div>
    </div>
  )
}

/** Panneau déplié sous la barre « Comptes » : une ligne par compte, total en bas. */
export function PanneauSoldes({ soldes }: { soldes: Soldes }) {
  return <div data-testid="fenetre-soldes" className="card mx-auto w-full max-w-md px-4 py-3"><ListeSoldes soldes={soldes} /></div>
}
