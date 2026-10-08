import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import {
  NON_CLASSE, agreger, decaleMois, detailLigne, euros, libelleMois, syntheseMois, type LigneBudget,
} from '../../lib/finances'
import { EmptyState, ProgressBar } from '../../components/ui'
import { FiltreSeg, LigneOperation, MontantEditable, NavMois, Tuile } from './partage'
import { useFin, useIndex } from './contexte'

/** Le tableau de bord du mois : budget, réel, reste, M-1, moyenne 6 mois, prévisionnel M+1. */
export function BudgetView() {
  const { mois, setMois, filtre, setFiltre } = useFin()
  const transactions = useHorizon((s) => s.finTransactions)
  const lines = useHorizon((s) => s.finLines)
  const budgets = useHorizon((s) => s.finBudgets)
  const setFinBudget = useHorizon((s) => s.setFinBudget)
  const idx = useIndex()
  const [ouverte, setOuverte] = useState<string | null>(null)

  const agregat = useMemo(() => agreger(transactions, idx, filtre), [transactions, idx, filtre])
  const s = useMemo(() => syntheseMois({ mois, lines, budgets, agregat, filtre }), [mois, lines, budgets, agregat, filtre])
  const foyer = filtre === 'foyer'
  const suivant = decaleMois(mois, 1)

  const depenses = s.lignes.filter((l) => l.ligne?.kind !== 'epargne')
  const epargnes = s.lignes.filter((l) => l.ligne?.kind === 'epargne')
  const somme = (ls: LigneBudget[], f: (l: LigneBudget) => number | null) => ls.reduce((t, l) => t + (f(l) ?? 0), 0)
  const reste = s.total.budget !== null ? s.total.budget - s.total.reel : null

  if (!lines.length) {
    return <EmptyState hint="Crée tes lignes (Frais fixe, Courses…) dans Réglages.">Aucune ligne de budget pour l’instant.</EmptyState>
  }

  const ligneTableau = (l: LigneBudget) => {
    // Un budget à 0 veut dire « pas de budget fixé » (comme dans l'Excel) : rien à signaler.
    const aBudget = l.budget !== null && l.budget > 0
    const ecart = aBudget ? l.budget! - l.reel : null
    const depasse = ecart !== null && ecart < -0.5
    const pct = aBudget ? (l.reel / l.budget!) * 100 : 0
    const ouvert = ouverte === l.cle
    return (
      <Fragment key={l.cle}>
        <tr className="border-t border-line/60 hover:bg-panel-2/50" style={l.ligne?.color ? { background: l.ligne.color } : undefined}>
          <td className="py-2 pr-2">
            <button onClick={() => setOuverte(ouvert ? null : l.cle)} className="flex items-center gap-1.5 text-left">
              {ouvert ? <ChevronDown size={14} className="text-ink-3" /> : <ChevronRight size={14} className="text-ink-3" />}
              <span className={l.ligne ? '' : 'italic text-ink-2'}>{l.ligne?.name ?? 'Non classé'}</span>
            </button>
          </td>
          <td className="px-2 text-right">
            {l.ligne && foyer
              ? <MontantEditable valeur={l.budget} titre={`Budget à partir de ${libelleMois(mois)} (les mois passés gardent le leur)`}
                  onSave={(v) => void setFinBudget(l.ligne!.id, 'budget', `${mois}-01`, v)} />
              : <span className="text-ink-3">—</span>}
          </td>
          <td className="px-2 text-right font-medium tabular-nums">{euros(l.reel)}</td>
          <td className="w-28 px-2">
            {aBudget && <ProgressBar value={pct} color={depasse ? 'var(--color-warn)' : 'var(--color-teal)'} />}
          </td>
          <td className={`px-2 text-right tabular-nums ${depasse ? 'text-[#eda145]' : 'text-ink-2'}`}>
            {ecart !== null ? (depasse ? `+${euros(-ecart)} au-delà` : euros(ecart))
              : l.ligne && foyer && l.reel > 0 ? <span className="text-xs text-ink-3">sans budget</span> : '—'}
          </td>
          <td className="px-2 text-right tabular-nums text-ink-2">{euros(l.precedent)}</td>
          <td className="px-2 text-right tabular-nums text-ink-2">{euros(l.moyenne6)}</td>
          <td className="pl-2 text-right">
            {l.ligne && foyer
              ? <MontantEditable valeur={l.prevision} discret={!l.previsionSaisie}
                  titre={l.previsionSaisie ? `Prévu pour ${libelleMois(suivant)}` : `Reprend le budget — clique pour prévoir ${libelleMois(suivant)}`}
                  onSave={(v) => void setFinBudget(l.ligne!.id, 'prevision', `${suivant}-01`, v)} />
              : <span className="text-ink-3">—</span>}
          </td>
        </tr>
        {ouvert && (
          <tr>
            <td colSpan={8} className="bg-panel-2/40 px-3 pb-3 pt-1">
              <DetailLigne cle={l.cle} />
            </td>
          </tr>
        )}
      </Fragment>
    )
  }

  const sousTotal = (titre: string, ls: LigneBudget[], avecBudget = true) => {
    const b = foyer && avecBudget
    return (
      <tr className="border-t border-line text-xs text-ink-3">
        <td className="py-1.5 pr-2 uppercase tracking-wider">{titre}</td>
        <td className="px-2 text-right tabular-nums">{b ? euros(somme(ls, (l) => l.budget)) : ''}</td>
        <td className="px-2 text-right tabular-nums">{euros(somme(ls, (l) => l.reel))}</td>
        <td />
        <td className="px-2 text-right tabular-nums">{b ? euros(somme(ls, (l) => l.budget) - somme(ls, (l) => l.reel)) : ''}</td>
        <td className="px-2 text-right tabular-nums">{euros(somme(ls, (l) => l.precedent))}</td>
        <td className="px-2 text-right tabular-nums">{euros(somme(ls, (l) => l.moyenne6))}</td>
        <td className="pl-2 text-right tabular-nums">{b ? euros(somme(ls, (l) => l.prevision)) : ''}</td>
      </tr>
    )
  }

  return (
    <div className="rise space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <NavMois mois={mois} onChange={(m) => { setMois(m); setOuverte(null) }} />
        <FiltreSeg value={filtre} onChange={setFiltre} />
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tuile titre="Dépensé + épargné" valeur={euros(s.total.reel)}
          detail={s.total.budget !== null ? `sur ${euros(s.total.budget)} prévus` : 'budget : vue Foyer'} />
        <Tuile titre={reste !== null && reste < 0 ? 'Au-delà du budget' : 'Reste'}
          valeur={reste === null ? '—' : euros(Math.abs(reste))} ton={reste !== null && reste < 0 ? 'warn' : undefined}
          detail={`dont épargne ${euros(somme(epargnes, (l) => l.reel))}`} />
        <Tuile titre="Entrées" valeur={euros(s.entrees)} detail="salaires, remboursements…" />
        <Tuile titre={`Prévu en ${libelleMois(suivant).split(' ')[0]}`}
          valeur={s.total.prevision !== null ? euros(s.total.prevision) : '—'}
          detail={`moyenne 6 mois : ${euros(s.total.moyenne6)}`} />
      </div>

      <div className="card overflow-x-auto p-4">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-ink-3">
              <th className="pb-2 pr-2 font-medium">Ligne</th>
              <th className="px-2 pb-2 text-right font-medium">Budget</th>
              <th className="px-2 pb-2 text-right font-medium">Réel</th>
              <th className="px-2 pb-2 font-medium" />
              <th className="px-2 pb-2 text-right font-medium">Reste</th>
              <th className="px-2 pb-2 text-right font-medium">{libelleMois(decaleMois(mois, -1), true)}</th>
              <th className="px-2 pb-2 text-right font-medium">Moy. 6 mois</th>
              <th className="pb-2 pl-2 text-right font-medium">Prév. {libelleMois(suivant, true)}</th>
            </tr>
          </thead>
          <tbody>
            {sousTotal('Dépenses', depenses.filter((l) => l.cle !== NON_CLASSE))}
            {depenses.filter((l) => l.cle !== NON_CLASSE).map(ligneTableau)}
            {epargnes.length > 0 && sousTotal('Épargne', epargnes)}
            {epargnes.map(ligneTableau)}
            {s.lignes.some((l) => l.cle === NON_CLASSE) && (
              <>
                {sousTotal('À classer', s.lignes.filter((l) => l.cle === NON_CLASSE), false)}
                {ligneTableau(s.lignes.find((l) => l.cle === NON_CLASSE)!)}
              </>
            )}
            <tr className="border-t-2 border-line-2 font-semibold">
              <td className="py-2 pr-2">Total</td>
              <td className="px-2 text-right tabular-nums">{s.total.budget !== null ? euros(s.total.budget) : '—'}</td>
              <td className="px-2 text-right tabular-nums">{euros(s.total.reel)}</td>
              <td />
              <td className="px-2 text-right tabular-nums">{reste === null ? '—' : reste < 0 ? `+${euros(-reste)} au-delà` : euros(reste)}</td>
              <td className="px-2 text-right tabular-nums">{euros(s.total.precedent)}</td>
              <td className="px-2 text-right tabular-nums">{euros(s.total.moyenne6)}</td>
              <td className="pl-2 text-right tabular-nums">{s.total.prevision !== null ? euros(s.total.prevision) : '—'}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-xs text-ink-3">
          Clique un montant de budget pour le changer : il vaut à partir de {libelleMois(mois)}, les mois passés gardent le leur.
          Le prévisionnel grisé reprend le budget ; clique-le pour prévoir autre chose.
          {!foyer && ' Les budgets sont ceux du foyer : ils ne s’affichent que dans la vue Foyer.'}
        </p>
      </div>
    </div>
  )
}

/** Une ligne pour le mois affiché : les totaux par sous-catégorie ; un clic
 *  sur une sous-catégorie déplie ses opérations, « Détails » ouvre ou ferme tout. */
function DetailLigne({ cle }: { cle: string }) {
  const { mois, filtre } = useFin()
  const transactions = useHorizon((s) => s.finTransactions)
  const idx = useIndex()
  const [ouverts, setOuverts] = useState<Set<string>>(new Set())
  const groupes = useMemo(() => detailLigne({ cle, mois, transactions, idx, filtre }), [cle, mois, transactions, idx, filtre])
  if (!groupes.length) return <p className="py-2 text-xs text-ink-3">Aucune opération ce mois-ci.</p>
  const total = groupes.reduce((s, g) => s + g.total, 0)
  const nbOperations = groupes.reduce((s, g) => s + g.operations.length, 0)
  const toutOuvert = groupes.every((g) => ouverts.has(g.nom))
  const basculer = (nom: string) => {
    const s = new Set(ouverts)
    if (s.has(nom)) s.delete(nom); else s.add(nom)
    setOuverts(s)
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-line/40">
        {groupes.map((g) => {
          const ouvert = ouverts.has(g.nom)
          return (
            <li key={g.nom}>
              <button onClick={() => basculer(g.nom)} aria-expanded={ouvert}
                className="flex w-full items-center gap-3 rounded py-1.5 text-left text-sm hover:bg-panel-2/50">
                {ouvert ? <ChevronDown size={13} className="shrink-0 text-ink-3" /> : <ChevronRight size={13} className="shrink-0 text-ink-3" />}
                <span className="min-w-0 flex-1 truncate" title={g.nom}>{g.court}</span>
                <span className="hidden w-32 sm:block">
                  {total > 0 && g.total > 0 && <ProgressBar value={(g.total / total) * 100} color="var(--color-teal)" />}
                </span>
                <span className="w-20 text-right text-xs text-ink-3">{g.operations.length} op.</span>
                <span className="w-24 text-right font-medium tabular-nums">{euros(g.total)}</span>
              </button>
              {ouvert && (
                <ul className="mb-2 ml-5 divide-y divide-line/40 border-l border-line/60 pl-3">
                  {g.operations.map((tx) => <LigneOperation key={tx.id} tx={tx} idx={idx} />)}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
      <div className="flex justify-end">
        <button onClick={() => setOuverts(toutOuvert ? new Set() : new Set(groupes.map((g) => g.nom)))}
          className="btn-ghost flex items-center gap-1 px-3 py-1 text-xs">
          {toutOuvert ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {toutOuvert ? 'Tout fermer' : `Détails : tout ouvrir (${nbOperations} opération${nbOperations > 1 ? 's' : ''})`}
        </button>
      </div>
    </div>
  )
}
