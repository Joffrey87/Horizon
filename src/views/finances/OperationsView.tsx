import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { NON_CLASSE, classer, correspond, euros, lignesTriees, moisDe, titulaireDe } from '../../lib/finances'
import { EmptyState } from '../../components/ui'
import { FiltreSeg, LigneOperation, NavMois } from './partage'
import { useFin, useIndex } from './contexte'

type Portee = 'tout' | 'budget' | typeof NON_CLASSE | 'revenus' | 'hors' | string

const PAR_PAGE = 150

/** Toutes les opérations, filtrables ; c'est ici qu'on range ce qui est « Non classé ». */
export function OperationsView() {
  const { mois, setMois, filtre, setFiltre } = useFin()
  const transactions = useHorizon((s) => s.finTransactions)
  const accounts = useHorizon((s) => s.finAccounts)
  const lines = useHorizon((s) => s.finLines)
  const idx = useIndex()
  const [tousLesMois, setTousLesMois] = useState(false)
  const [compte, setCompte] = useState('')
  const [portee, setPortee] = useState<Portee>('budget')
  const [texte, setTexte] = useState('')
  const [limite, setLimite] = useState(PAR_PAGE)

  const liste = useMemo(() => {
    const q = texte.trim().toLowerCase()
    return transactions.filter((tx) => {
      if (!tousLesMois && moisDe(tx.date) !== mois) return false
      if (compte && tx.account_id !== compte) return false
      if (!correspond(filtre, titulaireDe(tx, idx))) return false
      if (q && !tx.label.toLowerCase().includes(q)) return false
      if (portee === 'tout') return true
      const c = classer(tx, idx)
      if (portee === 'budget') return c.type === 'ligne' || c.type === 'non_classe'
      if (portee === NON_CLASSE) return c.type === 'non_classe'
      if (portee === 'revenus') return c.type === 'revenu'
      if (portee === 'hors') return c.type === 'ignoree'
      return c.type === 'ligne' && c.ligne === portee
    })
  }, [transactions, tousLesMois, mois, compte, filtre, idx, texte, portee])

  const total = liste.reduce((s, tx) => s + Number(tx.amount), 0)
  const aClasser = useMemo(
    () => transactions.filter((tx) => (tousLesMois || moisDe(tx.date) === mois) && classer(tx, idx).type === 'non_classe').length,
    [transactions, tousLesMois, mois, idx])

  if (!transactions.length) {
    return <EmptyState hint="Les opérations arrivent avec la synchronisation Finary (voir Réglages).">Aucune opération pour l’instant.</EmptyState>
  }

  return (
    <div className="rise space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {!tousLesMois && <NavMois mois={mois} onChange={(m) => { setMois(m); setLimite(PAR_PAGE) }} />}
          <label className="flex items-center gap-1.5 text-xs text-ink-2">
            <input type="checkbox" checked={tousLesMois} onChange={(e) => setTousLesMois(e.target.checked)} /> Tous les mois
          </label>
        </div>
        <FiltreSeg value={filtre} onChange={setFiltre} />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <select value={portee} onChange={(e) => { setPortee(e.target.value); setLimite(PAR_PAGE) }} className="field !w-auto !py-1.5 text-sm" aria-label="Quelles opérations">
          <option value="budget">Comptées dans le budget</option>
          <option value={NON_CLASSE}>À classer{aClasser ? ` (${aClasser})` : ''}</option>
          <optgroup label="Une ligne">
            {lignesTriees(lines).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </optgroup>
          <option value="revenus">Entrées</option>
          <option value="hors">Hors budget (virements, comptes hors budget, écartées)</option>
          <option value="tout">Toutes</option>
        </select>
        <select value={compte} onChange={(e) => setCompte(e.target.value)} className="field !w-auto !py-1.5 text-sm" aria-label="Compte">
          <option value="">Tous les comptes</option>
          {accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <label className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Libellé…" className="field !w-48 !py-1.5 !pl-8 text-sm" />
        </label>
        <span className="ml-auto text-xs text-ink-3">
          {liste.length} opération{liste.length > 1 ? 's' : ''} · solde {total > 0 ? '+' : ''}{euros(total, true)}
        </span>
      </div>

      {liste.length === 0
        ? <EmptyState>{portee === NON_CLASSE ? 'Tout est rangé.' : 'Aucune opération ne correspond.'}</EmptyState>
        : (
          <div className="card px-4 py-2">
            <ul className="divide-y divide-line/50">
              {liste.slice(0, limite).map((tx) => <LigneOperation key={tx.id} tx={tx} idx={idx} />)}
            </ul>
            {liste.length > limite && (
              <button onClick={() => setLimite(limite + PAR_PAGE)} className="btn-ghost my-2 w-full py-1.5 text-sm">
                Afficher {Math.min(PAR_PAGE, liste.length - limite)} de plus
              </button>
            )}
          </div>
        )}
      <p className="text-xs text-ink-3">
        Changer la catégorie d’une opération la range dans la ligne correspondante ; la synchronisation ne revient plus dessus.
        Le titulaire vient du compte, sauf si tu le corriges ici.
      </p>
    </div>
  )
}
