// Composants communs aux pages de l'onglet Finances : navigation de mois,
// filtre de titulaire, tuiles, montants éditables, ligne d'opération éditable.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, EyeOff, Eye } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { TITULAIRES, decaleMois, euros, libelleMois, type FiltreTitulaire, type IndexFinances } from '../../lib/finances'
import type { FinOwner, FinTransaction } from '../../lib/types'
import { Seg } from '../../components/ui'
import { dateCourte, moisCourant, useArbreCategories } from './contexte'

export function NavMois({ mois, onChange }: { mois: string; onChange: (m: string) => void }) {
  const courant = moisCourant()
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onChange(decaleMois(mois, -1))} className="btn-ghost p-1.5" aria-label="Mois précédent">
        <ChevronLeft size={16} />
      </button>
      <span className="min-w-[9.5rem] text-center text-sm font-medium capitalize">{libelleMois(mois)}</span>
      <button onClick={() => onChange(decaleMois(mois, 1))} className="btn-ghost p-1.5" aria-label="Mois suivant">
        <ChevronRight size={16} />
      </button>
      {mois !== courant && (
        <button onClick={() => onChange(courant)} className="ml-1 text-xs text-ink-3 hover:text-ink-2">Ce mois-ci</button>
      )}
    </div>
  )
}

export function FiltreSeg({ value, onChange }: { value: FiltreTitulaire; onChange: (f: FiltreTitulaire) => void }) {
  return (
    <Seg value={value} onChange={onChange} options={[
      { value: 'foyer', label: 'Foyer' }, { value: 'commun', label: 'Commun' },
      { value: 'joffrey', label: 'Joffrey' }, { value: 'honorine', label: 'Honorine' },
    ]} />
  )
}

/** Tuile chiffre clé. */
export function Tuile({ titre, valeur, detail, ton }: { titre: string; valeur: string; detail?: ReactNode; ton?: 'warn' | 'good' }) {
  return (
    <div className="card px-4 py-3">
      <p className="block-title">{titre}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${ton === 'warn' ? 'text-[#eda145]' : ton === 'good' ? 'text-[#4cc79a]' : ''}`}>
        {valeur}
      </p>
      {detail && <p className="mt-0.5 text-xs text-ink-3">{detail}</p>}
    </div>
  )
}

/** Montant cliquable qui devient un champ. Entrée/clic ailleurs : enregistre ; Échap : annule ; vide = effacer. */
export function MontantEditable({ valeur, onSave, discret = false, titre, vide = '—' }: {
  valeur: number | null; onSave: (v: number | null) => void; discret?: boolean; titre?: string; vide?: string
}) {
  const [edition, setEdition] = useState(false)
  const [texte, setTexte] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (edition) ref.current?.select() }, [edition])
  const valider = () => {
    setEdition(false)
    const t = texte.replace(/\s/g, '').replace(',', '.')
    const v = t === '' ? null : Number(t)
    if (v !== null && !Number.isFinite(v)) return
    if (v !== valeur) onSave(v)
  }
  if (edition) {
    return (
      <input ref={ref} value={texte} onChange={(e) => setTexte(e.target.value)} inputMode="decimal"
        onBlur={valider} onKeyDown={(e) => { if (e.key === 'Enter') valider(); if (e.key === 'Escape') setEdition(false) }}
        className="field !w-24 !px-2 !py-0.5 text-right text-sm tabular-nums" aria-label={titre ?? 'Montant'} />
    )
  }
  return (
    <button onClick={() => { setTexte(valeur === null ? '' : String(valeur)); setEdition(true) }} title={titre}
      className={`rounded px-1 tabular-nums decoration-dotted underline-offset-4 hover:underline ${discret ? 'text-ink-3' : ''}`}>
      {valeur === null ? vide : euros(valeur)}
    </button>
  )
}


export function SelectCategorie({ value, onChange, className = '' }: {
  value: string | null; onChange: (id: string | null) => void; className?: string
}) {
  const arbre = useArbreCategories()
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}
      className={`field !py-1 text-xs ${className}`} aria-label="Catégorie">
      <option value="">Sans catégorie</option>
      {arbre.map(({ parent, enfants }) => (
        <optgroup key={parent.id} label={parent.name}>
          <option value={parent.id}>{parent.name}</option>
          {enfants.map((c) => <option key={c.id} value={c.id}>{parent.name} › {c.name}</option>)}
        </optgroup>
      ))}
    </select>
  )
}


/** Une opération, éditable : catégorie, titulaire, exclusion du budget. */
export function LigneOperation({ tx, idx, montrerDate = true }: { tx: FinTransaction; idx: IndexFinances; montrerDate?: boolean }) {
  const update = useHorizon((s) => s.update)
  const compte = idx.comptes.get(tx.account_id)
  const maj = (values: Record<string, unknown>) => { void update('fin_transactions', tx.id, values) }
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm ${tx.excluded ? 'opacity-50' : ''}`}>
      {montrerDate && <span className="w-14 shrink-0 text-xs tabular-nums text-ink-3">{dateCourte(tx.date)}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate" title={tx.label}>{tx.label || '(sans libellé)'}</span>
        <span className="block truncate text-[11px] text-ink-3">
          {compte?.name ?? '?'}{tx.internal ? ' · virement interne' : ''}{tx.category_manual ? ' · classée à la main' : ''}
        </span>
      </span>
      <SelectCategorie value={tx.category_id} className="!w-auto max-w-[13rem]"
        onChange={(id) => maj({ category_id: id, category_manual: true })} />
      <select value={tx.owner ?? ''} onChange={(e) => maj({ owner: (e.target.value || null) as FinOwner | null })}
        className="field !w-auto !py-1 text-xs" aria-label="Titulaire">
        <option value="">{compte ? `Compte (${TITULAIRES[compte.owner]})` : 'Compte'}</option>
        {(Object.keys(TITULAIRES) as FinOwner[]).map((o) => <option key={o} value={o}>{TITULAIRES[o]}</option>)}
      </select>
      <span className={`w-24 shrink-0 text-right tabular-nums ${Number(tx.amount) > 0 ? 'text-[#4cc79a]' : ''}`}>
        {Number(tx.amount) > 0 ? '+' : ''}{euros(Number(tx.amount), true)}
      </span>
      <button onClick={() => maj({ excluded: !tx.excluded })} className="btn-ghost p-1"
        title={tx.excluded ? 'Remettre dans le budget' : 'Écarter du budget'}
        aria-label={tx.excluded ? 'Remettre dans le budget' : 'Écarter du budget'}>
        {tx.excluded ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>
    </li>
  )
}
