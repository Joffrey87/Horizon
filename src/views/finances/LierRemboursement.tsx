// Relier un remboursement à la dépense qu'il rembourse : il compte alors dans le mois et la catégorie de
// cette dépense (appliquerRemboursements). La date bancaire du remboursement reste celle de la banque.
import { useMemo, useState } from 'react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { useHorizon } from '../../lib/store'
import { categorieEffective, euros, nomLisible } from '../../lib/finances'
import type { FinTransaction } from '../../lib/types'
import { Modal } from '../../components/ui'
import { dateLongue, useIndex, useReconnaissance } from './contexte'

/** Dépenses avant (jusqu'à 120 j) ou juste après (45 j : la dépense peut n'être pas encore passée) le remboursement. */
const AVANT = 120
const APRES = 45

export function LierRemboursement({ tx, onClose }: { tx: FinTransaction; onClose: () => void }) {
  const brutes = useHorizon((s) => s.finTransactions)
  const update = useHorizon((s) => s.update)
  const idx = useIndex()
  const reco = useReconnaissance()
  const [filtre, setFiltre] = useState('')
  const [envoi, setEnvoi] = useState(false)
  // Le remboursement tel que la banque l'a daté (tx peut être sa version rattachée, à la date de la dépense).
  const brute = brutes.find((t) => t.id === tx.id) ?? tx
  const actuelle = brute.rembourse_de ? brutes.find((t) => t.id === brute.rembourse_de) : undefined
  const nom = (t: FinTransaction) => (reco.estLocal(t) ? reco.libelle(t) : nomLisible(t.label)) || '(sans libellé)'

  const candidates = useMemo(() => {
    const q = filtre.trim().toLowerCase().replace(',', '.')
    return brutes
      .filter((t) => t.id !== brute.id && Number(t.amount) < 0 && !t.internal && !t.excluded)
      .map((t) => ({ t, ecart: differenceInCalendarDays(parseISO(t.date), parseISO(brute.date)) }))
      .filter(({ ecart }) => ecart >= -AVANT && ecart <= APRES)
      .filter(({ t }) => !q || nom(t).toLowerCase().includes(q) || t.label.toLowerCase().includes(q) || Math.abs(Number(t.amount)).toFixed(2).startsWith(q))
      .sort((a, b) => Math.abs(a.ecart) - Math.abs(b.ecart))
      .slice(0, 40)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brutes, brute.id, brute.date, filtre, reco])

  const lier = async (cible: string | null) => {
    setEnvoi(true)
    await update('fin_transactions', brute.id, { rembourse_de: cible })
    setEnvoi(false)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Rembourse quelle dépense ?">
      <div data-testid="lier-remboursement" className="space-y-3 text-sm">
        <p className="text-ink-2">
          <span className="font-medium">{nom(brute)}</span> · + {euros(Number(brute.amount))} le {dateLongue(brute.date)}
        </p>
        <p className="text-[12px] text-ink-3">
          Le remboursement sera compté dans le mois et la catégorie de la dépense choisie, qui baisse d'autant.
        </p>
        {actuelle && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-line-2 bg-panel-2 px-3 py-2">
            <span className="min-w-0 truncate text-[12.5px]">Actuellement : {nom(actuelle)} · {dateLongue(actuelle.date)} · {euros(-Number(actuelle.amount))}</span>
            <button disabled={envoi} onClick={() => void lier(null)} className="shrink-0 rounded-full border border-[#eda145]/70 px-2.5 py-0.5 text-[12px] text-[#eda145]">Délier</button>
          </div>
        )}
        <input aria-label="Chercher une dépense" placeholder="Chercher (intitulé ou montant)…" value={filtre} onChange={(e) => setFiltre(e.target.value)}
          className="w-full rounded-md border border-line-2 bg-panel px-2 py-1.5 text-[13px] text-ink outline-none focus:border-[#c9b48a]" />
        <ul className="max-h-72 divide-y divide-line/40 overflow-y-auto">
          {candidates.length === 0 && <li className="py-3 text-ink-3">Aucune dépense proche. Si elle n'est pas encore passée, reviens la relier quand elle apparaît.</li>}
          {candidates.map(({ t }) => {
            const sameAmount = Math.abs(Math.abs(Number(t.amount)) - Number(brute.amount)) < 0.005
            const choisie = actuelle?.id === t.id
            return (
              <li key={t.id}>
                <button disabled={envoi} onClick={() => void lier(t.id)} aria-pressed={choisie}
                  className={`flex w-full items-baseline gap-3 py-1.5 text-left text-[12.5px] ${choisie ? 'text-[#eda145]' : 'text-ink-2 hover:text-ink'}`}>
                  <span className="w-16 shrink-0 tabular-nums text-ink-3">{dateLongue(t.date)}</span>
                  <span className="min-w-0 flex-1 truncate">{nom(t)}
                    <span className="ml-1.5 text-[11px] text-ink-3">{categorieEffective(t.category_id, idx)?.name ?? ''}</span>
                  </span>
                  <span className={`shrink-0 tabular-nums ${sameAmount ? 'text-[#4cc79a]' : ''}`}>{euros(-Number(t.amount))}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </Modal>
  )
}
