import { useMemo, useRef, useState } from 'react'
import { FileUp } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { euros } from '../../lib/finances'
import { lireCsvCarte, operationDepuisLigne, verifierCsvCarte, type LigneCsv } from '../../lib/csvCarte'
import { Modal } from '../../components/ui'
import type { FinTransaction } from '../../lib/types'

const jour = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

/** Vérifie un relevé CSV de la carte Crypto.com contre la base, puis ajoute ce qui manque et corrige les montants. */
export function ImportCsvCarte() {
  const accounts = useHorizon((s) => s.finAccounts)
  const transactions = useHorizon((s) => s.finTransactions)
  const [ouvert, setOuvert] = useState(false)
  const [compteId, setCompteId] = useState('')
  const [lignes, setLignes] = useState<LigneCsv[] | null>(null)
  const [ignorees, setIgnorees] = useState(0)
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [fait, setFait] = useState('')
  const fichier = useRef<HTMLInputElement>(null)

  const comptes = accounts.filter((a) => !a.archived && a.kind === 'courant')
  const compte = comptes.find((a) => a.id === compteId) ?? comptes.find((a) => a.source === 'crypto') ?? comptes[0]
  const existantes = useMemo(() => transactions.filter((t) => t.account_id === compte?.id), [transactions, compte?.id])
  const verif = useMemo(() => (lignes ? verifierCsvCarte(lignes, existantes) : null), [lignes, existantes])

  const ouvrir = () => { setLignes(null); setErreur(''); setFait(''); setOuvert(true) }
  const lire = async (f: File | undefined) => {
    if (!f) return
    setErreur(''); setFait('')
    try {
      const r = lireCsvCarte(await f.text())
      setLignes(r.lignes); setIgnorees(r.ignorees)
    } catch (e) { setLignes(null); setErreur(e instanceof Error ? e.message : String(e)) }
  }

  const appliquer = async () => {
    if (!verif || !compte) return
    setEnvoi(true)
    const { insert, update } = useHorizon.getState()
    let ajoutees = 0, corrigees = 0
    for (const { ligne, existante } of verif.ecarts) {
      const note = `${existante.note ? existante.note + ' ; ' : ''}montant réel du relevé CSV (${euros(Number(existante.amount), true)} en base)`
      const r = await update('fin_transactions', existante.id, { amount: ligne.amount, note })
      if (r) corrigees++
    }
    for (const l of verif.manquantes) {
      const r = await insert<FinTransaction>('fin_transactions', operationDepuisLigne(l, compte.id, compte.source))
      if (r) ajoutees++
    }
    setEnvoi(false)
    setLignes(null)
    setFait(`${ajoutees} ajoutée${ajoutees > 1 ? 's' : ''}, ${corrigees} corrigée${corrigees > 1 ? 's' : ''}.`)
  }

  return (
    <>
      <button onClick={ouvrir} className="btn-ghost flex items-center gap-1.5 !py-1.5 text-sm">
        <FileUp size={14} /> Relevé CSV
      </button>
      <Modal open={ouvert} onClose={() => setOuvert(false)} title="Vérifier un relevé de carte" wide>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <select value={compte?.id ?? ''} onChange={(e) => { setCompteId(e.target.value); setFait('') }} className="field !w-auto !py-1.5 text-sm" aria-label="Compte">
              {comptes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input ref={fichier} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { void lire(e.target.files?.[0]); e.target.value = '' }} />
            <button onClick={() => fichier.current?.click()} className="btn-ghost !py-1.5">Choisir le fichier CSV…</button>
          </div>
          <p className="text-xs text-ink-3">
            Export de la carte Crypto.com. Rien n’est écrit avant ton accord ; relancer le même fichier ne crée pas de doublon.
          </p>
          {erreur && <p className="text-rose-400">{erreur}</p>}
          {fait && <p className="text-emerald-400">{fait}</p>}

          {verif && lignes && (
            <div className="space-y-3">
              <p>
                {lignes.length} ligne{lignes.length > 1 ? 's' : ''} lue{lignes.length > 1 ? 's' : ''}
                {ignorees ? ` (${ignorees} ignorée${ignorees > 1 ? 's' : ''}, hors euros)` : ''} · {verif.identiques} déjà en base
                {' '}· {verif.ecarts.length} écart{verif.ecarts.length > 1 ? 's' : ''} de montant · {verif.manquantes.length} manquante{verif.manquantes.length > 1 ? 's' : ''}.
              </p>
              {verif.ecarts.length > 0 && (
                <section>
                  <h3 className="mb-1 font-medium">Montant à corriger (le relevé fait foi)</h3>
                  <ul className="divide-y divide-line/50">
                    {verif.ecarts.map(({ ligne, existante }) => (
                      <li key={existante.id} className="flex justify-between gap-2 py-1">
                        <span>{jour(ligne.date)} · {ligne.label}</span>
                        <span className="tabular-nums">{euros(Number(existante.amount), true)} → {euros(ligne.amount, true)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {verif.manquantes.length > 0 && (
                <section>
                  <h3 className="mb-1 font-medium">À ajouter</h3>
                  <ul className="divide-y divide-line/50">
                    {verif.manquantes.map((l) => (
                      <li key={l.externalId} className="flex justify-between gap-2 py-1">
                        <span>{jour(l.date)} · {l.label}{l.depot ? ' (virement interne, hors budget)' : ''}</span>
                        <span className="tabular-nums">{euros(l.amount, true)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {verif.enBaseSeulement.length > 0 && (
                <section>
                  <h3 className="mb-1 font-medium text-ink-2">En base mais absentes du relevé (rien n’est touché)</h3>
                  <ul className="divide-y divide-line/50 text-ink-2">
                    {verif.enBaseSeulement.map((t) => (
                      <li key={t.id} className="flex justify-between gap-2 py-1">
                        <span>{jour(t.date)} · {t.label}</span>
                        <span className="tabular-nums">{euros(Number(t.amount), true)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {verif.ecarts.length + verif.manquantes.length === 0
                ? <p className="text-emerald-400">Tout concorde.</p>
                : (
                  <button disabled={envoi} onClick={() => void appliquer()} className="btn-primary w-full py-2">
                    {envoi ? 'Enregistrement…' : `Ajouter ${verif.manquantes.length} et corriger ${verif.ecarts.length}`}
                  </button>
                )}
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
