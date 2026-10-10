// Recherche d'opérations de la page Budget : champ (à droite du choix du mois)
// et résultats sur tous les mois, regroupés par mois.
import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { euros, libelleMois, moisDe, rechercherOperations } from '../../lib/finances'
import type { FinTransaction } from '../../lib/types'
import { LigneOperation } from './partage'
import { useFin, useIndex, useReconnaissance } from './contexte'

const PAR_PAGE = 150

export function ChampRecherche({ valeur, onChange }: { valeur: string; onChange: (v: string) => void }) {
  return (
    <label className="relative">
      <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
      <input value={valeur} onChange={(e) => onChange(e.target.value)} placeholder="Rechercher une opération…"
        onKeyDown={(e) => { if (e.key === 'Escape') onChange('') }} aria-label="Rechercher une opération"
        title="Intitulé, catégorie, ligne ou montant (42 ou 42,50) — sur tous les mois"
        className="field !w-56 !py-1.5 !pl-8 !pr-7 text-sm" />
      {valeur && (
        <button onClick={() => onChange('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-3 hover:text-ink"
          aria-label="Effacer la recherche">
          <X size={13} />
        </button>
      )}
    </label>
  )
}

/** Résultats sur tous les mois (filtre de titulaire appliqué), les plus récents d'abord. */
export function ResultatsRecherche({ requete }: { requete: string }) {
  const { filtre } = useFin()
  const transactions = useHorizon((s) => s.finTransactions)
  const idx = useIndex()
  const reco = useReconnaissance()
  const [limite, setLimite] = useState(PAR_PAGE)
  const liste = useMemo(
    () => rechercherOperations({ transactions, requete, idx, filtre, libelle: reco.libelle }),
    [transactions, requete, idx, filtre, reco])
  const parMois = useMemo(() => {
    const m = new Map<string, FinTransaction[]>()
    for (const tx of liste.slice(0, limite)) m.set(moisDe(tx.date), [...(m.get(moisDe(tx.date)) ?? []), tx])
    return [...m.entries()]
  }, [liste, limite])
  const total = liste.reduce((s, tx) => s + Number(tx.amount), 0)

  if (!liste.length) {
    return <div className="card p-6 text-center text-sm text-ink-3">Aucune opération ne correspond à « {requete.trim()} ».</div>
  }
  return (
    <div className="card px-4 py-3">
      <p className="mb-1 text-xs text-ink-3">
        {liste.length} opération{liste.length > 1 ? 's' : ''} sur tous les mois · solde {total > 0 ? '+' : ''}{euros(total, true)}
      </p>
      {parMois.map(([m, ops]) => (
        <section key={m} className="mt-2">
          <h3 className="flex items-baseline justify-between border-b border-line/60 pb-1 text-xs font-medium uppercase tracking-wider text-ink-2">
            <span>{libelleMois(m)}</span>
            <span className="tabular-nums text-ink-3">{euros(ops.reduce((s, tx) => s + Number(tx.amount), 0), true)}</span>
          </h3>
          <ul className="divide-y divide-line/40">
            {ops.map((tx) => <LigneOperation key={tx.id} tx={tx} idx={idx} />)}
          </ul>
        </section>
      ))}
      {liste.length > limite && (
        <button onClick={() => setLimite(limite + PAR_PAGE)} className="btn-ghost my-2 w-full py-1.5 text-sm">
          Afficher {Math.min(PAR_PAGE, liste.length - limite)} de plus
        </button>
      )}
    </div>
  )
}
