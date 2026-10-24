import type { ReactNode } from 'react'
import { euros, type LigneBudget, type listeEpargnes } from '../../lib/finances'

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

/** Variante retenue pour le détail « Au-delà du budget » (A, B ou C). */
export const VARIANTE_AU_DELA: 'A' | 'B' | 'C' = 'A'
const VERT = '#4cc79a'

export interface LignesAuDela {
  budgets: { nom: string; montant: number }[]   // > 0 : reste ; < 0 : dépassé
  prevu: { nom: string; montant: number }[]     // < 0 : dépense ; > 0 : recette
  total: number
}

/** Les lignes du détail : une par grand budget (budget − dépensé), puis chaque opération prévue du mois. */
export function lignesAuDela(depenses: LigneBudget[], aVenir: { details: { nom: string; montant: number }[] },
  epargnes: { details: { nom: string; montant: number }[] }): LignesAuDela {
  const budgets = depenses
    .filter((l) => (l.budget ?? 0) > 0.5 || Math.abs(l.reel) > 0.5)
    .map((l) => ({ nom: l.ligne?.name ?? 'Non classé', montant: (l.budget ?? 0) - l.reel }))
  const prevu = [...aVenir.details, ...epargnes.details].map((d) => ({ nom: d.nom, montant: -d.montant }))
  const total = [...budgets, ...prevu].reduce((t, d) => t + d.montant, 0)
  return { budgets, prevu, total }
}

const signe = (m: number) => `${m > 0.005 ? '+' : m < -0.005 ? '−' : ''} ${euros(Math.abs(m))}`.trim()
const sommeDe = (ls: { montant: number }[]) => ls.reduce((t, d) => t + d.montant, 0)

function Ligne({ nom, montant, gras = false, vertSiPositif = true }: { nom: string; montant: number; gras?: boolean; vertSiPositif?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${gras ? 'font-semibold' : ''}`}>
      <span className="min-w-0 truncate">{nom}</span>
      <span className="shrink-0 tabular-nums" style={vertSiPositif && montant > 0.5 ? { color: VERT } : undefined}>{signe(montant)}</span>
    </div>
  )
}

/** Détail de la tuile « Au-delà du budget » : Budgets (reste ou dépassement), Prévu, puis le total (= tuile). */
export function DetailAuDela({ lignes, variante = VARIANTE_AU_DELA }: { lignes: LignesAuDela; variante?: 'A' | 'B' | 'C' }) {
  const { budgets, prevu, total } = lignes
  const titreTotal = total < 0 ? 'Au-delà du budget' : 'Reste'
  const titre = (t: string, sousTotal?: number) => (
    <div className="flex items-baseline justify-between pt-1 text-[10.5px] font-semibold uppercase tracking-[.08em] text-ink-3">
      <span>{t}</span>{sousTotal !== undefined && <span className="tabular-nums">{signe(sousTotal)}</span>}
    </div>
  )
  if (variante === 'B') {
    // B : sous-total de chaque section à droite de son titre ; lignes en retrait, plus légères.
    return (
      <div data-testid="detail-reste" data-variante="B" className="card mx-auto w-full max-w-md space-y-2 px-4 py-3 text-sm">
        <div className="space-y-0.5">{titre('Budgets', sommeDe(budgets))}{budgets.map((d) => <div key={d.nom} className="pl-2 text-ink-2"><Ligne {...d} /></div>)}</div>
        {prevu.length > 0 && <div className="space-y-0.5">{titre('Prévu', sommeDe(prevu))}{prevu.map((d, i) => <div key={i} className="pl-2 text-ink-2"><Ligne {...d} /></div>)}</div>}
        <div className="border-t border-line pt-1.5"><Ligne gras nom={titreTotal} montant={total} vertSiPositif={false} /></div>
      </div>
    )
  }
  if (variante === 'C') {
    // C : relevé en deux colonnes séparées par de fins filets, total en grand comme sur la tuile.
    const rangee = (d: { nom: string; montant: number }, k: string | number) => (
      <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line/50 py-1 last:border-b-0">
        <span className="min-w-0 truncate">{d.nom}</span>
        <span className="shrink-0 tabular-nums" style={d.montant > 0.5 ? { color: VERT } : undefined}>{signe(d.montant)}</span>
      </div>
    )
    return (
      <div data-testid="detail-reste" data-variante="C" className="card mx-auto w-full max-w-md px-4 py-3 text-sm">
        {titre('Budgets')}<div>{budgets.map((d) => rangee(d, d.nom))}</div>
        {prevu.length > 0 && <><div className="h-2" />{titre('Prévu')}<div>{prevu.map((d, i) => rangee(d, i))}</div></>}
        <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2">
          <span className="font-semibold">{titreTotal}</span>
          <span className="text-lg font-bold tabular-nums">{signe(total)}</span>
        </div>
      </div>
    )
  }
  // A : liste simple, titres de section discrets, total souligné.
  return (
    <div data-testid="detail-reste" data-variante="A" className="card mx-auto w-full max-w-md space-y-1 px-4 py-3 text-sm">
      {titre('Budgets', sommeDe(budgets))}
      {budgets.map((d) => <Ligne key={d.nom} {...d} />)}
      {prevu.length > 0 && <>{titre('Prévu')}{prevu.map((d, i) => <Ligne key={i} {...d} />)}</>}
      <div className="border-t border-line pt-1.5"><Ligne gras nom={titreTotal} montant={total} vertSiPositif={false} /></div>
    </div>
  )
}
