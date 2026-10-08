import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { CLASSES, allocation, euros, pourcent } from '../../lib/finances'
import type { FinAssetClass } from '../../lib/types'
import { Card, EmptyState } from '../../components/ui'
import { MontantEditable, Tuile } from './partage'

const ORDRE_CLASSES = Object.keys(CLASSES) as FinAssetClass[]

/** Allocation réelle face à la cible, positions par compte, plan DCA. */
export function InvestissementsView() {
  const holdings = useHorizon((s) => s.finHoldings)
  const targets = useHorizon((s) => s.finTargets)
  const accounts = useHorizon((s) => s.finAccounts)
  const dca = useHorizon((s) => s.finDca)
  const { insert, update, remove } = useHorizon.getState()
  const a = useMemo(() => allocation(holdings, targets, accounts), [holdings, targets, accounts])
  const [nouvelleClasse, setNouvelleClasse] = useState<FinAssetClass | ''>('')

  const dcaActif = dca.filter((d) => d.active)
  const totalDca = dcaActif.reduce((s, d) => s + Number(d.amount), 0)
  const dcaParClasse = useMemo(() => {
    const m = new Map<FinAssetClass | null, number>()
    for (const d of dcaActif) m.set(d.asset_class, (m.get(d.asset_class) ?? 0) + Number(d.amount))
    return m
  }, [dcaActif])

  const comptes = useMemo(() => {
    const parCompte = new Map<string, typeof holdings>()
    for (const h of holdings) parCompte.set(h.account_id, [...(parCompte.get(h.account_id) ?? []), h])
    return accounts.filter((c) => !c.archived && parCompte.has(c.id) && c.kind !== 'immobilier')
      .map((c) => ({ compte: c, positions: (parCompte.get(c.id) ?? []).filter((h) => Math.abs(Number(h.value)) >= 1).sort((x, y) => Number(y.value) - Number(x.value)) }))
      .map((g) => ({ ...g, total: g.positions.reduce((s, h) => s + Number(h.value), 0) }))
      .filter((g) => g.positions.length)
      .sort((x, y) => y.total - x.total)
  }, [holdings, accounts])

  const maxPct = Math.max(1, ...a.suivies.map((l) => Math.max(l.pct, l.cible ?? 0)))

  return (
    <div className="rise space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tuile titre="Portefeuille suivi" valeur={euros(a.suivi)} detail="classes qui ont une cible" />
        <Tuile titre="Hors cible" valeur={euros(a.horsCible.reduce((s, h) => s + h.valeur, 0))} detail="crypto, immobilier, liquidités…" />
        <Tuile titre="DCA du mois" valeur={euros(totalDca)} detail={`${dcaActif.length} ligne${dcaActif.length > 1 ? 's' : ''} active${dcaActif.length > 1 ? 's' : ''}`} />
        <Tuile titre="Positions" valeur={String(holdings.filter((h) => Math.abs(Number(h.value)) >= 1).length)} detail="d’au moins 1 €" />
      </div>

      <Card title="Allocation face à la cible">
        {a.suivies.length === 0
          ? <EmptyState hint="Ajoute une cible ci-dessous (ex. Or 25 %).">Aucune cible d’allocation.</EmptyState>
          : (
            <ul className="space-y-3">
              {a.suivies.map((l) => (
                <li key={l.classe}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CLASSES[l.classe].couleur }} />
                      {CLASSES[l.classe].label}
                    </span>
                    <span className="text-xs tabular-nums text-ink-2">
                      {euros(l.valeur)} · {pourcent(l.pct)} pour une cible de{' '}
                      <CiblePct pct={l.cible ?? 0} onSave={(v) => {
                        const t = targets.find((x) => x.asset_class === l.classe)
                        if (!t) return
                        if (v === null) void remove('fin_targets', t.id)
                        else void update('fin_targets', t.id, { pct: v })
                      }} />
                    </span>
                  </div>
                  <div className="relative mt-1.5 h-2 rounded-full bg-panel-3" title={`${pourcent(l.pct)} réel, ${pourcent(l.cible ?? 0)} visé`}>
                    <div className="h-full rounded-full" style={{ width: `${(l.pct / maxPct) * 100}%`, background: CLASSES[l.classe].couleur }} />
                    <div className="absolute -top-1 h-4 w-0.5 rounded bg-ink" style={{ left: `calc(${((l.cible ?? 0) / maxPct) * 100}% - 1px)` }} />
                  </div>
                  {l.aAjuster !== null && Math.abs(l.aAjuster) >= 50 && (
                    <p className="mt-1 text-[11px] text-ink-3">
                      {l.aAjuster > 0 ? `${euros(l.aAjuster)} à renforcer pour atteindre la cible` : `${euros(-l.aAjuster)} au-dessus de la cible`}
                      {dcaParClasse.get(l.classe) ? ` · DCA : ${euros(dcaParClasse.get(l.classe)!)} / mois` : ''}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs text-ink-3">
          {Math.round(a.totalCibles) !== 100 && a.suivies.length > 0 && <span>Les cibles totalisent {pourcent(a.totalCibles)}.</span>}
          <span>Le trait blanc marque la cible ; clique un pourcentage pour le changer (vide = retirer).</span>
          <select value={nouvelleClasse} onChange={(e) => setNouvelleClasse(e.target.value as FinAssetClass | '')} className="field ml-auto !w-auto !py-1 text-xs" aria-label="Classe à cibler">
            <option value="">Ajouter une cible…</option>
            {ORDRE_CLASSES.filter((c) => !targets.some((t) => t.asset_class === c)).map((c) => <option key={c} value={c}>{CLASSES[c].label}</option>)}
          </select>
          <button disabled={!nouvelleClasse} className="btn-ghost flex items-center gap-1 px-2 py-1 disabled:opacity-40"
            onClick={() => { if (nouvelleClasse) { void insert('fin_targets', { asset_class: nouvelleClasse, pct: 10 }); setNouvelleClasse('') } }}>
            <Plus size={13} /> 10 %
          </button>
        </div>
        {a.horsCible.length > 0 && (
          <div className="mt-4">
            <p className="block-title mb-1.5">Hors cible</p>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {a.horsCible.map((h) => (
                <li key={h.classe} className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: CLASSES[h.classe].couleur }} />
                  {CLASSES[h.classe].label} <span className="tabular-nums text-ink-2">{euros(h.valeur)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card title="Positions">
          {comptes.length === 0
            ? <EmptyState hint="Elles arrivent avec la synchronisation Finary.">Aucune position.</EmptyState>
            : (
              <div className="space-y-4">
                {comptes.map(({ compte, positions, total }) => (
                  <div key={compte.id}>
                    <p className="flex justify-between border-b border-line pb-1 text-xs uppercase tracking-wider text-ink-3">
                      <span>{compte.name}{compte.institution ? ` · ${compte.institution}` : ''}</span>
                      <span className="tabular-nums">{euros(total)}</span>
                    </p>
                    <ul className="divide-y divide-line/40">
                      {positions.map((h) => {
                        const pv = h.buy_value !== null ? Number(h.value) - Number(h.buy_value) : null
                        return (
                          <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate" title={h.name}>{h.name}</span>
                              {h.code && <span className="block text-[11px] text-ink-3">{h.code}</span>}
                            </span>
                            <select value={h.asset_class} aria-label="Classe d'actif" className="field !w-auto !py-1 text-xs"
                              onChange={(e) => void update('fin_holdings', h.id, { asset_class: e.target.value, class_manual: true })}>
                              {ORDRE_CLASSES.map((c) => <option key={c} value={c}>{CLASSES[c].label}</option>)}
                            </select>
                            <span className="w-24 text-right tabular-nums">{euros(Number(h.value))}</span>
                            <span className={`w-20 text-right text-xs tabular-nums ${pv === null ? 'text-ink-3' : pv >= 0 ? 'text-[#4cc79a]' : 'text-ink-2'}`}>
                              {pv === null ? '' : `${pv >= 0 ? '+' : '−'}${euros(Math.abs(pv))}`}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
        </Card>

        <Card title="Plan d’investissement mensuel (DCA)">
          <PlanDca />
        </Card>
      </div>
    </div>
  )
}

/** Pourcentage de cible, cliquable. */
function CiblePct({ pct, onSave }: { pct: number; onSave: (v: number | null) => void }) {
  const [edition, setEdition] = useState(false)
  const [texte, setTexte] = useState('')
  if (edition) {
    const valider = () => {
      setEdition(false)
      const t = texte.trim().replace(',', '.')
      const v = t === '' ? null : Number(t)
      if (v === null || (Number.isFinite(v) && v >= 0 && v <= 100)) onSave(v)
    }
    return (
      <input autoFocus value={texte} onChange={(e) => setTexte(e.target.value)} onBlur={valider} inputMode="decimal"
        onKeyDown={(e) => { if (e.key === 'Enter') valider(); if (e.key === 'Escape') setEdition(false) }}
        className="field inline-block !w-14 !px-1.5 !py-0 text-right text-xs" aria-label="Cible en %" />
    )
  }
  return (
    <button onClick={() => { setTexte(String(pct)); setEdition(true) }} className="text-ink decoration-dotted underline-offset-4 hover:underline">
      {pourcent(pct)}
    </button>
  )
}

function PlanDca() {
  const dca = useHorizon((s) => s.finDca)
  const { insert, update, remove } = useHorizon.getState()
  const [libelle, setLibelle] = useState('')
  const [enveloppe, setEnveloppe] = useState('')
  const [classe, setClasse] = useState<FinAssetClass>('actions')
  const [montant, setMontant] = useState('')
  const lignes = [...dca].sort((a, b) => a.sort_order - b.sort_order)
  const total = lignes.filter((d) => d.active).reduce((s, d) => s + Number(d.amount), 0)

  const ajouter = () => {
    const m = Number(montant.replace(',', '.'))
    if (!libelle.trim() || !Number.isFinite(m) || m <= 0) return
    void insert('fin_dca', {
      label: libelle.trim(), envelope: enveloppe.trim() || null, asset_class: classe, amount: m,
      sort_order: (lignes.at(-1)?.sort_order ?? 0) + 1,
    })
    setLibelle(''); setEnveloppe(''); setMontant('')
  }

  return (
    <div>
      {lignes.length === 0
        ? <p className="py-2 text-sm text-ink-3">Aucune ligne pour l’instant.</p>
        : (
          <ul className="divide-y divide-line/40">
            {lignes.map((d) => (
              <li key={d.id} className={`flex items-center gap-2 py-1.5 text-sm ${d.active ? '' : 'opacity-50'}`}>
                <input type="checkbox" checked={d.active} onChange={() => void update('fin_dca', d.id, { active: !d.active })}
                  aria-label={d.active ? 'Mettre en pause' : 'Réactiver'} title={d.active ? 'Active — décocher pour mettre en pause' : 'En pause'} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate" title={d.label}>{d.label}</span>
                  <span className="block text-[11px] text-ink-3">
                    {[d.envelope, d.asset_class ? CLASSES[d.asset_class].label : null, d.code].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <MontantEditable valeur={Number(d.amount)} titre="Montant mensuel"
                  onSave={(v) => { if (v === null) { if (confirm(`Retirer « ${d.label} » du plan ?`)) void remove('fin_dca', d.id) } else void update('fin_dca', d.id, { amount: v }) }} />
                <button onClick={() => { if (confirm(`Retirer « ${d.label} » du plan ?`)) void remove('fin_dca', d.id) }}
                  className="btn-ghost p-1" aria-label="Retirer"><Trash2 size={12} /></button>
              </li>
            ))}
          </ul>
        )}
      <p className="mt-2 flex justify-between border-t border-line pt-2 text-sm font-medium">
        <span>Total par mois</span><span className="tabular-nums">{euros(total)}</span>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Support (ex. ETF Or)" className="field col-span-2 !py-1.5" />
        <input value={enveloppe} onChange={(e) => setEnveloppe(e.target.value)} placeholder="Enveloppe (PEA, CTO…)" className="field !py-1.5" />
        <select value={classe} onChange={(e) => setClasse(e.target.value as FinAssetClass)} className="field !py-1.5" aria-label="Classe">
          {ORDRE_CLASSES.map((c) => <option key={c} value={c}>{CLASSES[c].label}</option>)}
        </select>
        <input value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="€ / mois" inputMode="decimal" className="field !py-1.5"
          onKeyDown={(e) => { if (e.key === 'Enter') ajouter() }} />
        <button onClick={ajouter} className="btn-ghost flex items-center justify-center gap-1 py-1.5"><Plus size={14} /> Ajouter</button>
      </div>
    </div>
  )
}
