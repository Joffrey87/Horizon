// Détail d'une ligne du budget pour le mois affiché : catégories, puis intitulés regroupés, puis opérations.
// Partagé par le Budget (sous une ligne du tableau) et le Résumé (sous une tuile dépliée).
import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { aplatirGroupes, detailLigne, euros, grouperParIntitule, type GroupeIntitules } from '../../lib/finances'
import type { FinTransaction } from '../../lib/types'
import { ProgressBar } from '../../components/ui'
import { LigneOperation } from './partage'
import { useFin, useIndex, useReconnaissance } from './contexte'

/** Niveau de détail d'une catégorie : fermée, ses groupes d'intitulés, ou toutes ses opérations. */
export type Niveau = 0 | 1 | 2

/** Bouton « Détails » à droite d'une catégorie : 1er clic, les groupes ; 2e, « Détails+ »,
 *  toutes les opérations ; 3e, on referme. */
export function BoutonDetails({ niveau, onChange }: { niveau: Niveau; onChange: (n: Niveau) => void }) {
  const suivant = ((niveau + 1) % 3) as Niveau
  return (
    <button onClick={() => onChange(suivant)} aria-pressed={niveau > 0}
      title={niveau === 0 ? 'Ouvrir : un groupe par intitulé' : niveau === 1 ? 'Détails+ : toutes les opérations' : 'Refermer'}
      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] ${niveau ? 'border-sun-soft/60 bg-panel-3 text-sun-soft' : 'border-line-2 text-ink-3 hover:text-ink'}`}>
      {niveau === 2 ? 'Détails+' : 'Détails'}
    </button>
  )
}

/** Une ligne pour le mois affiché : les totaux par sous-catégorie. Chaque sous-catégorie
 *  s'ouvre sur ses groupes d'intitulés (clic sur le nom ou « Détails »), puis sur toutes
 *  ses opérations (« Détails+ »). `niveauTous` (pastille de la ligne du tableau) règle
 *  toutes les catégories d'un coup ; chacune reste ensuite réglable seule.
 *  Avec `couleur` (tuiles du Résumé) : version épurée — barre de part de cette couleur, ni nombre d'opérations ni « Détails ». */
export function DetailLigne({ cle, niveauTous = 0, couleur }: { cle: string; niveauTous?: Niveau; couleur?: string }) {
  const { mois, filtre } = useFin()
  const transactions = useHorizon((s) => s.finTransactions)
  const idx = useIndex()
  const [niveaux, setNiveaux] = useState<Map<string, Niveau>>(new Map())
  const [defaut, setDefaut] = useState<Niveau>(niveauTous)
  // Nouvelle valeur de la pastille : elle s'applique à toutes les catégories (réglages individuels oubliés).
  const [dernier, setDernier] = useState(niveauTous)
  if (dernier !== niveauTous) { setDernier(niveauTous); setDefaut(niveauTous); setNiveaux(new Map()) }
  const groupes = useMemo(() => detailLigne({ cle, mois, transactions, idx, filtre }), [cle, mois, transactions, idx, filtre])
  if (!groupes.length) return <p className="py-2 text-xs text-ink-3">Aucune opération</p>
  // Ligne sans sous-catégorie (Dons, Vacances…) : pas d'étage intermédiaire, les groupes directement.
  if (groupes.length === 1 && !groupes[0]!.nom.includes(' › ')) {
    return (
      <OperationsGroupees operations={groupes[0]!.operations} nomCategorie={groupes[0]!.court} toutDeplie={defaut === 2} />
    )
  }
  const total = groupes.reduce((s, g) => s + g.total, 0)
  // Une seule catégorie (ex. Aménagement › Travaux) : ouverte d'office sur ses groupes
  // (une enseigne de bricolage…), sans aller jusqu'aux opérations.
  const parDefaut: Niveau = groupes.length === 1 && defaut === 0 ? 1 : defaut
  const niveau = (nom: string): Niveau => niveaux.get(nom) ?? parDefaut
  const regler = (nom: string, n: Niveau) => setNiveaux(new Map(niveaux).set(nom, n))

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-line/40">
        {groupes.map((g) => {
          const n = niveau(g.nom)
          return (
            <li key={g.nom}>
              <div className="flex items-center gap-3 rounded py-1.5 text-sm hover:bg-panel-2/50">
                <button onClick={() => regler(g.nom, n ? 0 : 1)} aria-expanded={n > 0}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  {n ? <ChevronDown size={13} className="shrink-0 text-ink-3" /> : <ChevronRight size={13} className="shrink-0 text-ink-3" />}
                  <span className="min-w-0 flex-1 truncate" title={g.nom}>{g.court}</span>
                  <span className={couleur ? 'w-14 sm:w-24' : 'hidden w-32 sm:block'}>
                    {total > 0 && g.total > 0 && <ProgressBar value={(g.total / total) * 100} color={couleur ?? 'var(--color-teal)'} />}
                  </span>
                  {!couleur && <span className="w-16 text-right text-xs text-ink-3">{g.operations.length} op.</span>}
                  <span className={`text-right font-medium tabular-nums ${couleur ? 'w-16' : 'w-24'}`}>{euros(g.total)}</span>
                </button>
                {!couleur && <BoutonDetails niveau={n} onChange={(v) => regler(g.nom, v)} />}
              </div>
              {n > 0 && (
                <div className="mb-2 ml-5 border-l border-line/60 pl-3">
                  <OperationsGroupees operations={g.operations} nomCategorie={g.court} toutDeplie={n === 2} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * Opérations d'une catégorie pour le mois, regroupées par intitulé très semblable
 * (Carrefour City, Carrefour Market, CRF → Carrefour ; regroupements manuels compris) :
 * une ligne par groupe, un clic la déplie ; `toutDeplie` (« Détails+ ») les ouvre toutes.
 * Un groupe manuel s'ouvre sur ses intitulés semblables, puis sur les opérations.
 * Un groupe d'une seule opération s'affiche directement.
 */
function OperationsGroupees({ operations, nomCategorie, toutDeplie }: {
  operations: FinTransaction[]; nomCategorie: string; toutDeplie: boolean
}) {
  const regles = useHorizon((s) => s.finGroups)
  const idx = useIndex()
  const reco = useReconnaissance()
  const [ouverts, setOuverts] = useState<Set<string>>(new Set())
  const groupes = useMemo(() => aplatirGroupes(
    grouperParIntitule(operations, regles, (tx) => (reco.estLocal(tx) ? reco.libelle(tx) : null)), nomCategorie),
  [operations, regles, reco, nomCategorie])
  const basculer = (k: string) => {
    const s = new Set(ouverts)
    if (s.has(k)) s.delete(k); else s.add(k)
    setOuverts(s)
  }

  // Groupe manuel → intitulés semblables → opérations ; tout reste dans les colonnes
  // d'une opération (LigneOperation) : le chevron à la place de la date (un peu
  // décalé à chaque niveau), l'intitulé et le montant alignés.
  const liste = (gs: GroupeIntitules[], parent: string, niveau: number): ReactNode => gs.map((g) => {
    if (g.operations.length === 1) return <LigneOperation key={`${parent}/${g.cle}`} tx={g.operations[0]!} idx={idx} />
    const cle = `${parent}/${g.cle}`
    const ouvert = toutDeplie || ouverts.has(cle)
    return (
      <li key={cle}>
        <button onClick={() => basculer(cle)} aria-expanded={ouvert} disabled={toutDeplie}
          title={`${g.operations.length} opérations : ${[...new Set(g.operations.map((tx) => tx.label))].join(' · ')}`}
          className="flex w-full items-center gap-x-3 rounded py-1.5 text-left text-sm hover:bg-panel-2/50">
          <span className="flex w-14 shrink-0 items-center text-xs text-ink-3" style={{ paddingLeft: niveau * 10 }}>
            {ouvert ? <ChevronDown size={13} className="shrink-0" /> : <ChevronRight size={13} className="shrink-0" />}
          </span>
          <span className="w-40 min-w-0 shrink-0 truncate sm:w-52">{g.nom}</span>
          <span className={`w-24 shrink-0 text-right font-medium tabular-nums ${g.total < 0 ? 'text-[#4cc79a]' : ''}`}>
            {g.total < 0 ? '+' : ''}{euros(-g.total, true)}
          </span>
        </button>
        {ouvert && (
          <ul className={`mb-1 divide-y divide-line/40 rounded ${niveau ? 'bg-panel-2/70' : 'bg-panel-2/40'}`}>
            {g.sousGroupes
              ? liste(g.sousGroupes, cle, niveau + 1)
              : g.operations.map((tx) => <LigneOperation key={tx.id} tx={tx} idx={idx} />)}
          </ul>
        )}
      </li>
    )
  })

  return <ul className="divide-y divide-line/40">{liste(groupes, '', 0)}</ul>
}
