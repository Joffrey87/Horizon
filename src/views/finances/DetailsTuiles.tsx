import type { ReactNode } from 'react'
import { euros, type listeEpargnes } from '../../lib/finances'

/** Une ligne compacte du détail d'une tuile : libellé à gauche, montant à droite. */
function LigneDetail({ nom, montant, signe, fin = false, sous = false }: { nom: ReactNode; montant: number; signe?: '−' | '+'; fin?: boolean; sous?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${sous ? 'pl-3 text-xs text-ink-3' : fin ? 'border-t border-line pt-1.5 font-semibold' : ''}`}>
      <span className="min-w-0 truncate">{nom}</span>
      <span className="shrink-0 tabular-nums">{signe ? `${signe} ` : ''}{euros(Math.abs(montant))}</span>
    </div>
  )
}

/** Détail synthétique de la tuile « Reste » : budget − dépensé − à venir − épargnes prévues = résultat. */
export function DetailReste({ budget, depense, aVenir, epargnes, capital, resteTuile }: {
  budget: number; depense: number; capital: number; resteTuile: number
  aVenir: { total: number; details: { nom: string; montant: number }[] }
  epargnes: { total: number; details: { nom: string; montant: number }[] }
}) {
  const quelques = (ds: { nom: string; montant: number }[]) => {
    const tete = ds.slice(0, 3)
    const autres = ds.slice(3).reduce((t, d) => t + d.montant, 0)
    return autres > 0.5 ? [...tete, { nom: 'Autres', montant: autres }] : tete
  }
  return (
    <div data-testid="detail-reste" className="card mx-auto w-full max-w-md space-y-1 px-4 py-3 text-sm">
      <LigneDetail nom="Budget des dépenses" montant={budget} />
      <LigneDetail nom="Déjà dépensé" montant={depense} signe="−" />
      <LigneDetail nom="À venir (récurrentes, courses)" montant={aVenir.total} signe="−" />
      {quelques(aVenir.details).map((d) => <LigneDetail key={d.nom} nom={d.nom} montant={d.montant} sous />)}
      {epargnes.total > 0.5 && <LigneDetail nom="Épargnes prévues restantes" montant={epargnes.total} signe="−" />}
      {quelques(epargnes.details).map((d) => <LigneDetail key={d.nom} nom={d.nom} montant={d.montant} sous />)}
      <LigneDetail fin nom={resteTuile < 0 ? 'Au-delà du budget' : 'Reste'} montant={resteTuile} />
      {capital > 0.5 && (
        <p className="pt-1 text-[11px] text-ink-3">Le capital remboursé ({euros(capital)}) n’est pas une dépense : il compte en épargne.</p>
      )}
    </div>
  )
}

/** Épargnes du mois, une ligne chacune : faite, prévue (ou prêt payé hors budget, pour information). */
export function DetailEpargne({ liste }: { liste: ReturnType<typeof listeEpargnes> }) {
  const badge = (etat: 'fait' | 'prevu') => etat === 'fait'
    ? <span className="whitespace-nowrap rounded-full border border-[#4cc79a]/50 px-1.5 text-[10px] uppercase tracking-wider text-[#4cc79a]">fait</span>
    : <span className="whitespace-nowrap rounded-full border border-[#eda145]/50 px-1.5 text-[10px] uppercase tracking-wider text-[#eda145]">prévu</span>
  return (
    <div data-testid="detail-epargne" className="card mx-auto w-full max-w-md space-y-1 px-4 py-3 text-sm">
      {liste.lignes.length === 0 && <p className="text-ink-3">Aucune épargne ce mois-ci.</p>}
      {liste.lignes.map((l) => (
        <div key={`${l.nom}-${l.etat}`} className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2"><span className="truncate">{l.nom}</span>{badge(l.etat)}</span>
          <span className="shrink-0 tabular-nums">{euros(l.montant)}</span>
        </div>
      ))}
      <LigneDetail fin nom="Total fait" montant={liste.fait} />
      {liste.prevu > 0.5 && <LigneDetail nom="Encore prévu" montant={liste.prevu} />}
    </div>
  )
}
