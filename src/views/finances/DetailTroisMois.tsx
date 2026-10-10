// Détail compacté d'une ligne de budget sur les 3 mois précédant le mois affiché :
// une ligne par groupe d'intitulés (mandat de prélèvement, enseigne, intitulé sans
// numéros, ou regroupement manuel `fin_groups`), le dépensé de chaque mois et la moyenne.
import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Combine, GripVertical, Ungroup } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { decaleMois, detailPeriode, euros, libelleMois, normaliserLibelle, type GroupePeriode } from '../../lib/finances'
import { Modal } from '../../components/ui'
import { LigneOperation } from './partage'
import { useFin, useIndex, useReconnaissance, useVue } from './contexte'

export function DetailTroisMois({ cle }: { cle: string }) {
  const { mois, filtre } = useFin()
  const transactions = useHorizon((s) => s.finTransactions)
  const regles = useHorizon((s) => s.finGroups)
  const idx = useIndex()
  const reco = useReconnaissance()
  const vue = useVue()
  const rangeable = !vue || vue.finances_classer
  const [ouverts, setOuverts] = useState<Set<string>>(new Set())
  const [aRegrouper, setARegrouper] = useState<{ groupe: GroupePeriode; depose?: GroupePeriode } | null>(null)
  // Glisser-déposer : la ligne qu'on tient, et celle survolée (mise en évidence).
  const [tenue, setTenue] = useState<string | null>(null)
  const [survolee, setSurvolee] = useState<string | null>(null)
  const periode = useMemo(() => [3, 2, 1].map((n) => decaleMois(mois, -n)), [mois])
  const groupes = useMemo(() => detailPeriode({
    cle, mois: periode, transactions, idx, filtre, groupes: regles,
    libelleLocal: (tx) => (reco.estLocal(tx) ? reco.libelle(tx) : null),
  }), [cle, periode, transactions, idx, filtre, regles, reco])

  if (!groupes.length) return <p className="py-2 text-xs text-ink-3">Aucune opération</p>

  const basculer = (k: string) => {
    const s = new Set(ouverts)
    if (s.has(k)) s.delete(k); else s.add(k)
    setOuverts(s)
  }
  const totaux = periode.map((_, i) => groupes.reduce((s, g) => s + g.parMois[i]!, 0))
  const moyenne = groupes.reduce((s, g) => s + g.moyenne, 0)
  const montant = (v: number) => (Math.abs(v) < 0.005 ? <span className="text-ink-3">—</span> : euros(v))
  // Déposer sur un groupe déjà nommé l'y ajoute ; sur un intitulé seul, on demande le nom du nouveau groupe.
  const deposer = (cible: GroupePeriode) => {
    const source = groupes.find((g) => g.cle === tenue)
    setTenue(null); setSurvolee(null)
    if (!source || source.cle === cible.cle) return
    if (cible.manuel) void regrouper(source.cles, cible.nom)
    else setARegrouper({ groupe: cible, depose: source })
  }

  return (
    <div className="space-y-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-ink-3">
            <th className="py-1 pr-2 font-medium">Sur les 3 mois précédents</th>
            {periode.map((m) => <th key={m} className="w-20 px-2 py-1 text-right font-medium">{libelleMois(m, true)}</th>)}
            <th className="w-20 px-2 py-1 text-right font-medium">Moy.</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {groupes.map((g) => {
            const ouvert = ouverts.has(g.cle)
            return (
              <Fragment key={g.cle}>
                <tr draggable={rangeable} onClick={(e) => { if (!(e.target as HTMLElement).closest('button, input, a')) basculer(g.cle) }}
                  onDragStart={(e) => { setTenue(g.cle); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', g.nom) }}
                  onDragEnd={() => { setTenue(null); setSurvolee(null) }}
                  onDragOver={(e) => { if (tenue && tenue !== g.cle) { e.preventDefault(); setSurvolee(g.cle) } }}
                  onDragLeave={() => { if (survolee === g.cle) setSurvolee(null) }}
                  onDrop={(e) => { e.preventDefault(); deposer(g) }}
                  title={rangeable ? 'Glisse cette ligne sur une autre pour les regrouper' : undefined}
                  className={`cursor-pointer border-t border-line/40 hover:bg-panel-2/50 ${tenue === g.cle ? 'opacity-40' : ''} ${survolee === g.cle ? 'bg-panel-3 outline outline-1 outline-sun-soft' : ''}`}>
                  <td className="py-1.5 pr-2">
                    <button onClick={() => basculer(g.cle)} aria-expanded={ouvert} className="flex min-w-0 items-center gap-1.5 text-left">
                      {rangeable && <GripVertical size={12} className="-ml-1 shrink-0 cursor-grab text-ink-3/60" />}
                      {ouvert ? <ChevronDown size={13} className="shrink-0 text-ink-3" /> : <ChevronRight size={13} className="shrink-0 text-ink-3" />}
                      <span className="truncate">{g.nom}</span>
                      <span className="shrink-0 text-[11px] text-ink-3">
                        {g.operations.length} op.{g.manuel && g.cles.length > 1 ? ` · ${g.cles.length} intitulés` : ''}
                      </span>
                    </button>
                  </td>
                  {g.parMois.map((v, i) => <td key={periode[i]} className="px-2 text-right tabular-nums text-ink-2">{montant(v)}</td>)}
                  <td className="px-2 text-right font-medium tabular-nums">{euros(g.moyenne)}</td>
                  <td className="pl-1 text-right">
                    {rangeable && (
                      <button onClick={() => setARegrouper({ groupe: g })} className="btn-ghost p-1"
                        title="Regrouper avec d’autres intitulés, ou renommer le groupe" aria-label="Regrouper">
                        <Combine size={13} />
                      </button>
                    )}
                  </td>
                </tr>
                {/* Groupe manuel : ses intitulés semblables (avec leurs montants par mois), puis les opérations. */}
                {ouvert && g.sousGroupes && g.sousGroupes.map((sg) => {
                  const k = `${g.cle}/${sg.cle}`
                  const sousOuvert = ouverts.has(k)
                  return (
                    <Fragment key={k}>
                      <tr onClick={() => basculer(k)} className="cursor-pointer bg-panel-2/40 hover:bg-panel-2/70">
                        <td className="py-1 pl-7 pr-2">
                          <button onClick={(e) => { e.stopPropagation(); basculer(k) }} aria-expanded={sousOuvert}
                            className="flex min-w-0 items-center gap-1.5 text-left">
                            {sousOuvert ? <ChevronDown size={12} className="shrink-0 text-ink-3" /> : <ChevronRight size={12} className="shrink-0 text-ink-3" />}
                            <span className="truncate">{sg.nom}</span>
                            <span className="shrink-0 text-[11px] text-ink-3">{sg.operations.length} op.</span>
                          </button>
                        </td>
                        {sg.parMois.map((v, i) => <td key={periode[i]} className="px-2 text-right tabular-nums text-ink-2">{montant(v)}</td>)}
                        <td className="px-2 text-right tabular-nums">{euros(sg.moyenne)}</td>
                        <td />
                      </tr>
                      {sousOuvert && (
                        <tr className="bg-panel-2/40">
                          <td colSpan={6} className="pb-2">
                            <ul className="ml-10 divide-y divide-line/40 border-l border-line/60 pl-3">
                              {sg.operations.map((tx) => <LigneOperation key={tx.id} tx={tx} idx={idx} />)}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
                {ouvert && !g.sousGroupes && (
                  <tr>
                    <td colSpan={6} className="pb-2">
                      <ul className="ml-5 divide-y divide-line/40 border-l border-line/60 pl-3">
                        {g.operations.map((tx) => <LigneOperation key={tx.id} tx={tx} idx={idx} />)}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
          <tr className="border-t border-line text-xs text-ink-3">
            <td className="py-1.5 pr-2" />
            {totaux.map((v, i) => <td key={periode[i]} className="px-2 text-right tabular-nums">{euros(v)}</td>)}
            <td className="px-2 text-right font-medium tabular-nums">{euros(moyenne)}</td>
            <td />
          </tr>
        </tbody>
      </table>
      {aRegrouper && <FenetreRegrouper groupe={aRegrouper.groupe} depose={aRegrouper.depose}
        autres={groupes.filter((g) => g.cle !== aRegrouper.groupe.cle)} onClose={() => setARegrouper(null)} />}
    </div>
  )
}

/** Mots qui comptent pour proposer un rapprochement (4 lettres et plus). */
const motsSignificatifs = (g: GroupePeriode) =>
  new Set(normaliserLibelle(`${g.nom} ${g.cles.join(' ')}`).split(/[^a-z]+/).filter((m) => m.length >= 4 && m !== 'enseigne'))

/** Range les clés automatiques `cles` sous le nom `nom` (crée ou renomme leurs règles). */
async function regrouper(cles: string[], nom: string): Promise<boolean> {
  const { finGroups, insert, update } = useHorizon.getState()
  let ok = true
  for (const cle of new Set(cles)) {
    const existante = finGroups.find((r) => r.pattern === cle)
    if (existante) { if (existante.name !== nom) ok = !!(await update('fin_groups', existante.id, { name: nom })) && ok }
    else ok = !!(await insert('fin_groups', { pattern: cle, name: nom })) && ok
  }
  return ok
}

/** Regrouper un groupe avec d'autres (ou seulement le renommer). Les groupes qui
 *  partagent un mot avec lui sont cochés d'office ; on décoche ce qui ne va pas.
 *  Après un glisser-déposer (`depose`), seule la question du nom est posée. */
function FenetreRegrouper({ groupe, depose, autres, onClose }: {
  groupe: GroupePeriode; depose?: GroupePeriode; autres: GroupePeriode[]; onClose: () => void
}) {
  const regles = useHorizon((s) => s.finGroups)
  const { remove } = useHorizon.getState()
  const [nom, setNom] = useState(depose ? (depose.manuel ? depose.nom : '') : groupe.nom)
  const [cochees, setCochees] = useState<Set<string>>(() => {
    if (depose) return new Set([depose.cle])
    const mots = motsSignificatifs(groupe)
    return new Set(autres.filter((a) => [...motsSignificatifs(a)].some((m) => mots.has(m))).map((a) => a.cle))
  })
  const [envoi, setEnvoi] = useState(false)
  const noms = useMemo(() => [...new Set(regles.map((r) => r.name))].sort((a, b) => a.localeCompare(b, 'fr')), [regles])
  const v = nom.trim()
  const basculer = (k: string) => {
    const s = new Set(cochees)
    if (s.has(k)) s.delete(k); else s.add(k)
    setCochees(s)
  }

  const appliquer = async () => {
    if (!v) return
    setEnvoi(true)
    const ok = await regrouper([...groupe.cles, ...autres.filter((a) => cochees.has(a.cle)).flatMap((a) => a.cles)], v)
    setEnvoi(false)
    if (ok) onClose()
  }
  const degrouper = async () => {
    if (!confirm(`Défaire le groupe « ${groupe.nom} » ? Ses intitulés reprennent leur regroupement automatique.`)) return
    for (const r of regles.filter((x) => groupe.cles.includes(x.pattern))) await remove('fin_groups', r.id)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={depose ? 'Nouveau groupe' : 'Regrouper des intitulés'} wide={!depose}>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="block-title">Nom du groupe</span>
          <input autoFocus value={nom} onChange={(e) => setNom(e.target.value)} onFocus={(e) => e.target.select()}
            list="noms-groupes" placeholder="ex. Remboursement prêt appart" className="field mt-1"
            onKeyDown={(e) => { if (e.key === 'Enter') void appliquer() }} />
          <datalist id="noms-groupes">{noms.map((n) => <option key={n} value={n} />)}</datalist>
        </label>
        {depose ? (
          <p className="text-xs text-ink-3">
            « {depose.nom} » et « {groupe.nom} » vont dans ce groupe ({euros(depose.moyenne + groupe.moyenne)} par mois en moyenne).
          </p>
        ) : (
          <p className="text-xs text-ink-3">
            « {groupe.nom} » ({euros(groupe.moyenne)} par mois en moyenne). Coche les intitulés à réunir avec lui — ceux qui partagent
            un mot sont proposés. Sans rien cocher, le groupe est seulement renommé.
          </p>
        )}
        {!depose && autres.length > 0 && (
          <ul className="max-h-[45vh] divide-y divide-line/40 overflow-y-auto rounded-lg border border-line/60 px-3">
            {autres.map((a) => (
              <li key={a.cle}>
                <label className={`flex cursor-pointer items-center gap-3 py-1.5 ${cochees.has(a.cle) ? '' : 'opacity-60'}`}>
                  <input type="checkbox" checked={cochees.has(a.cle)} onChange={() => basculer(a.cle)} />
                  <span className="min-w-0 flex-1 truncate" title={a.operations[0]?.label}>{a.nom}</span>
                  <span className="text-[11px] text-ink-3">{a.operations.length} op.</span>
                  <span className="w-20 text-right tabular-nums">{euros(a.moyenne)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {groupe.manuel && !depose && (
            <button onClick={() => void degrouper()} className="btn-ghost mr-auto flex items-center gap-1 px-3 py-1.5 text-xs">
              <Ungroup size={13} /> Défaire ce groupe
            </button>
          )}
          <button onClick={onClose} className="btn-ghost px-3 py-1.5">Annuler</button>
          <button disabled={envoi || !v} onClick={() => void appliquer()} className="btn-sun px-4 py-1.5 disabled:opacity-50">
            {envoi ? 'Enregistrement…' : depose ? 'Créer le groupe' : cochees.size ? `Regrouper (${cochees.size + 1})` : 'Renommer'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
