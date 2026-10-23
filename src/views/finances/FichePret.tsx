import { Link } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useHorizon } from '../../lib/store'
import { euros } from '../../lib/finances'
import {
  ORIGINES, ecartCapital, montantEcheance, prelevementsReels, statsPret, type PrelevementMois, type StatsPret,
} from '../../lib/prets'
import type { FinAccount, FinEcheance, FinLoan, OriginePret } from '../../lib/types'
import { Modal } from '../../components/ui'
import { useVue } from './contexte'

// Palette de la fiche : vert (remboursé / conforme) et ambre (reste / alerte). Pas de bleu.
const VERT = 'var(--color-good)'
const AMBRE = 'var(--color-sun)'
const AUJOURDHUI = () => format(new Date(), 'yyyy-MM-dd')

const e2 = (n: number) => euros(n, true)
const jour = (d: string) => format(parseISO(d), 'd MMM yyyy', { locale: fr })
const moisLong = (m: string) => format(parseISO(`${m}-01`), 'MMM yyyy', { locale: fr })

/** Ligne de prêt cliquable dans « Comptes » : ouvre la fiche si elle existe. */
export function LienFichePret({ compte, children }: { compte: FinAccount; children: React.ReactNode }) {
  const fiche = useHorizon((s) => s.finLoans.find((l) => l.account_id === compte.id))
  const [ouvert, setOuvert] = useState(false)
  if (!fiche) {
    // Compte courant / épargne : toucher le compte ouvre ses opérations (tous les mois).
    if (compte.kind !== 'courant' && compte.kind !== 'epargne') return <>{children}</>
    return (
      <Link to={`/finances/operations?compte=${compte.id}`} data-testid={`compte-${compte.id}`}
        className="group -mx-1 flex min-w-0 flex-1 items-center gap-1 rounded px-1 text-left hover:bg-panel-2" aria-label={`Opérations du compte ${compte.name}`}>
        <span className="min-w-0 flex-1">{children}</span>
        <ChevronRight size={14} className="shrink-0 text-ink-3 group-hover:text-ink" />
      </Link>
    )
  }
  return (
    <>
      <button onClick={() => setOuvert(true)} className="group -mx-1 flex min-w-0 flex-1 items-center gap-1 rounded px-1 text-left hover:bg-panel-2"
        aria-label={`Ouvrir la fiche du prêt ${compte.name}`}>
        <span className="min-w-0 flex-1">{children}</span>
        <ChevronRight size={14} className="shrink-0 text-ink-3 group-hover:text-ink" />
      </button>
      {ouvert && <FichePret compte={compte} fiche={fiche} onClose={() => setOuvert(false)} />}
    </>
  )
}

/** Fiche d'un prêt : capital restant, conditions, compteurs, courbe, tableau et prélèvements réels. */
export function FichePret({ compte, fiche, onClose }: { compte: FinAccount; fiche: FinLoan; onClose: () => void }) {
  const echeances = useHorizon((s) => s.finEcheances)
  const transactions = useHorizon((s) => s.finTransactions)
  const mes = useMemo(() => echeances.filter((e) => e.account_id === compte.id), [echeances, compte.id])
  const aujourdhui = AUJOURDHUI()
  const s = useMemo(() => statsPret(mes, fiche.borrowed_capital === null ? null : Number(fiche.borrowed_capital), aujourdhui),
    [mes, fiche.borrowed_capital, aujourdhui])
  const prelevements = useMemo(() => prelevementsReels(fiche, mes, transactions, aujourdhui), [fiche, mes, transactions, aujourdhui])
  const ecart = mes.length ? ecartCapital(s.restant, Number(compte.balance)) : null
  const alertes = prelevements.filter((p) => p.etat !== 'ok')
  const source = mes.some((e) => e.source === 'estime') ? 'estimé' : mes.some((e) => e.source === 'pdf') ? 'document' : 'Finary'

  return (
    <Modal open onClose={onClose} title={compte.name} wide compact>
      <div className="space-y-4">
        <Entete s={s} fiche={fiche} source={source} />
        {ecart !== null && Math.abs(ecart) > 1 && (
          <p className="flex items-start gap-2 rounded-lg border border-sun/40 bg-sun/10 px-3 py-2 text-xs text-[#eda145]">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Le compte indique {e2(Math.abs(Number(compte.balance)))}{compte.balance_manual_at ? ' (saisi)' : ' (Finary)'} contre {e2(s.restant)} au tableau :
              {' '}{ecart > 0 ? '+' : '−'}{e2(Math.abs(ecart))} d’écart.
            </span>
          </p>
        )}
        <Conditions fiche={fiche} fin={s.derniere?.date ?? null} />
        <Compteurs s={s} />
        <Courbe s={s} debut={fiche.start_date} emprunte={fiche.borrowed_capital === null ? null : Number(fiche.borrowed_capital)} aujourdhui={aujourdhui} />
        <TableauAmortissement s={s} />
        <Prelevements liste={prelevements} alertes={alertes.length} fiche={fiche} />
        {fiche.notes && <p className="text-[11px] leading-relaxed text-ink-3">{fiche.notes}</p>}
      </div>
    </Modal>
  )
}

function Entete({ s, fiche, source }: { s: StatsPret; fiche: FinLoan; source: string }) {
  const pct = Math.round(s.progression * 100)
  return (
    <section>
      <p className="text-xs text-ink-3">{[fiche.lender, fiche.contract_ref].filter(Boolean).join(' · ')}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wider text-ink-3">Capital restant dû</p>
      <p className="text-4xl font-semibold tabular-nums" data-testid="restant">{e2(s.restant)}</p>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full" style={{ background: 'color-mix(in srgb, var(--color-sun) 28%, transparent)' }}
        role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Capital remboursé">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: VERT }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs">
        <span className="text-[#4cc79a]">{pct} % remboursé · {e2(s.capitalRembourse)}</span>
        <span className="text-[#eda145]">{s.moisRestants} échéance{s.moisRestants > 1 ? 's' : ''} à venir</span>
      </div>
      {s.prochaine && (
        <p className="mt-1 text-xs text-ink-3">Prochaine échéance le {jour(s.prochaine.date)} : {e2(montantEcheance(s.prochaine))}</p>
      )}
      <p className="mt-0.5 text-[10px] text-ink-3">Tableau d’amortissement : {source}</p>
    </section>
  )
}

// ---------- Conditions (champs modifiables) ----------

type TypeChamp = 'euro' | 'pct' | 'mois' | 'date' | 'texte'
const CHAMPS: { cle: keyof FinLoan; label: string; type: TypeChamp }[] = [
  { cle: 'start_date', label: 'Début', type: 'date' },
  { cle: 'duration_months', label: 'Durée', type: 'mois' },
  { cle: 'rate_nominal', label: 'Taux nominal', type: 'pct' },
  { cle: 'monthly_payment', label: 'Mensualité', type: 'euro' },
  { cle: 'insurance_monthly', label: 'Assurance incluse', type: 'euro' },
  { cle: 'insurance_extra', label: 'Assurance à part', type: 'euro' },
  { cle: 'borrowed_capital', label: 'Capital emprunté', type: 'euro' },
  { cle: 'fees', label: 'Frais', type: 'euro' },
  { cle: 'lender', label: 'Prêteur', type: 'texte' },
]

function Conditions({ fiche, fin }: { fiche: FinLoan; fin: string | null }) {
  const update = useHorizon((s) => s.update)
  const modifiable = !useVue()
  const enregistrer = (cle: keyof FinLoan, valeur: string | number | null) => {
    void update('fin_loans', fiche.id, {
      [cle]: valeur, origins: { ...fiche.origins, [cle]: 'manual' }, updated_at: new Date().toISOString(),
    })
  }
  return (
    <section>
      <h3 className="block-title mb-1.5">Conditions</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        {CHAMPS.map((c) => {
          const v = fiche[c.cle] as string | number | null
          if (v === null && !modifiable) return null
          return (
            <div key={c.cle} className="min-w-0">
              <dt className="flex items-center gap-1 text-[11px] text-ink-3">
                {c.label} <Origine o={fiche.origins?.[c.cle as string]} />
              </dt>
              <dd className="font-medium tabular-nums">
                <ChampEditable valeur={v} type={c.type} modifiable={modifiable} label={c.label}
                  onSave={(nv) => enregistrer(c.cle, nv)} />
              </dd>
            </div>
          )
        })}
        <div className="min-w-0">
          <dt className="text-[11px] text-ink-3">Fin</dt>
          <dd className="font-medium tabular-nums">{fin ? format(parseISO(fin), 'MMM yyyy', { locale: fr }) : '—'}</dd>
        </div>
      </dl>
    </section>
  )
}

function Origine({ o }: { o?: OriginePret }) {
  if (!o) return null
  const manuel = o === 'manual'
  return (
    <span className={`rounded px-1 text-[9px] ${manuel ? 'bg-good/20 text-[#4cc79a]' : o === 'estimated' ? 'bg-sun/15 text-[#eda145]' : 'bg-panel-3 text-ink-3'}`}
      title={`Origine : ${ORIGINES[o] ?? o}`}>
      {ORIGINES[o] ?? o}
    </span>
  )
}

function affiche(v: string | number | null, type: TypeChamp): string {
  if (v === null || v === '') return '—'
  switch (type) {
    case 'euro': return e2(Number(v))
    case 'pct': return `${Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 4 })} %`
    case 'mois': return `${v} mois`
    case 'date': return jour(String(v))
    default: return String(v)
  }
}

function ChampEditable({ valeur, type, modifiable, label, onSave }: {
  valeur: string | number | null; type: TypeChamp; modifiable: boolean; label: string
  onSave: (v: string | number | null) => void
}) {
  const [edition, setEdition] = useState(false)
  const [texte, setTexte] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (edition) ref.current?.focus() }, [edition])
  if (!modifiable) return <>{affiche(valeur, type)}</>
  const valider = () => {
    setEdition(false)
    const t = texte.trim()
    let nv: string | number | null
    if (t === '') nv = null
    else if (type === 'texte' || type === 'date') nv = t
    else {
      const n = Number(t.replace(/\s/g, '').replace(',', '.'))
      if (!Number.isFinite(n)) return
      nv = type === 'mois' ? Math.round(n) : n
    }
    if (nv !== valeur) onSave(nv)
  }
  if (edition) {
    return (
      <input ref={ref} value={texte} onChange={(e) => setTexte(e.target.value)} onBlur={valider}
        type={type === 'date' ? 'date' : 'text'} inputMode={type === 'texte' || type === 'date' ? undefined : 'decimal'}
        onKeyDown={(e) => { if (e.key === 'Enter') valider(); if (e.key === 'Escape') setEdition(false) }}
        className="field !w-full !px-2 !py-0.5 text-sm" aria-label={label} />
    )
  }
  return (
    <button onClick={() => { setTexte(valeur === null ? '' : String(valeur)); setEdition(true) }} title={`Modifier : ${label}`}
      className="max-w-full truncate rounded text-left decoration-dotted underline-offset-4 hover:underline">
      {affiche(valeur, type)}
    </button>
  )
}

// ---------- Compteurs ----------

function Compteurs({ s }: { s: StatsPret }) {
  const tuiles: [string, number, string][] = [
    ['Capital remboursé', s.capitalRembourse, 'text-[#4cc79a]'],
    ['Intérêts payés', s.interetsPayes, ''],
    ['Intérêts restants', s.interetsRestants, 'text-[#eda145]'],
    ['Coût total du crédit', s.coutTotal, ''],
  ]
  return (
    <section className="grid grid-cols-2 gap-2">
      {tuiles.map(([titre, v, couleur]) => (
        <div key={titre} className="card px-3 py-2">
          <p className="block-title">{titre}</p>
          <p className={`mt-0.5 text-lg font-semibold tabular-nums ${couleur}`}>{e2(v)}</p>
        </div>
      ))}
      <p className="col-span-2 -mt-1 text-[10px] text-ink-3">
        Coût total = intérêts + assurance incluse ({e2(s.assurancePayee + s.assuranceRestante)}) + frais, sur toute la durée.
      </p>
    </section>
  )
}

// ---------- Courbe du capital restant dû ----------

function Courbe({ s, debut, emprunte, aujourdhui }: { s: StatsPret; debut: string | null; emprunte: number | null; aujourdhui: string }) {
  const L = s.lignes
  if (L.length < 2) return null
  const pts: { t: number; v: number }[] = []
  const t0 = Date.parse(debut ?? L[0]!.date)
  if (emprunte !== null) pts.push({ t: t0, v: emprunte })
  for (const e of L) if (e.restant_du !== null) pts.push({ t: Date.parse(e.date), v: Number(e.restant_du) })
  if (pts.length < 2) return null
  const tmin = pts[0]!.t, tmax = pts.at(-1)!.t
  const vmax = Math.max(...pts.map((p) => p.v), 1)
  const W = 320, H = 110, X0 = 4, Y0 = 8
  const x = (t: number) => X0 + ((t - tmin) / Math.max(1, tmax - tmin)) * (W - 2 * X0)
  const y = (v: number) => Y0 + (1 - v / vmax) * (H - 2 * Y0)
  const tNow = Date.parse(aujourdhui)
  const passe = pts.filter((p) => p.t <= tNow)
  const futur = pts.filter((p) => p.t >= tNow)
  const d = (l: typeof pts) => l.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  // Le segment à venir part du dernier point connu pour ne pas laisser de trou.
  const raccord = passe.length && futur.length && futur[0]!.t !== passe.at(-1)!.t ? [passe.at(-1)!, ...futur] : futur
  const aire = passe.length ? `${d(passe)} L${x(passe.at(-1)!.t).toFixed(1)},${H - Y0} L${x(passe[0]!.t).toFixed(1)},${H - Y0} Z` : ''
  return (
    <section>
      <h3 className="block-title mb-1.5">Capital restant dû</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Courbe du capital restant dû">
        {aire && <path d={aire} fill={VERT} opacity="0.14" />}
        {passe.length > 1 && <path d={d(passe)} fill="none" stroke={VERT} strokeWidth="2" strokeLinejoin="round" />}
        {raccord.length > 1 && <path d={d(raccord)} fill="none" stroke={AMBRE} strokeWidth="2" strokeDasharray="4 3" strokeLinejoin="round" />}
        {tNow >= tmin && tNow <= tmax && (
          <line x1={x(tNow)} x2={x(tNow)} y1={Y0} y2={H - Y0} stroke="var(--color-ink-3)" strokeWidth="1" strokeDasharray="2 3" />
        )}
      </svg>
      <div className="flex justify-between text-[10px] text-ink-3 tabular-nums">
        <span>{format(new Date(tmin), 'MMM yyyy', { locale: fr })}</span>
        <span>aujourd’hui</span>
        <span>{format(new Date(tmax), 'MMM yyyy', { locale: fr })}</span>
      </div>
    </section>
  )
}

// ---------- Tableau d'amortissement ----------

function TableauAmortissement({ s }: { s: StatsPret }) {
  const [tout, setTout] = useState(false)
  const L = s.lignes
  if (!L.length) return <p className="text-sm text-ink-3">Pas d’échéancier pour ce prêt.</p>
  const debut = tout ? 0 : Math.max(0, s.nbPayees - 3)
  const fin = tout ? L.length : Math.min(L.length, s.nbPayees + 12)
  const visibles = L.slice(debut, fin)
  const nextId = s.prochaine?.id
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="block-title">Tableau d’amortissement</h3>
        <button onClick={() => setTout(!tout)} className="text-xs text-[#eda145] underline-offset-2 hover:underline">
          {tout ? 'Réduire' : `Tout voir (${L.length})`}
        </button>
      </div>
      <div className="max-h-96 overflow-y-auto rounded-lg border border-line">
        <table className="w-full text-[11px] tabular-nums sm:text-xs">
          <thead className="sticky top-0 bg-panel-2 text-[10px] uppercase tracking-wider text-ink-3">
            <tr>
              <th className="px-1.5 py-1.5 text-left font-medium">Date</th>
              <th className="px-1 py-1.5 text-right font-medium">Capital</th>
              <th className="px-1 py-1.5 text-right font-medium">Intér.</th>
              <th className="px-1 py-1.5 text-right font-medium">Assur.</th>
              <th className="px-1.5 py-1.5 text-right font-medium">Reste dû</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((e, i) => <LigneEcheance key={e.id} e={e} payee={debut + i < s.nbPayees} suivante={e.id === nextId} />)}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function LigneEcheance({ e, payee, suivante }: { e: FinEcheance; payee: boolean; suivante: boolean }) {
  const ref = useRef<HTMLTableRowElement>(null)
  useEffect(() => { if (suivante) ref.current?.scrollIntoView({ block: 'nearest' }) }, [suivante])
  return (
    <tr ref={ref} className={`border-t border-line/50 ${suivante ? 'bg-sun/15 font-medium' : payee ? 'text-ink-3' : ''}`}
      aria-current={suivante ? 'step' : undefined}>
      <td className="whitespace-nowrap px-1.5 py-1">
        {payee && <Check size={10} className="mr-1 inline text-[#4cc79a]" aria-label="payée" />}
        {format(parseISO(e.date), 'dd/MM/yy')}
        {suivante && <span className="mt-0.5 block w-fit rounded bg-sun/30 px-1 text-[9px] leading-tight text-[#fbbf24]">prochaine</span>}
        {Number(e.frais) > 0 && <span className="block text-[9px] text-ink-3">dont frais {e2(Number(e.frais))}</span>}
      </td>
      <td className="px-1 py-1 text-right">{euros(Number(e.capital), true).replace(/\s€/, '')}</td>
      <td className="px-1 py-1 text-right">{euros(Number(e.interets), true).replace(/\s€/, '')}</td>
      <td className="px-1 py-1 text-right">{Number(e.assurance) ? euros(Number(e.assurance), true).replace(/\s€/, '') : '·'}</td>
      <td className="px-1.5 py-1 text-right">{e.restant_du !== null ? euros(Number(e.restant_du), true).replace(/\s€/, '') : '—'}</td>
    </tr>
  )
}

// ---------- Prélèvements réels ----------

function Prelevements({ liste, alertes, fiche }: { liste: PrelevementMois[]; alertes: number; fiche: FinLoan }) {
  const [tout, setTout] = useState(false)
  if (!liste.length) {
    return (
      <section>
        <h3 className="block-title mb-1.5">Prélèvements réels</h3>
        <p className="text-xs text-ink-3">Aucun prélèvement retrouvé dans les opérations{fiche.debit_match ? '' : ' (aucun motif de libellé défini sur la fiche)'}.</p>
      </section>
    )
  }
  const rev = [...liste].reverse()
  const visibles = tout ? rev : rev.slice(0, 12)
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="block-title">Prélèvements réels</h3>
        {rev.length > 12 && (
          <button onClick={() => setTout(!tout)} className="text-xs text-[#eda145] underline-offset-2 hover:underline">
            {tout ? 'Réduire' : `Tout voir (${rev.length})`}
          </button>
        )}
      </div>
      {alertes > 0 ? (
        <p className="mb-2 flex items-start gap-2 rounded-lg border border-sun/40 bg-sun/10 px-3 py-2 text-xs text-[#eda145]" role="alert">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {alertes} mois ne correspond{alertes > 1 ? 'ent' : ''} pas à l’échéancier : le tableau ne reflète peut-être plus le prêt (remboursement anticipé, avenant…).
        </p>
      ) : (
        <p className="mb-2 flex items-center gap-2 text-xs text-[#4cc79a]"><Check size={14} />Tous les prélèvements correspondent à l’échéancier.</p>
      )}
      <ul className="divide-y divide-line/40 text-xs">
        {visibles.map((p) => (
          <li key={p.mois} className="py-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                {p.etat === 'ok' ? <Check size={12} className="text-[#4cc79a]" /> : <AlertTriangle size={12} className="text-[#eda145]" />}
                <span className="capitalize">{moisLong(p.mois)}</span>
              </span>
              <span className="tabular-nums">
                <span className={p.etat === 'ok' ? '' : 'text-[#eda145]'}>{p.etat === 'absent' ? 'non prélevé' : e2(p.reel)}</span>
                <span className="text-ink-3"> / {e2(p.attendu)}</span>
              </span>
            </div>
            {p.etat !== 'ok' && p.operations.length > 0 && (
              <p className="ml-5 mt-0.5 text-[10px] text-ink-3">
                {p.operations.map((t) => `${format(parseISO(t.date), 'dd/MM')} ${e2(-t.amount)}`).join(' + ')} · écart {p.ecart > 0 ? '+' : '−'}{e2(Math.abs(p.ecart))}
              </p>
            )}
          </li>
        ))}
      </ul>
      {(fiche.insurance_extra ?? 0) > 0 && (
        <p className="mt-2 text-[10px] text-ink-3">
          Une assurance de ~{e2(Number(fiche.insurance_extra))}/mois est prélevée à part (non comptée ci-dessus).
        </p>
      )}
    </section>
  )
}
