import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useHorizon } from '../../lib/store'
import { GENRES, TITULAIRES, categorieEffective, euros, lignesTriees } from '../../lib/finances'
import type { FinCategory, FinLine, FinOwner } from '../../lib/types'
import { Card } from '../../components/ui'
import { useArbreCategories, useIndex } from './contexte'

/** Fonds translucides des lignes de budget (variantes « A » choisies sur la page d'aperçu). */
const COULEURS = [
  { nom: 'Orange', valeur: 'rgba(245, 158, 11, 0.18)' },
  { nom: 'Rose', valeur: 'rgba(236, 72, 153, 0.18)' },
  { nom: 'Violet', valeur: 'rgba(139, 92, 246, 0.20)' },
  { nom: 'Bleu roi', valeur: 'rgba(65, 105, 225, 0.26)' },
  { nom: 'Vert', valeur: 'rgba(22, 163, 74, 0.20)' },
]

const ROLES: { value: FinCategory['role']; label: string }[] = [
  { value: 'depense', label: 'Dépense' }, { value: 'revenu', label: 'Entrée' }, { value: 'hors_budget', label: 'Hors budget' },
]

/** Réglages de l'onglet : lignes de budget, rangement des catégories, comptes, synchronisation. */
export function ReglagesView() {
  return (
    <div className="rise grid gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <Card title="Lignes de budget"><Lignes /></Card>
        <Card title="Comptes"><Comptes /></Card>
        <Card title="Synchronisation"><Synchro /></Card>
      </div>
      <Card title="Catégories → lignes"><Correspondance /></Card>
    </div>
  )
}

function Lignes() {
  const lines = useHorizon((s) => s.finLines)
  const { insert, update, remove } = useHorizon.getState()
  const [nom, setNom] = useState('')
  const triees = lignesTriees(lines)

  const deplacer = (l: FinLine, sens: -1 | 1) => {
    const memes = triees.filter((x) => x.kind === l.kind)
    const i = memes.findIndex((x) => x.id === l.id)
    const autre = memes[i + sens]
    if (!autre) return
    void update('fin_lines', l.id, { sort_order: autre.sort_order })
    void update('fin_lines', autre.id, { sort_order: l.sort_order === autre.sort_order ? l.sort_order + sens : l.sort_order })
  }
  const ajouter = () => {
    if (!nom.trim()) return
    void insert('fin_lines', { name: nom.trim(), kind: 'depense', sort_order: Math.max(0, ...lines.map((l) => l.sort_order)) + 1 })
    setNom('')
  }

  return (
    <div>
      <ul className="divide-y divide-line/40">
        {triees.map((l) => (
          <li key={l.id} className="flex items-center gap-2 py-1.5 text-sm">
            <input defaultValue={l.name} aria-label="Nom de la ligne" className="field flex-1 !py-1"
              style={l.color ? { background: l.color } : undefined}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== l.name) void update('fin_lines', l.id, { name: v }) }} />
            <select value={l.kind} onChange={(e) => void update('fin_lines', l.id, { kind: e.target.value })}
              className="field !w-auto !py-1 text-xs" aria-label="Nature">
              <option value="depense">Dépense</option>
              <option value="epargne">Épargne</option>
            </select>
            <select value={COULEURS.some((c) => c.valeur === l.color) ? l.color ?? '' : l.color ? 'autre' : ''}
              onChange={(e) => { if (e.target.value !== 'autre') void update('fin_lines', l.id, { color: e.target.value || null }) }}
              className="field !w-auto !py-1 text-xs" aria-label="Couleur de la ligne">
              <option value="">Sans couleur</option>
              {COULEURS.map((c) => <option key={c.valeur} value={c.valeur}>{c.nom}</option>)}
              {l.color && !COULEURS.some((c) => c.valeur === l.color) && <option value="autre">Autre</option>}
            </select>
            <button onClick={() => deplacer(l, -1)} className="btn-ghost p-1" aria-label="Monter"><ArrowUp size={12} /></button>
            <button onClick={() => deplacer(l, 1)} className="btn-ghost p-1" aria-label="Descendre"><ArrowDown size={12} /></button>
            <button onClick={() => { if (confirm(`Supprimer la ligne « ${l.name} » ? Ses catégories passeront en « Non classé ».`)) void remove('fin_lines', l.id) }}
              className="btn-ghost p-1" aria-label="Supprimer"><Trash2 size={12} /></button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nouvelle ligne" className="field flex-1 !py-1.5 text-sm"
          onKeyDown={(e) => { if (e.key === 'Enter') ajouter() }} />
        <button onClick={ajouter} className="btn-ghost flex items-center gap-1 px-3 text-sm"><Plus size={14} /> Ajouter</button>
      </div>
    </div>
  )
}

function Comptes() {
  const accounts = useHorizon((s) => s.finAccounts)
  const update = useHorizon((s) => s.update)
  const tries = [...accounts].sort((a, b) => Number(a.archived) - Number(b.archived) || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
  if (!accounts.length) return <p className="text-sm text-ink-3">Aucun compte : ils arrivent avec la synchronisation.</p>
  return (
    <div>
      <ul className="divide-y divide-line/40">
        {tries.map((a) => (
          <li key={a.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm ${a.archived ? 'opacity-50' : ''}`}>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{a.name}</span>
              <span className="block text-[11px] text-ink-3">{[GENRES[a.kind], a.institution, euros(Number(a.balance))].filter(Boolean).join(' · ')}</span>
            </span>
            <select value={a.owner} onChange={(e) => void update('fin_accounts', a.id, { owner: e.target.value as FinOwner })}
              className="field !w-auto !py-1 text-xs" aria-label="Titulaire">
              {(Object.keys(TITULAIRES) as FinOwner[]).map((o) => <option key={o} value={o}>{TITULAIRES[o]}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs text-ink-2" title="Ses opérations comptent dans le budget">
              <input type="checkbox" checked={a.in_budget} onChange={() => void update('fin_accounts', a.id, { in_budget: !a.in_budget })} /> Budget
            </label>
            <label className="flex items-center gap-1 text-xs text-ink-2" title="Masqué partout (patrimoine compris)">
              <input type="checkbox" checked={a.archived} onChange={() => void update('fin_accounts', a.id, { archived: !a.archived })} /> Archivé
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-3">
        « Budget » : ses opérations comptent dans le budget du mois. Le titulaire sert au filtre Commun / Joffrey / Honorine ;
        une opération peut être réattribuée une à une.
      </p>
    </div>
  )
}

function Synchro() {
  const accounts = useHorizon((s) => s.finAccounts)
  const loadFinances = useHorizon((s) => s.loadFinances)
  const [charge, setCharge] = useState(false)
  const derniere = accounts.filter((a) => a.source === 'finary').map((a) => a.balance_at).filter(Boolean).sort().at(-1)
  return (
    <div className="space-y-2 text-sm">
      <p>
        Source : <span className="font-medium">Finary</span>
        {derniere ? <> · dernière synchronisation le {format(parseISO(derniere), "d MMMM yyyy 'à' HH:mm", { locale: fr })}</> : ' · jamais synchronisé'}
      </p>
      <p className="text-xs text-ink-3">
        La synchronisation se fait à la demande : demande à Claude « synchronise Finary ». Il lit Finary dans ton navigateur
        (sans identifiant stocké) et n’ajoute que les nouveautés ; ce que tu as rangé ou réattribué ici n’est jamais écrasé.
      </p>
      <button onClick={async () => { setCharge(true); await loadFinances(true); setCharge(false) }} disabled={charge}
        className="btn-ghost px-3 py-1.5 text-sm disabled:opacity-50">
        {charge ? 'Rechargement…' : 'Recharger les données'}
      </button>
    </div>
  )
}

/** Dans quelle ligne tombe chaque catégorie (une sous-catégorie suit son parent, sauf choix contraire). */
function Correspondance() {
  const arbre = useArbreCategories()
  const idx = useIndex()
  const lines = useHorizon((s) => s.finLines)
  const transactions = useHorizon((s) => s.finTransactions)
  const accounts = useHorizon((s) => s.finAccounts)
  const update = useHorizon((s) => s.update)
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [toutes, setToutes] = useState(false)

  // Nombre d'opérations « du budget » par catégorie, pour mettre l'utile en premier.
  const compte = useMemo(() => {
    const budget = new Set(accounts.filter((a) => a.in_budget).map((a) => a.id))
    const m = new Map<string, number>()
    for (const tx of transactions) {
      const cat = categorieEffective(tx.category_id, idx)
      if (!cat || !budget.has(tx.account_id)) continue
      m.set(cat.id, (m.get(cat.id) ?? 0) + 1)
    }
    return m
  }, [transactions, accounts, idx])

  const groupes = arbre
    .map((g) => ({ ...g, n: (compte.get(g.parent.id) ?? 0) + g.enfants.reduce((s, c) => s + (compte.get(c.id) ?? 0), 0) }))
    .filter((g) => toutes || g.n > 0)
    .sort((a, b) => b.n - a.n)
  const options = lignesTriees(lines)

  return (
    <div>
      <p className="mb-2 text-xs text-ink-3">
        Chaque catégorie tombe dans une ligne du budget. Une sous-catégorie suit son parent, sauf si tu lui en donnes une autre.
        « Entrée » compte dans les entrées du mois ; « Hors budget » est ignoré (virements…).
      </p>
      <label className="mb-2 flex items-center gap-1.5 text-xs text-ink-2">
        <input type="checkbox" checked={toutes} onChange={(e) => setToutes(e.target.checked)} /> Montrer aussi les catégories jamais utilisées
      </label>
      <ul className="divide-y divide-line/40">
        {groupes.map(({ parent, enfants, n }) => (
          <li key={parent.id} className="py-1.5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button onClick={() => setOuvert(ouvert === parent.id ? null : parent.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                disabled={!enfants.length}>
                {enfants.length ? (ouvert === parent.id ? <ChevronDown size={13} className="text-ink-3" /> : <ChevronRight size={13} className="text-ink-3" />) : <span className="w-[13px]" />}
                <span className="truncate">{parent.name}</span>
                <span className="text-[11px] text-ink-3">{n} op.</span>
              </button>
              <select value={parent.role} onChange={(e) => void update('fin_categories', parent.id, { role: e.target.value })}
                className="field !w-auto !py-1 text-xs" aria-label="Rôle">
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <select value={parent.line_id ?? ''} disabled={parent.role !== 'depense'}
                onChange={(e) => void update('fin_categories', parent.id, { line_id: e.target.value || null })}
                className="field !w-auto !py-1 text-xs disabled:opacity-40" aria-label="Ligne">
                <option value="">Non classé</option>
                {options.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            {ouvert === parent.id && (
              <ul className="ml-5 mt-1 space-y-1">
                {enfants.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate text-ink-2">{c.name} <span className="text-ink-3">{compte.get(c.id) ?? 0} op.</span></span>
                    <select value={c.line_id ?? ''} disabled={parent.role !== 'depense'}
                      onChange={(e) => void update('fin_categories', c.id, { line_id: e.target.value || null })}
                      className="field !w-auto !py-0.5 text-xs disabled:opacity-40" aria-label={`Ligne de ${c.name}`}>
                      <option value="">Comme « {parent.name} »</option>
                      {options.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
