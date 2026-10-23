import { useMemo, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { COMPOSANTES, GENRES, TITULAIRES, compositionPatrimoine, euros, patrimoine } from '../../lib/finances'
import type { FinAccount, FinAccountKind } from '../../lib/types'
import { Card, EmptyState, Seg } from '../../components/ui'
import { MontantEditable, Tuile } from './partage'
import { LienFichePret } from './FichePret'
import { useVue } from './contexte'
import { CourbeComposition } from './graphiques'
import { format, parseISO, subMonths } from 'date-fns'
import { fr } from 'date-fns/locale'

type Periode = '6m' | '1a' | 'tout'

const CLE_CRYPTO = 'horizon.patrimoine.crypto'
const lireCrypto = () => { try { return localStorage.getItem(CLE_CRYPTO) === '1' } catch { return false } }

/** Patrimoine : net, actifs, dettes, évolution et détail par compte. */
export function PatrimoineView() {
  const accounts = useHorizon((s) => s.finAccounts)
  const networth = useHorizon((s) => s.finNetworth)
  const [periode, setPeriode] = useState<Periode>('1a')
  // La crypto, trop variable, est une option : hors du patrimoine par défaut (choix mémorisé).
  const [avecCrypto, setAvecCrypto] = useState(lireCrypto)
  const basculerCrypto = () => {
    const v = !avecCrypto
    setAvecCrypto(v)
    try { localStorage.setItem(CLE_CRYPTO, v ? '1' : '0') } catch { /* stockage indisponible */ }
  }
  const p = useMemo(() => patrimoine(accounts, avecCrypto), [accounts, avecCrypto])
  const points = useMemo(() => {
    const depuis = periode === 'tout' ? '' : format(subMonths(new Date(), periode === '6m' ? 6 : 12), 'yyyy-MM-dd')
    return compositionPatrimoine(networth.filter((n) => n.date >= depuis), avecCrypto, accounts)
  }, [networth, periode, avecCrypto, accounts])
  const series = COMPOSANTES.filter((c) => avecCrypto || c.cle !== 'crypto')
  const evolution = points.length > 1 ? points.at(-1)!.total - points[0]!.total : null
  const maj = accounts.map((a) => a.balance_at).filter(Boolean).sort().at(-1)

  const parGenre = useMemo(() => {
    const groupes = new Map<FinAccountKind, typeof accounts>()
    for (const a of accounts) {
      if (a.archived || (!avecCrypto && a.kind === 'crypto')) continue
      groupes.set(a.kind, [...(groupes.get(a.kind) ?? []), a])
    }
    return [...groupes].map(([kind, comptes]) => ({
      kind, comptes: comptes.sort((x, y) => Math.abs(Number(y.balance)) - Math.abs(Number(x.balance))),
      total: comptes.reduce((s, a) => s + Number(a.balance), 0),
    })).sort((a, b) => b.total - a.total)
  }, [accounts, avecCrypto])

  if (!accounts.length) {
    return <EmptyState hint="Les comptes arrivent avec la synchronisation Finary (voir Réglages).">Aucun compte pour l’instant.</EmptyState>
  }
  const maxActif = Math.max(1, ...p.parGenre.filter((g) => g.valeur > 0).map((g) => g.valeur))

  return (
    <div className="rise space-y-4">
      <div className="flex flex-wrap gap-2">
        <Tuile compacte titre={avecCrypto ? 'Patrimoine net' : 'Patrimoine net (hors crypto)'} valeur={euros(p.net)}
          detail={evolution !== null ? `${evolution >= 0 ? '+' : '−'}${euros(Math.abs(evolution))} sur la période` : undefined} />
        <Tuile compacte titre="Mis à jour" valeur={maj ? format(parseISO(maj), 'd MMM', { locale: fr }) : '—'}
          detail={maj ? format(parseISO(maj), "yyyy 'à' HH:mm", { locale: fr }) : undefined} />
      </div>

      <Card title={avecCrypto ? 'Évolution du patrimoine net' : 'Évolution du patrimoine net, hors crypto'} action={
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-ink-2">
            <input type="checkbox" checked={avecCrypto} onChange={basculerCrypto} /> Inclure la crypto
          </label>
          <Seg value={periode} onChange={setPeriode} options={[
            { value: '6m', label: '6 mois' }, { value: '1a', label: '1 an' }, { value: 'tout', label: 'Tout' },
          ]} />
        </div>
      }>
        <CourbeComposition points={points} series={series} />
        {points.some((x) => !x.parts) && (
          <p className="mt-1 text-[11px] text-ink-3">Pointillés : jours dont la composition n’est pas encore connue (total seul, crypto comprise).</p>
        )}
        {accounts.some((a) => a.kind === 'immobilier' && !a.archived) && (
          <p className="mt-1 text-[11px] text-ink-3">
            Immobilier : chaque bien compte sa valeur actuelle depuis sa date d’achat (une réévaluation réécrit le passé).
            Valeurs et prêts se corrigent en cliquant sur le montant, dans « Comptes ».
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card title="Répartition des actifs">
          <ul className="space-y-2.5">
            {p.parGenre.filter((g) => g.valeur > 0).map((g) => (
              <li key={g.kind}>
                <div className="flex justify-between text-sm">
                  <span>{GENRES[g.kind]}</span>
                  <span className="tabular-nums text-ink-2">{euros(g.valeur)} · {Math.round((g.valeur / p.brut) * 100)} %</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-panel-3">
                  <div className="h-full rounded-full bg-teal" style={{ width: `${(g.valeur / maxActif) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Comptes">
          <div className="space-y-4">
            {parGenre.map((g) => (
              <div key={g.kind}>
                <p className="flex justify-between border-b border-line pb-1 text-xs uppercase tracking-wider text-ink-3">
                  <span>{GENRES[g.kind]}</span><span className="tabular-nums">{euros(g.total)}</span>
                </p>
                <ul className="divide-y divide-line/40">
                  {g.comptes.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                      <LienFichePret compte={a}>
                        <span className="min-w-0">
                          <span className="block truncate">{a.name}</span>
                          <span className="block text-[11px] text-ink-3">
                            {[a.institution, TITULAIRES[a.owner], a.in_budget ? 'dans le budget' : null].filter(Boolean).join(' · ')}
                            {a.kind === 'immobilier' && <DateAchat compte={a} />}
                          </span>
                        </span>
                      </LienFichePret>
                      {a.kind === 'immobilier' || a.kind === 'pret'
                        ? <MontantSaisi compte={a} />
                        : a.subtype === 'virtuel'
                          ? <span className="shrink-0 text-[11px] text-ink-3" title="Compte virtuel : pas de solde bancaire, seulement les opérations ventilées">virtuel</span>
                          : <span className={`shrink-0 tabular-nums ${Number(a.balance) < 0 ? 'text-ink-2' : ''}`}>{euros(Number(a.balance))}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

/** Valeur d'un bien ou capital restant dû d'un prêt : saisie dans Horizon, la
 *  synchro ne la change plus ; « ↺ » revient à la valeur de Finary. */
function MontantSaisi({ compte: a }: { compte: FinAccount }) {
  const update = useHorizon((s) => s.update)
  const modifiable = !useVue()
  const valeur = Number(a.balance)
  const montant = <span className={`tabular-nums ${valeur < 0 ? 'text-ink-2' : ''}`}>{euros(valeur)}</span>
  if (!modifiable) return <span className="shrink-0">{montant}</span>
  const revenir = () => void update('fin_accounts', a.id, { balance: a.balance_source ?? a.balance, balance_manual_at: null })
  const enregistrer = (v: number | null) => {
    if (v === null) return revenir()
    // Un prêt se saisit indifféremment avec ou sans signe : c'est une dette.
    void update('fin_accounts', a.id, { balance: a.kind === 'pret' ? -Math.abs(v) : v, balance_manual_at: new Date().toISOString() })
  }
  return (
    <span className="flex shrink-0 items-center gap-1">
      {a.balance_manual_at && (
        <>
          <span className="rounded bg-panel-3 px-1 text-[10px] text-ink-3"
            title={`Valeur saisie dans Horizon : la synchronisation ne la change plus.${a.balance_source !== null ? ` Finary : ${euros(Number(a.balance_source))}.` : ''}`}>
            saisi
          </span>
          {a.balance_source !== null && (
            <button onClick={revenir} className="btn-ghost p-0.5 text-ink-3" title="Revenir à la valeur de Finary" aria-label="Revenir à la valeur de Finary">
              <RotateCcw size={12} />
            </button>
          )}
        </>
      )}
      <MontantEditable valeur={valeur} onSave={enregistrer}
        titre={a.kind === 'pret' ? 'Capital restant dû (cliquer pour corriger)' : 'Valeur du bien (cliquer pour corriger)'} />
    </span>
  )
}

/** Date d'achat d'un bien : sa valeur compte dans l'historique à partir de ce jour. */
function DateAchat({ compte: a }: { compte: FinAccount }) {
  const update = useHorizon((s) => s.update)
  const modifiable = !useVue()
  const libelle = a.acquired_on ? format(parseISO(a.acquired_on), 'd MMM yyyy', { locale: fr }) : null
  if (!modifiable) return libelle ? <> · acheté le {libelle}</> : null
  return (
    <> · acheté le{' '}
      <input type="date" value={a.acquired_on ?? ''} aria-label="Date d’achat"
        title="Sa valeur compte dans l’historique du patrimoine à partir de ce jour"
        onChange={(e) => void update('fin_accounts', a.id, { acquired_on: e.target.value || null })}
        className="rounded bg-transparent text-[11px] text-ink-3 hover:text-ink-2" />
    </>
  )
}
