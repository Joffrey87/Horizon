import { useMemo } from 'react'
import { useHorizon } from '../../lib/store'
import { NON_CLASSE, agreger, bilan, euros, libelleMois, moisEcoules } from '../../lib/finances'
import { Card, EmptyState } from '../../components/ui'
import { FiltreSeg, NavMois, Tuile } from './partage'
import { useFin, useIndex } from './contexte'
import { BarresMois } from './graphiques'

/** Bilan des 6 mois qui précèdent le mois choisi : mois par mois, puis global. */
export function BilanView() {
  const { mois, setMois, filtre, setFiltre } = useFin()
  const transactions = useHorizon((s) => s.finTransactions)
  const lines = useHorizon((s) => s.finLines)
  const budgets = useHorizon((s) => s.finBudgets)
  const idx = useIndex()
  const periode = useMemo(() => moisEcoules(mois, 6), [mois])
  const agregat = useMemo(() => agreger(transactions, idx, filtre), [transactions, idx, filtre])
  const b = useMemo(() => bilan({ mois: periode, lines, budgets, agregat, filtre }), [periode, lines, budgets, agregat, filtre])
  const foyer = filtre === 'foyer'

  if (!lines.length) return <EmptyState hint="Crée tes lignes de budget dans Réglages.">Rien à résumer pour l’instant.</EmptyState>

  const ecart = b.total.budget !== null ? b.total.budget - b.total.reel : null
  const solde = b.total.entrees - b.total.reel
  const souventDepassees = b.lignes.filter((l) => l.depassements > 0).sort((x, y) => y.depassements - x.depassements).slice(0, 3)

  return (
    <div className="rise space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-2">Les 6 mois avant</span>
          <NavMois mois={mois} onChange={setMois} />
        </div>
        <FiltreSeg value={filtre} onChange={setFiltre} />
      </header>
      <p className="text-xs text-ink-3">
        De {libelleMois(periode[0]!)} à {libelleMois(periode.at(-1)!)}.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tuile titre="Dépensé + épargné" valeur={euros(b.total.reel)} detail={`soit ${euros(b.total.moyenne)} par mois`} />
        <Tuile titre={ecart !== null && ecart < 0 ? 'Au-delà du budget' : 'Sous le budget'}
          valeur={ecart === null ? '—' : euros(Math.abs(ecart))} ton={ecart !== null && ecart < 0 ? 'warn' : undefined}
          detail={b.total.budget !== null ? `budget cumulé ${euros(b.total.budget)}` : 'budget : vue Foyer'} />
        <Tuile titre="Entrées" valeur={euros(b.total.entrees)} detail={`soit ${euros(b.total.entrees / 6)} par mois`} />
        <Tuile titre="Solde" valeur={`${solde >= 0 ? '+' : '−'}${euros(Math.abs(solde))}`} detail="entrées − dépenses et épargne" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Dépensé par mois">
          <BarresMois donnees={b.parMois} />
          {foyer && <p className="mt-1 text-[11px] text-ink-3">Le trait pointillé marque le budget du mois ; une barre ambrée le dépasse.</p>}
        </Card>
        <Card title="En bref">
          <ul className="space-y-2 text-sm">
            {souventDepassees.length === 0
              ? <li className="text-ink-2">{foyer ? 'Aucune ligne n’a dépassé son budget sur la période.' : 'Les dépassements se lisent dans la vue Foyer.'}</li>
              : souventDepassees.map((l) => (
                <li key={l.cle} className="flex justify-between gap-3">
                  <span>{l.ligne?.name}</span>
                  <span className="text-ink-2">au-delà {l.depassements} mois sur 6</span>
                </li>
              ))}
            {b.lignes.some((l) => l.cle === NON_CLASSE) && (
              <li className="text-xs text-ink-3">« Non classé » regroupe les dépenses sans ligne : range-les dans Opérations.</li>
            )}
          </ul>
        </Card>
      </div>

      <div className="card overflow-x-auto p-4">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-ink-3">
              <th className="pb-2 pr-2 text-left font-medium">Ligne</th>
              {periode.map((m) => <th key={m} className="px-2 pb-2 text-right font-medium">{libelleMois(m, true)}</th>)}
              <th className="px-2 pb-2 text-right font-medium">Total</th>
              <th className="px-2 pb-2 text-right font-medium">Budget</th>
              <th className="pb-2 pl-2 text-right font-medium">Moyenne</th>
            </tr>
          </thead>
          <tbody>
            {b.lignes.map((l) => (
              <tr key={l.cle} className="border-t border-line/60">
                <td className={`py-1.5 pr-2 ${l.ligne ? '' : 'italic text-ink-2'}`}>{l.ligne?.name ?? 'Non classé'}</td>
                {l.cellules.map((c) => {
                  const depasse = c.budget !== null && c.budget > 0 && c.reel > c.budget + 0.5
                  return (
                    <td key={c.mois} className={`px-2 text-right tabular-nums ${depasse ? 'text-[#eda145]' : ''}`}
                      title={c.budget !== null ? `Budget ${euros(c.budget)}${depasse ? ` — ${euros(c.reel - c.budget)} au-delà` : ''}` : undefined}>
                      {c.reel ? euros(c.reel) : <span className="text-ink-3">·</span>}{depasse && <span aria-label="au-delà du budget"> ▲</span>}
                    </td>
                  )
                })}
                <td className="px-2 text-right font-medium tabular-nums">{euros(l.reel)}</td>
                <td className="px-2 text-right tabular-nums text-ink-2">{l.budget !== null ? euros(l.budget) : '—'}</td>
                <td className="pl-2 text-right tabular-nums text-ink-2">{euros(l.moyenne)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-line-2 font-semibold">
              <td className="py-2 pr-2">Total</td>
              {b.parMois.map((p) => <td key={p.mois} className="px-2 text-right tabular-nums">{euros(p.reel)}</td>)}
              <td className="px-2 text-right tabular-nums">{euros(b.total.reel)}</td>
              <td className="px-2 text-right tabular-nums">{b.total.budget !== null ? euros(b.total.budget) : '—'}</td>
              <td className="pl-2 text-right tabular-nums">{euros(b.total.moyenne)}</td>
            </tr>
            <tr className="text-ink-2">
              <td className="py-1.5 pr-2">Entrées</td>
              {b.parMois.map((p) => <td key={p.mois} className="px-2 text-right tabular-nums">{euros(p.entrees)}</td>)}
              <td className="px-2 text-right tabular-nums">{euros(b.total.entrees)}</td>
              <td />
              <td className="pl-2 text-right tabular-nums">{euros(b.total.entrees / 6)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-ink-3">▲ : au-delà du budget du mois (survole la case pour le détail).</p>
      </div>
    </div>
  )
}
