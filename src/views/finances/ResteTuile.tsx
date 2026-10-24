import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, Eye, EyeOff, Plus, Trash2, X } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { euros } from '../../lib/finances'
import { calculerReste, type Recurrente } from '../../lib/reste'
import { todayIso } from '../../lib/logic'
import { MontantEditable, Tuile } from './partage'
import { useIndex, useVue } from './contexte'

const jourMois = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const libelleFin = (iso: string) => `${Number(iso.slice(8, 10))}/${iso.slice(5, 7)}`

/**
 * Tuile « RESTE » : solde actuel des comptes courants (Boursorama + carte Crypto.com, + Honorine dès que son compte existe)
 * moins les dépenses à venir d'ici la fin du mois. Un clic ouvre le détail : synthèse des soldes,
 * récurrentes détectées (excluables / ajustables) et dépenses prévues à la main.
 */
export function ResteTuile() {
  const vue = useVue()
  const accounts = useHorizon((s) => s.finAccounts)
  const transactions = useHorizon((s) => s.finTransactions)
  const planned = useHorizon((s) => s.finPlanned)
  const ajustements = useHorizon((s) => s.finResteAjustements)
  const idx = useIndex()
  const [ouvert, setOuvert] = useState(false)
  const aujourdhui = todayIso()
  const r = useMemo(() => calculerReste({ accounts, transactions, idx, planned, ajustements, aujourdhui }),
    [accounts, transactions, idx, planned, ajustements, aujourdhui])
  // Les dépenses prévues et les corrections sont personnelles : rien à montrer dans une vue partagée.
  if (vue) return null
  const nb = r.recurrentes.filter((x) => !x.ignore).length + r.planifiees.length
  return (
    <>
      <button onClick={() => setOuvert(true)} aria-label="RESTE : voir le détail" className="text-left">
        <Tuile compacte titre="RESTE" valeur={euros(r.reste)} ton={r.reste < 0 ? 'warn' : 'good'}
          detail={nb ? `après ${euros(r.aVenir)} à venir d'ici le ${libelleFin(r.finMois)}` : `rien à venir d'ici le ${libelleFin(r.finMois)}`} />
      </button>
      {ouvert && createPortal(<DetailReste r={r} aujourdhui={aujourdhui} onClose={() => setOuvert(false)} />, document.body)}
    </>
  )
}

function DetailReste({ r, aujourdhui, onClose }: { r: ReturnType<typeof calculerReste>; aujourdhui: string; onClose: () => void }) {
  const ajustements = useHorizon((s) => s.finResteAjustements)
  const { insert, update, remove } = useHorizon.getState()
  const [titre, setTitre] = useState('')
  const [montant, setMontant] = useState('')
  const [date, setDate] = useState(aujourdhui)
  const dateRef = useRef<HTMLInputElement>(null)

  const regler = (x: Recurrente, valeurs: { ignore?: boolean; montant?: number | null }) => {
    const existant = ajustements.find((a) => a.cle === x.cle)
    if (existant) void update('fin_reste_ajustements', existant.id, valeurs)
    else void insert('fin_reste_ajustements', { cle: x.cle, nom: x.nom, ignore: false, montant: null, ...valeurs })
  }
  const ajouter = () => {
    const m = Number(montant.replace(',', '.'))
    if (!titre.trim() || !Number.isFinite(m) || m <= 0 || !date) return
    void insert('fin_planned', { title: titre.trim(), amount: m, due_date: date, line_id: null })
    setTitre(''); setMontant('')
  }
  const comptees = r.recurrentes.filter((x) => !x.ignore)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center md:p-6" onClick={onClose}>
      <div role="dialog" aria-label="Détail du RESTE" onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-line bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl md:max-w-lg md:rounded-2xl">
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="block-title">RESTE d'ici le {libelleFin(r.finMois)}</p>
            <p className={`text-3xl font-semibold tabular-nums ${r.reste < 0 ? 'text-[#eda145]' : 'text-[#4cc79a]'}`}>{euros(r.reste, true)}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5" aria-label="Fermer"><X size={16} /></button>
        </header>

        <section className="mb-4" aria-label="Soldes des comptes comptés">
          <p className="text-sm tabular-nums text-ink-2">
            {r.comptes.map((c, i) => (
              <span key={c.id}>{i > 0 && <span className="text-ink-3"> + </span>}{c.court} <span className="text-ink">{euros(c.solde)}</span></span>
            ))}
          </p>
          {r.enAttente > 0.005 && (
            <p className="mt-1 text-[11px] text-ink-3">
              Dont {euros(r.enAttente, true)} d'opérations en attente, déjà retirées du solde (non comptées deux fois).
            </p>
          )}
        </section>

        <section className="mb-4">
          <p className="block-title mb-1">Récurrentes à venir <span className="font-normal normal-case text-ink-3">· détectées dans l'historique</span></p>
          {r.recurrentes.length === 0 && <p className="text-sm text-ink-3">Aucune récurrente en attente ce mois-ci.</p>}
          {r.recurrentes.map((x) => (
            <div key={x.cle} className={`flex items-center gap-2 border-t border-line/60 py-1.5 text-sm ${x.ignore ? 'opacity-50' : ''}`}>
              <span className="w-10 shrink-0 text-xs tabular-nums text-ink-3">{jourMois(x.date)}</span>
              <span className={`min-w-0 flex-1 truncate ${x.ignore ? 'line-through' : ''}`} title={`${x.nom} · vu ${x.mois} mois de suite`}>
                {x.nom}
                {x.ajuste && <span className="ml-1 text-[10px] text-sun-soft" title={`Montant détecté : ${euros(x.montantDetecte, true)}`}>ajusté</span>}
              </span>
              <MontantEditable valeur={x.montant} titre="Ajuster le montant"
                onSave={(v) => regler(x, { montant: v !== null && v > 0 ? v : null })} />
              <button onClick={() => regler(x, { ignore: !x.ignore })} className="btn-ghost p-1"
                title={x.ignore ? 'Compter de nouveau' : 'Exclure du RESTE'} aria-label={x.ignore ? `Compter ${x.nom}` : `Exclure ${x.nom}`}>
                {x.ignore ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
            </div>
          ))}
          {r.ratees.length > 0 && (
            <p className="mt-1 text-[11px] text-ink-3">
              Non comptées (attendues il y a plus de 5 jours, jamais vues ce mois-ci) : {r.ratees.map((x) => `${x.nom} ${euros(x.montant)}`).join(', ')}.
            </p>
          )}
          {comptees.length > 0 && (
            <div className="mt-1 flex justify-between border-t border-line pt-1 text-sm">
              <span className="text-ink-3">Sous-total récurrentes</span><span className="tabular-nums">−{euros(r.totalRecurrentes, true)}</span>
            </div>
          )}
        </section>

        <section className="mb-4">
          <p className="block-title mb-1">Prévues à la main</p>
          {r.planifiees.length === 0 && <p className="text-sm text-ink-3">Rien de prévu d'ici la fin du mois.</p>}
          {r.planifiees.map((p) => (
            <div key={p.id} className="flex items-center gap-2 border-t border-line/60 py-1.5 text-sm">
              <span className="w-10 shrink-0 text-xs tabular-nums text-ink-3">{jourMois(p.due_date)}</span>
              <span className="min-w-0 flex-1 truncate">{p.title}</span>
              <MontantEditable valeur={Number(p.amount)} titre="Montant prévu"
                onSave={(v) => { if (v !== null && v > 0) void update('fin_planned', p.id, { amount: v }) }} />
              <button onClick={() => void remove('fin_planned', p.id)} className="btn-ghost p-1" title="Supprimer" aria-label={`Supprimer ${p.title}`}><Trash2 size={13} /></button>
            </div>
          ))}
          <div className="mt-2 flex items-center gap-1.5 text-sm">
            <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Libellé" className="field !w-auto !py-1.5 min-w-0 flex-1" aria-label="Libellé" />
            <input value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="€" inputMode="decimal" className="field !w-16 !py-1.5 shrink-0 !px-2 text-right" aria-label="Montant" />
            <button type="button" onClick={() => { const el = dateRef.current; if (el) { try { el.showPicker() } catch { el.click() } } }}
              className="btn-ghost relative flex shrink-0 items-center gap-1 px-1.5 py-1.5 text-xs tabular-nums" title="Choisir la date" aria-label={`Date : ${jourMois(date)}`}>
              <CalendarDays size={15} /> {jourMois(date)}
              <input ref={dateRef} type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} tabIndex={-1} aria-label="Date"
                className="pointer-events-none absolute inset-0 h-full w-full opacity-0 [color-scheme:dark]" />
            </button>
            <button onClick={ajouter} className="btn-sun flex h-8 w-8 shrink-0 items-center justify-center !p-0" title="Ajouter la dépense prévue" aria-label="Ajouter la dépense prévue"><Plus size={16} /></button>
          </div>
        </section>

        <footer className="space-y-0.5 border-t border-line pt-2 text-sm">
          <div className="flex justify-between"><span className="text-ink-3">Solde actuel</span><span className="tabular-nums">{euros(r.solde, true)}</span></div>
          <div className="flex justify-between"><span className="text-ink-3">Dépenses à venir</span><span className="tabular-nums">−{euros(r.aVenir, true)}</span></div>
          <div className="flex justify-between text-base font-semibold"><span>RESTE</span>
            <span className={`tabular-nums ${r.reste < 0 ? 'text-[#eda145]' : 'text-[#4cc79a]'}`}>{euros(r.reste, true)}</span></div>
        </footer>
      </div>
    </div>
  )
}
