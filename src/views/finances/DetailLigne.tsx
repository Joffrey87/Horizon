// Détail d'une ligne du budget pour le mois affiché : catégories, puis intitulés regroupés, puis opérations.
// Partagé par le Budget (sous une ligne du tableau) et le Résumé (sous une tuile dépliée).
import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { categoriesParLigne, categorieEffective, aplatirGroupes, detailHorsCapital, detailLigne, euros, grouperParIntitule, hierarchieDetail, nomPropres, nomLisible, titulaireDe, type GroupeCategorie, type GroupeIntitules } from '../../lib/finances'
import type { FinTransaction } from '../../lib/types'
import { cleCommercant, clesDuGroupe, planAlias, planRegrouper, planSeparer, type Ecriture } from '../../lib/editionGroupes'
import { ProgressBar } from '../../components/ui'
import { LigneOperation } from './partage'
import { IconeCompte } from './IconeCompte'
import { FenetreConso, varianteEnergie } from './ConsoEnergie'
import { siteEnergie } from '../../lib/energie'
import { dateCourte, useFin, useIndex, useReconnaissance } from './contexte'
import { useTuilesMois } from './tuilesMois'

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
 *  toutes les catégories d'un coup ; chacune reste ensuite réglable seule. */
export function DetailLigne({ cle, niveauTous = 0 }: { cle: string; niveauTous?: Niveau }) {
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
                  <span className="hidden w-32 sm:block">
                    {total > 0 && g.total > 0 && <ProgressBar value={(g.total / total) * 100} color="var(--color-teal)" />}
                  </span>
                  <span className="w-16 text-right text-xs text-ink-3">{g.operations.length} op.</span>
                  <span className="w-24 text-right font-medium tabular-nums">{euros(g.total)}</span>
                </button>
                <BoutonDetails niveau={n} onChange={(v) => regler(g.nom, v)} />
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

/** Opérations d'un nœud (sous-catégorie, « Autres » = opérations propres du parent, ou catégorie seule). */
function opsDe(groupes: GroupeCategorie[], parent: string, enfant: string | null): FinTransaction[] {
  if (enfant === null || enfant === nomPropres(parent)) return groupes.find((g) => g.nom === parent)?.operations ?? []
  return groupes.find((g) => g.nom === `${parent} › ${enfant}`)?.operations ?? []
}

/** Toutes les opérations d'une catégorie, sous-catégories comprises. */
function opsNoeud(groupes: GroupeCategorie[], parent: string): FinTransaction[] {
  return groupes.filter((g) => g.nom === parent || g.nom.startsWith(`${parent} › `)).flatMap((g) => g.operations)
}

/** Applique des écritures planifiées (editionGroupes) sur une table. */
async function appliquer(table: 'fin_groups' | 'fin_merchant_alias', plan: Ecriture[]) {
  const { insert, update, remove } = useHorizon.getState()
  for (const e of plan) {
    if (e.op === 'insert') await insert(table, e.values)
    else if (e.op === 'update') await update(table, e.id, e.values)
    else await remove(table, e.id)
  }
}

type Selection = { type: 'op'; tx: FinTransaction; groupe: string } | { type: 'groupe'; groupe: string }
const BTN = 'rounded-full border px-2.5 py-0.5 text-[12px]'
const BTN_OK = `${BTN} border-[#4cc79a]/70 text-[#4cc79a]`
const BTN_NEUTRE = `${BTN} border-line-2 text-ink-2`
const CHAMP = 'mt-0.5 w-full rounded-md border border-line-2 bg-panel px-2 py-1 text-[13px] text-ink outline-none focus:border-[#c9b48a]'

/** Panneau d'édition, dans la boîte sable sous le groupe touché : intitulé (opération)
 *  ou nom (groupe), puis « Regrouper avec… » (choix du groupe et du nom), et Séparer. */
function PanneauEdition({ sel, groupe, autres, nomAffiche, onClose }: {
  sel: Selection; groupe: GroupeIntitules; autres: GroupeIntitules[]; nomAffiche: string; onClose: () => void
}) {
  const regles = useHorizon((s) => s.finGroups)
  const alias = useHorizon((s) => s.finMerchantAlias)
  const [fusion, setFusion] = useState(false)
  const [cible, setCible] = useState<string | null>(autres[0]?.cle ?? null)
  const [nom, setNom] = useState(nomAffiche)
  const [envoi, setEnvoi] = useState(false)
  const [choixCat, setChoixCat] = useState(false)
  const [conso, setConso] = useState(false)
  const idx = useIndex()
  const site = sel.type === 'op' ? siteEnergie(nomAffiche, sel.tx.label_local, sel.tx.label) : null
  const lancer = async (f: () => Promise<void>) => { setEnvoi(true); await f(); setEnvoi(false); onClose() }
  const renommer = () => lancer(async () => {
    if (sel.type === 'op') return appliquer('fin_merchant_alias', planAlias([cleCommercant(sel.tx.label)], nom, alias))
    if (groupe.manuel) return appliquer('fin_groups', planRegrouper(clesDuGroupe(groupe, regles), nom, regles))
    return appliquer('fin_merchant_alias', planAlias(groupe.cles, nom, alias))
  })
  const regrouper = () => lancer(async () => {
    const autre = autres.find((g) => g.cle === cible)
    if (!autre) return
    await appliquer('fin_groups', planRegrouper([...clesDuGroupe(groupe, regles), ...clesDuGroupe(autre, regles)], nom, regles))
  })
  const separer = () => lancer(() => appliquer('fin_groups', planSeparer(clesDuGroupe(groupe, regles), regles)))

  // Catégorie de CETTE opération seulement : même écriture que le classement à la main (LigneOperation).
  const changerCategorie = (id: string) => sel.type === 'op' && lancer(async () => { await useHorizon.getState().update('fin_transactions', sel.tx.id, { category_id: id, category_manual: true }) })
  if (choixCat && sel.type === 'op') {
    const actuelle = categorieEffective(sel.tx.category_id, idx)?.id
    return (
      <div data-testid="panneau-categorie" className="my-1.5 rounded-lg border border-line-2 bg-panel-2 p-2">
        <div className="max-h-56 overflow-y-auto">
          {categoriesParLigne(idx).map((g) => (
            <div key={g.ligne?.id ?? '-'} className="mb-1.5">
              <p className="px-1 text-[10.5px] text-ink-3">{g.ligne?.name ?? '—'}</p>
              <div className="flex flex-wrap gap-1">
                {g.categories.map((c) => (
                  <button key={c.id} disabled={envoi} onClick={() => void changerCategorie(c.id)} aria-pressed={c.id === actuelle}
                    className={`rounded-md px-1.5 py-0.5 text-[11.5px] ${c.id === actuelle ? 'bg-[#eda145]/10 text-[#eda145] ring-1 ring-[#eda145]/60' : 'bg-[#c9b48a]/10 text-ink-2 hover:text-ink'}`}>
                    {c.nom}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex"><button onClick={() => setChoixCat(false)} className={BTN_NEUTRE}>Annuler</button></div>
      </div>
    )
  }
  if (fusion) return (
    <div data-testid="panneau-fusion" className="my-1.5 rounded-lg border border-line-2 bg-panel-2 p-2">
      <ul className="max-h-32 overflow-y-auto">
        {autres.map((g) => (
          <li key={g.cle}>
            <button onClick={() => { setCible(g.cle); setNom(g.nom) }} aria-pressed={cible === g.cle}
              className={`flex w-full items-baseline justify-between rounded px-1.5 py-1 text-left text-[12px] ${cible === g.cle ? 'bg-[#eda145]/10 text-[#eda145]' : 'text-ink-2'}`}>
              <span className="min-w-0 truncate">{g.nom}</span>
              <span className="shrink-0 tabular-nums text-ink-3">{euros(g.total)}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[10.5px] text-ink-3">Nom du groupe</p>
      <input aria-label="Nom du groupe" value={nom} onChange={(e) => setNom(e.target.value)} className={CHAMP} />
      {(() => { const autre = autres.find((g) => g.cle === cible); if (!autre) return null
        const n = groupe.operations.length + autre.operations.length
        return <p className="mt-1 text-[10.5px] text-ink-3">{n} opération{n > 1 ? 's' : ''} · {euros(groupe.total + autre.total)}</p> })()}
      <div className="mt-2 flex gap-1.5">
        <button disabled={envoi || !cible || !nom.trim()} onClick={() => void regrouper()} className={BTN_OK}>Regrouper</button>
        <button onClick={() => setFusion(false)} className={BTN_NEUTRE}>Annuler</button>
      </div>
    </div>
  )
  return (
    <div data-testid="panneau-edition" className="my-1.5 rounded-lg border border-line-2 bg-panel-2 p-2">
      {sel.type === 'op' && <p className="truncate text-[10.5px] text-ink-3" title={sel.tx.label}>{sel.tx.label}</p>}
      <input aria-label={sel.type === 'op' ? 'Intitulé' : 'Nom du groupe'} value={nom}
        onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void renommer() }} className={CHAMP} />
      {sel.type === 'op' && <p className="mt-1 text-[10.5px] text-ink-3">Pour toutes les opérations {groupe.nom}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button disabled={envoi} onClick={() => void renommer()} className={BTN_OK}>Renommer</button>
        {sel.type === 'op' && <button onClick={() => setChoixCat(true)} className={BTN_NEUTRE}>Catégorie</button>}
        {site && <button onClick={() => setConso(!conso)} aria-pressed={conso} className={BTN_NEUTRE}>Consommation</button>}
        {autres.length > 0 && <button onClick={() => { const c = autres.find((g) => g.cle === cible) ?? autres[0]; if (c) { setCible(c.cle); setNom(c.nom) } setFusion(true) }} className={BTN_NEUTRE}>Regrouper avec…</button>}
        {sel.type === 'groupe' && groupe.manuel && (
          <button disabled={envoi} onClick={() => void separer()} className={`${BTN} border-[#eda145]/70 text-[#eda145]`}>Séparer</button>)}
      </div>
      {site && conso && <FenetreConso site={site} variante={varianteEnergie()} onClose={() => setConso(false)} />}
    </div>
  )
}

/** Groupes marchand : « Carrefour 6 » repliable, opérations isolées une par une.
 *  Toucher le nom d'un groupe ouvert, ou une opération, ouvre le panneau d'édition. */
function MarchandsLecture({ operations, nomCategorie }: { operations: FinTransaction[]; nomCategorie: string }) {
  const regles = useHorizon((s) => s.finGroups)
  const reco = useReconnaissance()
  const idx = useIndex()
  const [ouverts, setOuverts] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<Selection | null>(null)
  const nom = (tx: FinTransaction) => (reco.estLocal(tx) ? reco.libelle(tx) : nomLisible(tx.label)) || '(sans libellé)'
  const groupes = useMemo(() => aplatirGroupes(
    grouperParIntitule(operations, regles, (tx) => (reco.estLocal(tx) ? reco.libelle(tx) : null)), nomCategorie),
  [operations, regles, reco, nomCategorie])
  const bascule = (k: string) => {
    const s = new Set(ouverts)
    if (s.has(k)) { s.delete(k); if (sel?.groupe === k) setSel(null) } else s.add(k)
    setOuverts(s)
  }
  const choisir = (n: Selection) => setSel(sel && sel.type === n.type && sel.groupe === n.groupe
    && (n.type === 'groupe' || (sel.type === 'op' && sel.tx.id === n.tx.id)) ? null : n)
  const m = (v: number) => <span className="shrink-0 tabular-nums">{v < 0 ? '+' : ''}{euros(Math.abs(v))}</span>
  const panneau = (g: GroupeIntitules) => sel?.groupe === g.cle && (
    <PanneauEdition key={sel.type === 'op' ? sel.tx.id : 'g'} sel={sel} groupe={g} onClose={() => setSel(null)}
      autres={groupes.filter((x) => x.cle !== g.cle)} nomAffiche={sel.type === 'op' ? nom(sel.tx) : g.nom} />
  )
  return (
    <ul className="py-0.5">
      {groupes.map((g) => {
        if (g.operations.length === 1) {
          const tx = g.operations[0]!
          const actif = sel?.type === 'op' && sel.tx.id === tx.id
          return (
            <li key={g.cle}>
              <button data-testid="souscat-op" onClick={() => choisir({ type: 'op', tx, groupe: g.cle })}
                className={`flex w-full items-baseline gap-3 py-1 text-left text-[12px] ${actif ? 'text-[#eda145]' : 'text-ink-2'}`}>
                <span className={`w-11 shrink-0 tabular-nums ${actif ? '' : 'text-ink-3'}`}>{dateCourte(tx.date)}</span>
                <IconeCompte tx={tx} idx={idx} />
                <span className="min-w-0 flex-1 truncate">{nom(tx)}</span>
                {m(-Number(tx.amount))}
              </button>
              {panneau(g)}
            </li>
          )
        }
        const ouvert = ouverts.has(g.cle)
        return (
          <li key={g.cle}>
            <div className="flex w-full items-baseline gap-3 py-1 text-[12px] text-ink">
              <button data-testid="souscat-groupe" onClick={() => bascule(g.cle)} aria-expanded={ouvert} className="w-11 shrink-0 text-left text-ink-3">
                {ouvert ? <ChevronDown size={12} className="inline" /> : <ChevronRight size={12} className="inline" />}
              </button>
              {g.operations.every((o) => o.account_id === g.operations[0]!.account_id && titulaireDe(o, idx) === titulaireDe(g.operations[0]!, idx))
                ? <IconeCompte tx={g.operations[0]!} idx={idx} /> : <span className="w-[18px] shrink-0" />}
              <button data-testid="souscat-groupe-nom" onClick={() => (ouvert ? choisir({ type: 'groupe', groupe: g.cle }) : bascule(g.cle))}
                className={`min-w-0 flex-1 truncate text-left ${sel?.type === 'groupe' && sel.groupe === g.cle ? 'text-[#eda145]' : ''}`}>
                {g.nom}
                <span className="ml-1.5 rounded-full bg-[#c9b48a]/20 px-1.5 text-[10px] text-[#d8c7a3]">{g.operations.length}</span>
              </button>
              {m(g.total)}
            </div>
            {ouvert && (
              <div className="flex flex-wrap gap-1.5 pb-1.5 pl-14">
                {g.operations.map((tx) => {
                  const actif = sel?.type === 'op' && sel.tx.id === tx.id
                  return (
                    <button key={tx.id} data-testid="souscat-chip" onClick={() => choisir({ type: 'op', tx, groupe: g.cle })}
                      className={`rounded-md px-1.5 py-0.5 text-[11px] tabular-nums ${actif ? 'bg-[#eda145]/10 text-[#eda145] ring-1 ring-[#eda145]/60' : 'bg-[#c9b48a]/10 text-ink-2'}`}>
                      {dateCourte(tx.date)} · {euros(-Number(tx.amount))}
                    </button>
                  )
                })}
              </div>)}
            {ouvert && panneau(g)}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Détail des tuiles (tuiles du Résumé) : catégorie → sous-catégorie et leur somme du mois.
 * Toucher une sous-catégorie (ou une catégorie sans sous-catégorie) montre ses opérations, regroupées par marchand.
 * Catégories et montants en lecture seule, sans barre ; intitulés et regroupements modifiables.
 */
export function DetailLigneLecture({ cle, couleur, barres = false, aplat = false, deplie = false, exclure }: { cle: string; couleur: string; barres?: boolean; aplat?: boolean; deplie?: boolean; exclure?: Set<string> }) {
  const { mois, filtre } = useFin()
  const toutes = useHorizon((s) => s.finTransactions)
  const transactions = useMemo(() => exclure?.size ? toutes.filter((t) => !exclure.has(t.id)) : toutes, [toutes, exclure])
  const idx = useIndex()
  // Même chiffre que la tuile : le capital des prêts est retiré (il est compté dans l'Épargné).
  const { capitalMois } = useTuilesMois()
  const { groupes } = useMemo(() => detailHorsCapital(detailLigne({ cle, mois, transactions, idx, filtre }), cle, capitalMois),
    [cle, mois, transactions, idx, filtre, capitalMois])
  // À plat (Frais fixe) : la catégorie qui porte le nom de la ligne cède la place à ses sous-catégories, au même niveau
  // que les autres catégories de la ligne (Impôts & taxes, Frais bancaires…), chacune sur une seule ligne cliquable.
  const noeuds = useMemo(() => {
    const h = hierarchieDetail(groupes)
    if (!aplat) return h
    return h.flatMap((n) => n.enfants.length > 1 && /^frais fixes?$/i.test(n.nom)
      ? n.enfants.filter((e) => e.total !== 0).map((e) => ({ ...n, nom: e.nom, total: e.total, enfants: [], _parent: n.nom, _enfant: e.nom }))
      : [n]).sort((x, y) => y.total - x.total)
  }, [groupes, aplat])
  /** Pastilles sous une catégorie qui porte un prélèvement d'emprunt : la part restante, et où est l'opération. */
  const pastilles = (nomComplet: string) => {
    void nomComplet
    return null
  }
  const [ouvert, setOuvert] = useState<string | null>(null)
  // Déplié (Courses) : tout est ouvert d'emblée ; toucher une ligne la replie (ou la rouvre).
  const [replies, setReplies] = useState<Set<string>>(() => new Set())
  if (!noeuds.length) return <p className="py-2 text-xs text-ink-3">Aucune dépense ce mois-ci</p>
  // Une seule catégorie (Vacances…) : pas d'étage inutile, les opérations directement ;
  // si elle a plusieurs sous-catégories, ce sont elles qui deviennent le premier niveau.
  if (noeuds.length === 1 && noeuds[0]!.enfants.length <= 1) {
    return <div data-testid="detail-lecture"><MarchandsLecture operations={opsNoeud(groupes, noeuds[0]!.nom)} nomCategorie={noeuds[0]!.nom} /></div>
  }
  const total = noeuds.reduce((s, n) => s + n.total, 0)
  const part = (v: number, base: number) => barres && base > 0 && v > 0 ? (
    <span className="w-14 sm:w-24"><ProgressBar value={(v / base) * 100} color={couleur} /></span>
  ) : barres ? <span className="w-14 sm:w-24" /> : null

  const ligne = (k: string, contenu: ReactNode, ops: FinTransaction[], nomCat: string, cls: string, testid?: string) => {
    const estOuvert = deplie ? !replies.has(k) : ouvert === k
    const basculer = () => deplie
      ? setReplies((r) => { const n = new Set(r); if (n.has(k)) n.delete(k); else n.add(k); return n })
      : setOuvert(estOuvert ? null : k)
    return (
      <>
        <button data-testid={testid} onClick={basculer} aria-expanded={estOuvert}
          className={`flex w-full items-center gap-3 text-left ${cls} ${estOuvert ? 'text-ink' : ''}`}>
          {contenu}
        </button>
        {estOuvert && (
          <div className="mb-1.5 ml-2 rounded-lg bg-[#c9b48a]/[0.07] px-2">
            <MarchandsLecture operations={ops} nomCategorie={nomCat} />
          </div>
        )}
      </>
    )
  }
  return (
    <ul data-testid="detail-lecture" className="divide-y divide-line/40">
      {noeuds.length === 1 && noeuds[0]!.enfants.map((e) => (
        <li key={e.nom}>
          {ligne(noeuds[0]!.nom + '\u0000' + e.nom, <>
            <span className="min-w-0 flex-1 truncate" title={e.nom}>{e.nom}</span>
            {part(e.total, total)}
            <span className="w-16 text-right font-medium tabular-nums">{euros(e.total)}</span>
          </>, opsDe(groupes, noeuds[0]!.nom, e.nom), e.nom, 'py-1.5 text-sm', 'detail-sous-categorie')}
        </li>
      ))}
      {noeuds.length > 1 && noeuds.map((n) => (
        <li key={n.nom}>
          {n.enfants.length > 1 && !aplat
            ? <div className="flex items-center gap-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate" title={n.nom}>{n.nom}</span>
                {part(0, total)}
                <span className="w-16 text-right font-medium tabular-nums">{euros(n.total)}</span>
              </div>
            : ligne(n.nom + '\u0000', <>
                <span className="min-w-0 flex-1 truncate" title={n.nom}>{n.nom}</span>
                {part(n.total, total)}
                <span className="w-16 text-right font-medium tabular-nums">{euros(n.total)}</span>
              </>, '_parent' in n ? opsDe(groupes, n._parent as string, (n as unknown as { _enfant: string })._enfant) : opsNoeud(groupes, n.nom), n.nom, 'py-1.5 text-sm', 'detail-poste')}
          {n.enfants.length <= 1 && pastilles(n.nom)}
          {n.enfants.length > 1 && !aplat && n.enfants.map((e) => (
            <div key={e.nom}>
              {ligne(n.nom + '\u0000' + e.nom, <>
                <span className="min-w-0 flex-1 truncate" title={`${n.nom} › ${e.nom}`}>{e.nom}</span>
                {part(e.total, total)}
                <span className="w-16 text-right tabular-nums">{euros(e.total)}</span>
              </>, opsDe(groupes, n.nom, e.nom), e.nom, 'py-1 pl-4 text-[13px] text-ink-2', 'detail-sous-categorie')}
              {pastilles(e.nom === nomPropres(n.nom) ? n.nom : `${n.nom} › ${e.nom}`)}
            </div>
          ))}
        </li>
      ))}
    </ul>
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

/** Panneau d'édition d'une opération seule (Dernières opérations du Résumé) : le même que dans le
 *  détail, avec ses voisins de catégorie du mois pour « Regrouper avec… ». */
export function EditionOperation({ tx, onClose }: { tx: FinTransaction; onClose: () => void }) {
  const transactions = useHorizon((s) => s.finTransactions)
  const regles = useHorizon((s) => s.finGroups)
  const reco = useReconnaissance()
  const groupes = useMemo(() => {
    const voisins = transactions.filter((t) => !t.internal && t.category_id === tx.category_id && t.date.slice(0, 7) === tx.date.slice(0, 7))
    return aplatirGroupes(grouperParIntitule(voisins, regles, (t) => (reco.estLocal(t) ? reco.libelle(t) : null)))
  }, [transactions, regles, reco, tx])
  const groupe = groupes.find((g) => g.operations.some((o) => o.id === tx.id))
  if (!groupe) return null
  const nom = (reco.estLocal(tx) ? reco.libelle(tx) : nomLisible(tx.label)) || '(sans libellé)'
  return <PanneauEdition sel={{ type: 'op', tx, groupe: groupe.cle }} groupe={groupe} onClose={onClose}
    autres={groupes.filter((g) => g.cle !== groupe.cle)} nomAffiche={nom} />
}
