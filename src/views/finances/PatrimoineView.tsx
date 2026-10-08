import { useMemo, useState } from 'react'
import { useHorizon } from '../../lib/store'
import { GENRES, TITULAIRES, euros, patrimoine } from '../../lib/finances'
import type { FinAccountKind } from '../../lib/types'
import { Card, EmptyState, Seg } from '../../components/ui'
import { Tuile } from './partage'
import { CourbePatrimoine } from './graphiques'
import { format, parseISO, subMonths } from 'date-fns'
import { fr } from 'date-fns/locale'

type Periode = '6m' | '1a' | 'tout'

/** Patrimoine : net, actifs, dettes, évolution et détail par compte. */
export function PatrimoineView() {
  const accounts = useHorizon((s) => s.finAccounts)
  const networth = useHorizon((s) => s.finNetworth)
  const [periode, setPeriode] = useState<Periode>('1a')
  const p = useMemo(() => patrimoine(accounts), [accounts])
  const points = useMemo(() => {
    const depuis = periode === 'tout' ? '' : format(subMonths(new Date(), periode === '6m' ? 6 : 12), 'yyyy-MM-dd')
    return networth.filter((n) => n.date >= depuis).map((n) => ({ date: n.date, net: Number(n.net) }))
  }, [networth, periode])
  const evolution = points.length > 1 ? points.at(-1)!.net - points[0]!.net : null
  const maj = accounts.map((a) => a.balance_at).filter(Boolean).sort().at(-1)

  const parGenre = useMemo(() => {
    const groupes = new Map<FinAccountKind, typeof accounts>()
    for (const a of accounts) {
      if (a.archived) continue
      groupes.set(a.kind, [...(groupes.get(a.kind) ?? []), a])
    }
    return [...groupes].map(([kind, comptes]) => ({
      kind, comptes: comptes.sort((x, y) => Math.abs(Number(y.balance)) - Math.abs(Number(x.balance))),
      total: comptes.reduce((s, a) => s + Number(a.balance), 0),
    })).sort((a, b) => b.total - a.total)
  }, [accounts])

  if (!accounts.length) {
    return <EmptyState hint="Les comptes arrivent avec la synchronisation Finary (voir Réglages).">Aucun compte pour l’instant.</EmptyState>
  }
  const maxActif = Math.max(1, ...p.parGenre.filter((g) => g.valeur > 0).map((g) => g.valeur))

  return (
    <div className="rise space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tuile titre="Patrimoine net" valeur={euros(p.net)}
          detail={evolution !== null ? `${evolution >= 0 ? '+' : '−'}${euros(Math.abs(evolution))} sur la période` : undefined} />
        <Tuile titre="Actifs" valeur={euros(p.brut)} />
        <Tuile titre="Dettes" valeur={euros(p.dettes)} detail="capital restant des prêts" />
        <Tuile titre="Mis à jour" valeur={maj ? format(parseISO(maj), 'd MMM', { locale: fr }) : '—'}
          detail={maj ? format(parseISO(maj), "yyyy 'à' HH:mm", { locale: fr }) : undefined} />
      </div>

      <Card title="Évolution du patrimoine net" action={
        <Seg value={periode} onChange={setPeriode} options={[
          { value: '6m', label: '6 mois' }, { value: '1a', label: '1 an' }, { value: 'tout', label: 'Tout' },
        ]} />
      }>
        <CourbePatrimoine points={points} />
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
                      <span className="min-w-0">
                        <span className="block truncate">{a.name}</span>
                        <span className="block text-[11px] text-ink-3">
                          {[a.institution, TITULAIRES[a.owner], a.in_budget ? 'dans le budget' : null].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className={`shrink-0 tabular-nums ${Number(a.balance) < 0 ? 'text-ink-2' : ''}`}>{euros(Number(a.balance))}</span>
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
