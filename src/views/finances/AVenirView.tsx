import { useMemo, useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useHorizon } from '../../lib/store'
import { euros, lignesTriees, provision } from '../../lib/finances'
import { todayIso } from '../../lib/logic'
import { Card, EmptyState } from '../../components/ui'
import { MontantEditable, Tuile } from './partage'

/** Dépenses prévues (pneus, lave-vaisselle…) et ce qu'il faut mettre de côté chaque mois. */
export function AVenirView() {
  const planned = useHorizon((s) => s.finPlanned)
  const lines = useHorizon((s) => s.finLines)
  const { insert, update, remove } = useHorizon.getState()
  const aujourdhui = todayIso()
  const [titre, setTitre] = useState('')
  const [montant, setMontant] = useState('')
  const [echeance, setEcheance] = useState('')
  const [ligne, setLigne] = useState('')
  const [voirReglees, setVoirReglees] = useState(false)

  const liste = useMemo(() => [...planned]
    .filter((p) => voirReglees || !p.done)
    .sort((a, b) => Number(a.done) - Number(b.done) || a.due_date.localeCompare(b.due_date))
    .map((p) => ({ p, prov: provision(p, aujourdhui) })), [planned, voirReglees, aujourdhui])
  const ouvertes = liste.filter((x) => !x.p.done)
  const ceMois = ouvertes.reduce((s, x) => s + x.prov.parMois, 0)
  const restant = ouvertes.reduce((s, x) => s + x.prov.restant, 0)
  const nomLigne = (id: string | null) => lines.find((l) => l.id === id)?.name

  const ajouter = () => {
    const m = Number(montant.replace(',', '.'))
    if (!titre.trim() || !Number.isFinite(m) || m <= 0 || !echeance) return
    void insert('fin_planned', { title: titre.trim(), amount: m, due_date: echeance, line_id: ligne || null })
    setTitre(''); setMontant(''); setEcheance('')
  }

  return (
    <div className="rise space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Tuile titre="À mettre de côté ce mois-ci" valeur={euros(ceMois)} detail="pour être prêt à chaque échéance" />
        <Tuile titre="Reste à provisionner" valeur={euros(restant)} detail={`${ouvertes.length} dépense${ouvertes.length > 1 ? 's' : ''} prévue${ouvertes.length > 1 ? 's' : ''}`} />
      </div>

      <Card title="Prévoir une dépense">
        <div className="grid gap-2 text-sm sm:grid-cols-[2fr_1fr_1fr_1.2fr_auto]">
          <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Quoi ? (ex. Pneus de la 308)" className="field !py-1.5" />
          <input value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="Montant €" inputMode="decimal" className="field !py-1.5" />
          <input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} className="field !py-1.5" aria-label="Échéance" />
          <select value={ligne} onChange={(e) => setLigne(e.target.value)} className="field !py-1.5" aria-label="Ligne de budget">
            <option value="">Ligne de budget…</option>
            {lignesTriees(lines).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button onClick={ajouter} className="btn-sun flex items-center justify-center gap-1 px-3 py-1.5"><Plus size={14} /> Prévoir</button>
        </div>
      </Card>

      <Card title="Dépenses prévues" action={
        <label className="flex items-center gap-1.5 text-xs text-ink-3">
          <input type="checkbox" checked={voirReglees} onChange={(e) => setVoirReglees(e.target.checked)} /> Voir les réglées
        </label>
      }>
        {liste.length === 0
          ? <EmptyState hint="Une dépense prévue se provisionne mois après mois jusqu’à son échéance.">Rien de prévu pour l’instant.</EmptyState>
          : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-ink-3">
                    <th className="pb-2 pr-2 font-medium">Dépense</th>
                    <th className="px-2 pb-2 font-medium">Échéance</th>
                    <th className="px-2 pb-2 text-right font-medium">Montant</th>
                    <th className="px-2 pb-2 text-right font-medium">De côté</th>
                    <th className="px-2 pb-2 text-right font-medium">Par mois</th>
                    <th className="pb-2 pl-2" />
                  </tr>
                </thead>
                <tbody>
                  {liste.map(({ p, prov }) => (
                    <tr key={p.id} className={`border-t border-line/60 ${p.done ? 'opacity-50' : ''}`}>
                      <td className="py-2 pr-2">
                        <span className="block">{p.title}</span>
                        {nomLigne(p.line_id) && <span className="block text-[11px] text-ink-3">{nomLigne(p.line_id)}</span>}
                      </td>
                      <td className="px-2 text-ink-2">
                        {format(parseISO(p.due_date), 'd MMM yyyy', { locale: fr })}
                        {!p.done && <span className="block text-[11px] text-ink-3">
                          {prov.mois <= 0 ? 'ce mois-ci' : `dans ${prov.mois} mois`}
                        </span>}
                      </td>
                      <td className="px-2 text-right">
                        <MontantEditable valeur={Number(p.amount)} titre="Montant prévu"
                          onSave={(v) => { if (v !== null && v > 0) void update('fin_planned', p.id, { amount: v }) }} />
                      </td>
                      <td className="px-2 text-right">
                        <MontantEditable valeur={Number(p.saved)} titre="Déjà mis de côté"
                          onSave={(v) => void update('fin_planned', p.id, { saved: v ?? 0 })} />
                      </td>
                      <td className="px-2 text-right font-medium tabular-nums">{p.done ? '—' : euros(prov.parMois)}</td>
                      <td className="pl-2 text-right">
                        <span className="inline-flex gap-1">
                          <button onClick={() => void update('fin_planned', p.id, { done: !p.done })} className="btn-ghost p-1"
                            title={p.done ? 'Remettre à venir' : 'Marquer comme réglée'} aria-label={p.done ? 'Remettre à venir' : 'Marquer comme réglée'}>
                            <Check size={13} />
                          </button>
                          <button onClick={() => { if (confirm(`Supprimer « ${p.title} » ?`)) void remove('fin_planned', p.id) }}
                            className="btn-ghost p-1" aria-label="Supprimer"><Trash2 size={13} /></button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </div>
  )
}
