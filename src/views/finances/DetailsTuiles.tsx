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

/**
 * Détail de la tuile « Reste » : d'abord ce qui est encore à venir (dépenses, épargnes prévues), puis le Reste,
 * puis en petit le rappel « (Budget − Déjà dépensé) » avec les vrais chiffres du mois.
 */
export function DetailReste({ budget, depense, aVenir, epargnes, resteTuile }: {
  budget: number; depense: number; resteTuile: number
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
      <LigneDetail nom="À venir (récurrentes, courses)" montant={aVenir.total} signe="−" />
      {quelques(aVenir.details).map((d) => <LigneDetail key={d.nom} nom={d.nom} montant={d.montant} sous />)}
      {epargnes.total > 0.5 && <LigneDetail nom="Épargnes prévues restantes" montant={epargnes.total} signe="−" />}
      {quelques(epargnes.details).map((d) => <LigneDetail key={d.nom} nom={d.nom} montant={d.montant} sous />)}
      <LigneDetail fin nom={resteTuile < 0 ? 'Au-delà du budget' : 'Reste'} montant={resteTuile} />
      <p data-testid="detail-reste-calcul" className="pt-0.5 text-[11px] text-ink-3">
        (Budget ({euros(budget)}) - Déjà dépensé ({euros(depense)}))
      </p>
    </div>
  )
}

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
/** « 1 oct. » */
const dateJour = (iso: string) => `${Number(iso.slice(8, 10))} ${MOIS_COURTS[Number(iso.slice(5, 7)) - 1]}`

/** Épargnes du mois, une ligne chacune : faite, prévue (ou prêt payé hors budget, pour information). */
export function DetailEpargne({ liste }: { liste: ReturnType<typeof listeEpargnes> }) {
  const badge = (etat: 'fait' | 'prevu') => etat === 'fait'
    ? <span className="whitespace-nowrap rounded-full border border-[#4cc79a]/50 px-1.5 text-[10px] uppercase tracking-wider text-[#4cc79a]">fait</span>
    : <span className="whitespace-nowrap rounded-full border border-[#eda145]/50 px-1.5 text-[10px] uppercase tracking-wider text-[#eda145]">prévu</span>
  return (
    <div data-testid="detail-epargne" className="card mx-auto w-full max-w-md space-y-1 px-4 py-3 text-sm">
      {liste.lignes.length === 0 && <p className="text-ink-3">Aucune épargne ce mois-ci.</p>}
      {liste.lignes.map((l) => (
        <div key={`${l.nom}-${l.etat}`}>
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2"><span className="truncate">{l.nom}</span>{badge(l.etat)}</span>
            <span className="shrink-0 tabular-nums">{euros(l.montant)}</span>
          </div>
          {l.pastilles && l.pastilles.length > 0 && (
            <div data-testid="pastilles-epargne" className="flex flex-wrap gap-1 pl-3">
              {l.pastilles.map((p, i) => (
                <span key={i} className="whitespace-nowrap rounded-full bg-[#c9b48a]/15 px-2 text-[10.5px] leading-4 tabular-nums text-[#d8c7a3]">
                  {p.type === 'operation' ? `${dateJour(p.date!)} · ${euros(p.montant, true)}` : `− ${euros(p.montant, true)} ${p.texte}`}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
      <LigneDetail fin nom="Total fait" montant={liste.fait} />
      {liste.prevu > 0.5 && <LigneDetail nom="Encore prévu" montant={liste.prevu} />}
    </div>
  )
}
