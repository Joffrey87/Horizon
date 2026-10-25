import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { agregerHorsCapital, bilan, estEpargneComptee, euros, fondLigne, libelleMois, moisEcoules } from '../../lib/finances'
import { Card, EmptyState } from '../../components/ui'
import { FiltreSeg, NavMois, Tuile } from './partage'
import { moisCourant, useFin, useIndex, useTransactionsBudget } from './contexte'
import { BarresMois } from './graphiques'

const CLE_TOTAL = 'horizon.finances.bilanTotal'

/** Bilan des 6 mois qui précèdent le mois choisi : mois par mois, puis global. */
export function BilanView() {
  const { mois, setMois, filtre, setFiltre } = useFin()
  const transactions = useTransactionsBudget()
  const lines = useHorizon((s) => s.finLines)
  const budgets = useHorizon((s) => s.finBudgets)
  const echeances = useHorizon((s) => s.finEcheances)
  const navigate = useNavigate()
  // Colonne Total : cachée tant qu'on ne clique pas son intitulé (choix gardé sur cet appareil).
  const [voirTotal, setVoirTotal] = useState(() => { try { return localStorage.getItem(CLE_TOTAL) === '1' } catch { return false } })
  const basculerTotal = () => {
    setVoirTotal(!voirTotal)
    try { localStorage.setItem(CLE_TOTAL, voirTotal ? '0' : '1') } catch { /* sans mémoire, tant pis */ }
  }
  // Un mois cliqué (en-tête ou barre) ouvre le Budget de ce mois.
  const ouvrirMois = (m: string) => { setMois(m); navigate('/finances/budget') }
  const idx = useIndex()
  const periode = useMemo(() => moisEcoules(mois, 6), [mois])
  const prets = useHorizon((s) => s.finLoans)
  // Capital de prêt retiré des lignes de dépenses (compté en épargne), comme dans le Budget.
  const { agregat, capital } = useMemo(
    () => agregerHorsCapital({ prets, echeances, transactions, idx, filtre, moisCourant: moisCourant() }),
    [prets, echeances, transactions, idx, filtre])
  const b = useMemo(() => bilan({ mois: periode, lines, budgets, agregat, filtre }), [periode, lines, budgets, agregat, filtre])
  const foyer = filtre === 'foyer'
  // Épargné chaque mois : lignes d'épargne + capital de prêts remboursé (vue Foyer : les prêts sont ceux du foyer).
  const parMois = useMemo(() => b.parMois.map((p, i) => ({
    ...p,
    epargne: b.lignes.filter((l) => estEpargneComptee(l.ligne)).reduce((s, l) => s + (l.cellules[i]?.reel ?? 0), 0)
      + (capital.get(p.mois)?.fait ?? 0),
  })), [b, capital])

  if (!lines.length) return <EmptyState hint="Crée tes lignes de budget dans Réglages.">Rien à résumer pour l’instant.</EmptyState>

  const ecart = b.total.budget !== null ? b.total.budget - b.total.reel : null
  const solde = b.total.entrees - b.total.reel
  const nbMois = Math.max(1, periode.length)
  /** Budget mensuel d'une ligne : celui du dernier mois de la période. */
  const budgetMensuel = (l: (typeof b.lignes)[number]) => l.cellules.at(-1)?.budget ?? null
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

      {/* Moyennes par mois sur la période (pas de totaux), en petites tuiles. */}
      <div className="flex flex-wrap gap-2">
        <Tuile compacte titre="Dépensé + épargné" valeur={euros(b.total.moyenne)} detail="par mois" />
        <Tuile compacte titre={ecart !== null && ecart < 0 ? 'Au-delà du budget' : 'Sous le budget'}
          valeur={ecart === null ? '—' : euros(Math.abs(ecart) / nbMois)} ton={ecart !== null && ecart < 0 ? 'warn' : undefined}
          detail={ecart === null ? 'budget : vue Foyer' : 'par mois'} />
        <Tuile compacte titre="Entrées" valeur={euros(b.total.entrees / nbMois)} detail="par mois" />
        <Tuile compacte titre="Solde" valeur={`${solde >= 0 ? '+' : '−'}${euros(Math.abs(solde) / nbMois)}`} detail="par mois" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Dépensé par mois">
          <BarresMois donnees={parMois} onMois={ouvrirMois} />
          <p className="mt-1 text-[11px] text-ink-3">
            En vert, l’argent épargné (lignes d’épargne{foyer ? ' et capital de prêt remboursé' : ''}).
            {foyer && ' Le trait pointillé marque le budget du mois ; une barre ambrée le dépasse.'} Clique un mois pour ouvrir son budget.
          </p>
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
          </ul>
        </Card>
      </div>

      <div className="card overflow-x-auto p-4">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-ink-3">
              <th className="pb-2 pr-2 text-left font-medium">Ligne</th>
              {periode.map((m) => (
                <th key={m} className="px-2 pb-2 text-right font-medium">
                  <button onClick={() => ouvrirMois(m)} title={`Ouvrir le budget de ${libelleMois(m)}`}
                    className="rounded px-1 uppercase tracking-wider decoration-dotted underline-offset-4 hover:text-ink hover:underline">
                    {libelleMois(m, true)}
                  </button>
                </th>
              ))}
              <th className="px-2 pb-2 text-right font-medium">
                <button onClick={basculerTotal} aria-pressed={voirTotal} title={voirTotal ? 'Cacher le total' : 'Afficher le total de la période'}
                  className={`inline-flex items-center gap-1 rounded px-1 uppercase tracking-wider hover:text-ink ${voirTotal ? 'text-ink-2' : ''}`}>
                  {voirTotal ? <EyeOff size={12} /> : <Eye size={12} />} Total
                </button>
              </th>
              <th className="px-2 pb-2 text-right font-medium" title="Budget mensuel (celui du dernier mois de la période)">Budget / mois</th>
              <th className="pb-2 pl-2 text-right font-medium">Moyenne</th>
            </tr>
          </thead>
          <tbody>
            {b.lignes.map((l) => (
              <tr key={l.cle} className="border-t border-line/60" style={fondLigne(l.ligne) ? { background: fondLigne(l.ligne)! } : undefined}>
                <td className={`py-1.5 pr-2 ${l.ligne ? '' : 'italic text-ink-2'}`}>{l.ligne?.name ?? 'Non classé'}</td>
                {l.cellules.map((c) => {
                  const depasse = c.budget !== null && c.budget > 0 && c.reel > c.budget + 0.5
                  return (
                    <td key={c.mois} className={`px-2 text-right tabular-nums ${depasse ? 'text-[#eda145]' : ''}`}
                      title={c.budget !== null ? `Budget ${euros(c.budget)}${depasse ? ` — ${euros(c.reel - c.budget)} au-delà` : ''}` : undefined}>
                      {c.reel ? euros(c.reel) : <span className="text-ink-3">·</span>}
                    </td>
                  )
                })}
                <td className="px-2 text-right font-medium tabular-nums">{voirTotal && euros(l.reel)}</td>
                <td className="px-2 text-right tabular-nums text-ink-2">{budgetMensuel(l) !== null ? euros(budgetMensuel(l)!) : '—'}</td>
                <td className="pl-2 text-right tabular-nums text-ink-2">{euros(l.moyenne)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-line-2 font-semibold">
              <td className="py-2 pr-2">Total</td>
              {b.parMois.map((p) => <td key={p.mois} className="px-2 text-right tabular-nums">{euros(p.reel)}</td>)}
              <td className="px-2 text-right tabular-nums">{voirTotal && euros(b.total.reel)}</td>
              <td className="px-2 text-right tabular-nums">{foyer ? euros(b.lignes.reduce((s, l) => s + (budgetMensuel(l) ?? 0), 0)) : '—'}</td>
              <td className="pl-2 text-right tabular-nums">{euros(b.total.moyenne)}</td>
            </tr>
            <tr className="text-ink-2">
              <td className="py-1.5 pr-2">Entrées</td>
              {b.parMois.map((p) => <td key={p.mois} className="px-2 text-right tabular-nums">{euros(p.entrees)}</td>)}
              <td className="px-2 text-right tabular-nums">{voirTotal && euros(b.total.entrees)}</td>
              <td />
              <td className="pl-2 text-right tabular-nums">{euros(b.total.entrees / nbMois)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
