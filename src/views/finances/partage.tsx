// Composants communs aux pages de l'onglet Finances : navigation de mois,
// filtre de titulaire, tuiles, montants éditables, ligne d'opération éditable.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, EyeOff, Eye } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { TITULAIRES, categorieEffective, nomCategorie, normaliserLibelle, operationsSemblables, decaleMois, euros, libelleMois, type FiltreTitulaire, type IndexFinances } from '../../lib/finances'
import type { FinOwner, FinTransaction } from '../../lib/types'
import { Modal, Seg } from '../../components/ui'
import { dateCourte, dateLongue, moisCourant, useArbreCategories, useReconnaissance, useVue } from './contexte'

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


export function SelectCategorie({ value, onChange, className = '', disabled = false }: {
  value: string | null; onChange: (id: string | null) => void; className?: string; disabled?: boolean
}) {
  const arbre = useArbreCategories(value)
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} disabled={disabled}
      className={`field !py-1 text-xs disabled:opacity-60 ${className}`} aria-label="Catégorie">
      <option value="">Sans catégorie</option>
      {arbre.map(({ parent, enfants }) => (
        <optgroup key={parent.id} label={parent.name}>
          <option value={parent.id}>{parent.name}</option>
          {enfants.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
      ))}
    </select>
  )
}


/** Une opération, éditable : catégorie, titulaire, exclusion du budget. */
export function LigneOperation({ tx, idx, montrerDate = true }: { tx: FinTransaction; idx: IndexFinances; montrerDate?: boolean }) {
  const update = useHorizon((s) => s.update)
  const compte = idx.comptes.get(tx.account_id)
  const reco = useReconnaissance()
  const [edition, setEdition] = useState(false)
  const [nouvelleCat, setNouvelleCat] = useState<{ id: string | null; semblables: FinTransaction[] } | null>(null)
  const transactions = useHorizon((s) => s.finTransactions)
  const local = reco.estLocal(tx)
  // Vue partagée : ranger (catégorie, titulaire, intitulé) si permis ; jamais écarter du budget.
  const vue = useVue()
  const rangeable = !vue || vue.finances_classer
  // Changer la catégorie : s'il existe des opérations semblables, on propose de les
  // ranger au même endroit (fenêtre de validation) ; sinon on change directement.
  const changerCategorie = (id: string | null) => {
    const semblables = operationsSemblables(tx, transactions, reco, idx, id)
    if (semblables.length) setNouvelleCat({ id, semblables })
    else maj({ category_id: id, category_manual: true })
  }
  const maj = (values: Record<string, unknown>) => { void update('fin_transactions', tx.id, values) }
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm sm:flex-nowrap ${tx.excluded ? 'opacity-50' : ''}`}>
      {montrerDate && <span className="w-14 shrink-0 text-xs tabular-nums text-ink-3">{dateCourte(tx.date)}</span>}
      {/* Intitulé local s'il existe (sinon bancaire, en plus pâle), raccourci ; le reste au survol, l'édition au clic. */}
      <button onClick={() => { if (rangeable) setEdition(true) }} className="w-40 min-w-0 shrink-0 text-left sm:w-52"
        title={`${local ? `${reco.libelle(tx)}\nIntitulé bancaire : ` : ''}${tx.label}\n${compte?.name ?? ''}${tx.internal ? ' · virement interne' : ''}${tx.category_manual ? ' · classée à la main' : ''}\nCliquer pour choisir l’intitulé affiché`}>
        <span className={`block truncate decoration-dotted underline-offset-4 hover:underline ${local ? '' : 'text-ink-2'}`}>
          {reco.libelle(tx) || '(sans libellé)'}
        </span>
      </button>
      {edition && <EditeurLibelle tx={tx} onClose={() => setEdition(false)} />}
      <span className={`w-24 shrink-0 text-right font-medium tabular-nums ${Number(tx.amount) > 0 ? 'text-[#4cc79a]' : ''}`}>
        {Number(tx.amount) > 0 ? '+' : ''}{euros(Number(tx.amount), true)}
      </span>
      <span className="hidden flex-1 sm:block" />
      <SelectCategorie value={categorieEffective(tx.category_id, idx)?.id ?? null} className="!w-auto max-w-[11rem]"
        onChange={changerCategorie} disabled={!rangeable} />
      {nouvelleCat && <ValidationRecategorisation tx={tx} idx={idx} categorie={nouvelleCat.id}
        semblables={nouvelleCat.semblables} onClose={() => setNouvelleCat(null)} />}
      <select value={tx.owner ?? ''} onChange={(e) => maj({ owner: (e.target.value || null) as FinOwner | null })}
        disabled={!rangeable} className="field !w-auto !py-1 text-xs disabled:opacity-60" aria-label="Titulaire">
        <option value="">{compte ? `Compte (${TITULAIRES[compte.owner]})` : 'Compte'}</option>
        {(Object.keys(TITULAIRES) as FinOwner[]).map((o) => <option key={o} value={o}>{TITULAIRES[o]}</option>)}
      </select>
      {!vue && (
        <button onClick={() => maj({ excluded: !tx.excluded })} className="btn-ghost p-1"
          title={tx.excluded ? 'Remettre dans le budget' : 'Écarter du budget'}
          aria-label={tx.excluded ? 'Remettre dans le budget' : 'Écarter du budget'}>
          {tx.excluded ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
      )}
    </li>
  )
}

/** Choisir l'intitulé affiché d'une opération : pour toutes les opérations
 *  semblables (règle sur un motif) ou pour celle-ci seulement. */
function EditeurLibelle({ tx, onClose }: { tx: FinTransaction; onClose: () => void }) {
  const regles = useHorizon((s) => s.finLabels)
  const transactions = useHorizon((s) => s.finTransactions)
  const { insert, update, remove } = useHorizon.getState()
  const reco = useReconnaissance()
  const regle = reco.regleDe(tx.label)
  const [libelle, setLibelle] = useState(tx.label_local ?? regle?.label ?? '')
  const [portee, setPortee] = useState<'semblables' | 'seule'>(tx.label_local ? 'seule' : 'semblables')
  const [motif, setMotif] = useState(regle?.pattern ?? normaliserLibelle(tx.label))
  const m = normaliserLibelle(motif)
  const semblables = useMemo(() => (m ? transactions.filter((t) => normaliserLibelle(t.label).includes(m)) : []), [transactions, m])
  const exemples = [...new Set(semblables.map((t) => t.label))].slice(0, 5)

  const enregistrer = async () => {
    const v = libelle.trim()
    if (portee === 'seule') {
      await update('fin_transactions', tx.id, { label_local: v || null })
    } else if (v && m) {
      if (tx.label_local) await update('fin_transactions', tx.id, { label_local: null })
      const existante = regles.find((r) => r.pattern === m)
      if (existante) await update('fin_labels', existante.id, { label: v })
      else await insert('fin_labels', { pattern: m, label: v })
    }
    onClose()
  }
  const retirer = async () => {
    if (tx.label_local) await update('fin_transactions', tx.id, { label_local: null })
    else if (regle) await remove('fin_labels', regle.id)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Intitulé affiché">
      <div className="space-y-3 text-sm">
        <p className="text-xs text-ink-3">Intitulé bancaire : <span className="text-ink-2">{tx.label}</span></p>
        <label className="block">
          <span className="block-title">Intitulé local</span>
          <input autoFocus value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="ex. Boulangerie La Boîte à pain"
            onKeyDown={(e) => { if (e.key === 'Enter') void enregistrer() }} className="field mt-1" />
        </label>
        <div className="space-y-2">
          <label className="flex items-start gap-2">
            <input type="radio" checked={portee === 'semblables'} onChange={() => setPortee('semblables')} className="mt-1" />
            <span className="min-w-0 flex-1">
              Pour toutes les opérations dont l’intitulé contient
              <input value={motif} onChange={(e) => setMotif(e.target.value)} disabled={portee !== 'semblables'}
                className="field mt-1 !py-1 text-xs disabled:opacity-50" aria-label="Motif reconnu" />
              <span className="mt-1 block text-[11px] text-ink-3">
                {semblables.length} opération{semblables.length > 1 ? 's' : ''} reconnue{semblables.length > 1 ? 's' : ''}
                {exemples.length > 0 && ` : ${exemples.join(' · ')}${semblables.length > exemples.length ? '…' : ''}`}
              </span>
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={portee === 'seule'} onChange={() => setPortee('seule')} /> Pour cette opération seulement
          </label>
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {(tx.label_local || regle) && (
            <button onClick={() => void retirer()} className="btn-ghost mr-auto px-3 py-1.5 text-xs">
              {tx.label_local ? 'Retirer l’intitulé de cette opération' : `Retirer la règle « ${regle!.pattern} »`}
            </button>
          )}
          <button onClick={onClose} className="btn-ghost px-3 py-1.5">Annuler</button>
          <button onClick={() => void enregistrer()} disabled={portee === 'semblables' && (!libelle.trim() || !m)}
            className="btn-sun px-4 py-1.5 disabled:opacity-50">Enregistrer</button>
        </div>
      </div>
    </Modal>
  )
}

/** Récapitulatif avant de ranger une opération et ses semblables dans une catégorie :
 *  tout est coché par défaut, on décoche ce qu'on ne veut pas modifier. */
function ValidationRecategorisation({ tx, idx, categorie, semblables, onClose }: {
  tx: FinTransaction; idx: IndexFinances; categorie: string | null; semblables: FinTransaction[]; onClose: () => void
}) {
  const updateMany = useHorizon((s) => s.updateMany)
  const reco = useReconnaissance()
  const [cochees, setCochees] = useState<Set<string>>(() => new Set(semblables.map((t) => t.id)))
  const [envoi, setEnvoi] = useState(false)
  const nomCible = categorie ? nomCategorie(idx.categories.get(categorie), idx) : 'Sans catégorie'
  const basculer = (id: string) => {
    const s = new Set(cochees)
    if (s.has(id)) s.delete(id); else s.add(id)
    setCochees(s)
  }
  const tout = cochees.size === semblables.length
  const valider = async () => {
    setEnvoi(true)
    const ok = await updateMany('fin_transactions', [tx.id, ...cochees], { category_id: categorie, category_manual: true })
    setEnvoi(false)
    if (ok) onClose()
  }

  return (
    <Modal open onClose={onClose} title="Ranger aussi les opérations semblables ?" wide>
      <div className="space-y-3 text-sm">
        <p>
          « {reco.libelle(tx)} » va dans <span className="font-medium text-sun-soft">{nomCible}</span>.
          {' '}{semblables.length} opération{semblables.length > 1 ? 's' : ''} semblable{semblables.length > 1 ? 's' : ''} sur d’autres
          dates {semblables.length > 1 ? 'sont rangées' : 'est rangée'} ailleurs : décoche celles à laisser telles quelles.
        </p>
        <label className="flex items-center gap-2 text-xs text-ink-2">
          <input type="checkbox" checked={tout}
            onChange={() => setCochees(tout ? new Set() : new Set(semblables.map((t) => t.id)))} />
          Tout cocher / décocher
        </label>
        <ul className="max-h-[50vh] divide-y divide-line/40 overflow-y-auto rounded-lg border border-line/60 px-3">
          {semblables.map((t) => (
            <li key={t.id}>
              <label className={`flex cursor-pointer items-center gap-3 py-1.5 ${cochees.has(t.id) ? '' : 'opacity-50'}`}>
                <input type="checkbox" checked={cochees.has(t.id)} onChange={() => basculer(t.id)} />
                <span className="w-20 shrink-0 text-xs tabular-nums text-ink-3">{dateLongue(t.date)}</span>
                <span className="min-w-0 flex-1 truncate" title={t.label}>{reco.libelle(t)}</span>
                <span className="hidden max-w-[12rem] truncate text-xs text-ink-3 sm:block" title="Catégorie actuelle">
                  {nomCategorie(categorieEffective(t.category_id, idx), idx)}
                </span>
                <span className="w-20 shrink-0 text-right tabular-nums">{euros(Number(t.amount), true)}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost mr-auto px-3 py-1.5">Annuler</button>
          <button disabled={envoi} onClick={() => { setCochees(new Set()); void updateMany('fin_transactions', [tx.id], { category_id: categorie, category_manual: true }).then((ok) => { if (ok) onClose() }) }}
            className="btn-ghost px-3 py-1.5">Celle-ci seulement</button>
          <button disabled={envoi} onClick={() => void valider()} className="btn-sun px-4 py-1.5 disabled:opacity-50">
            {envoi ? 'Enregistrement…' : `Ranger celle-ci + ${cochees.size}`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
