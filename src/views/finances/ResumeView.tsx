import { useMemo, useState, type ReactNode } from 'react'
import { Heart, PiggyBank, Receipt, Search, Plane, ShoppingCart, Sofa, Wallet, Zap, type LucideIcon } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { entreesPrevues, euros } from '../../lib/finances'
import { COULEURS_ANNEAU, eclaircie, rgba, tuilesBudgets, type TuileBudget } from '../../lib/resume'
import { EmptyState } from '../../components/ui'
import { FiltreSeg, NavMois } from './partage'
import { DetailAuDela, DetailEpargne, DetailEpargneUtilisee, lignesAuDela } from './DetailsTuiles'
import { epargneUtilisee } from '../../lib/epargneUtilisee'
import { epargneDepenses, epargneVacances } from '../../lib/regroupement'
import { decaleMois } from '../../lib/finances'
import { soldesComptes } from '../../lib/soldes'
import { PanneauSoldes } from './SoldesComptes'
import { IconeDeCompte } from './IconeCompte'
import { useTuilesMois } from './tuilesMois'
import { useFin, useIndex } from './contexte'
import { estMoisSansObjectif, LIGNE_AVEC_ANNEAU } from '../../lib/moisSansObjectif'
import { MontantBudget, useBudgetMois } from './budgetMois'
import { DetailLigneLecture } from './DetailLigne'
import { DernieresOperations } from './DernieresOperations'
import { useMediaQuery } from '../../lib/useMediaQuery'

const ICONES: Record<string, LucideIcon> = {
  courses: ShoppingCart, amenagement: Sofa, vacances: Plane, courantes: Wallet, exceptionnelles: Zap, fraisfixe: Receipt, dons: Heart,
}

/** Cible mensuelle d'épargne : l'anneau d'« Épargné » est plein à ce montant (plafonné à 100 %, excédent non affiché). */
export const CIBLE_EPARGNE = 1800
/** Cibles fixes : l'anneau est plein à ce montant dépensé (tous les mois, objectifs ou non) ; aucun autre chiffre que le dépensé. */
export const CIBLE_COURSES = 750
export const CIBLE_VACANCES = 700

/** Anneau de part consommée (plafonnée à 100 % pour le tracé), l'icône du budget au centre. Aucun chiffre dedans. */
function Anneau({ ratio, couleur, taille, trait = 4, halo = false, sansTrace = false, children }: {
  ratio: number | null; couleur: string; taille: number; trait?: number; halo?: boolean; sansTrace?: boolean; children: ReactNode
}) {
  if (sansTrace) return <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: taille, height: taille }}>{children}</span>
  const r = taille / 2 - trait / 2
  const circ = 2 * Math.PI * r
  const trace = ratio === null ? 0 : Math.min(1, ratio) * circ
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: taille, height: taille }}>
      <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} className="absolute inset-0" aria-hidden>
        <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={trait} />
        <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke={couleur} strokeWidth={trait} strokeLinecap={trace > 0 ? 'round' : 'butt'}
          strokeDasharray={`${trace.toFixed(1)} ${circ.toFixed(1)}`} transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
          style={halo && trace > 0 ? { filter: `drop-shadow(0 0 4px ${couleur})` } : undefined} />
      </svg>
      <span className="relative flex">{children}</span>
    </span>
  )
}

/**
 * Contenu commun d'une tuile (téléphone et bureau) : à gauche l'anneau fin avec l'icône, le nom et dessous, petit et gris,
 * « dépensé / budget » (le budget est cliquable : il change celui de ce mois) ; à droite, alignés à droite, « Reste » en petit
 * libellé et le montant restant, gros et gras (rouge-orangé au-delà du budget, anneau plein). Sans budget : « fixer un budget ».
 */
/** Ambre : montants des dépenses de vie (courantes, exceptionnelles, aménagement) et Reste négatif. */
const AMBRE = '#eda145'
const CLES_AMBRE = new Set(['courantes', 'exceptionnelles', 'amenagement'])

function CorpsTuile({ t, edition, bureau }: { t: TuileBudget; edition: ReturnType<typeof useBudgetMois>; bureau: boolean }) {
  const Icone = ICONES[t.cle] ?? Wallet
  const depasse = t.ton === 'depasse'
  const clair = eclaircie(t.rvb, 0.24)
  const ouvrir = edition.peutModifier && t.ligneId ? () => edition.ouvrir({ id: t.ligneId!, name: t.titre }, t.budget) : undefined
  const { mois } = useFin()
  // Mois sans objectif : seulement le dépensé ; Frais fixe garde son anneau, les autres n'en ont pas.
  const cible = t.cle === 'courses' ? CIBLE_COURSES : null
  const sansObjectif = estMoisSansObjectif(mois) || cible !== null
  const sansAnneau = sansObjectif && t.cle !== LIGNE_AVEC_ANNEAU && cible === null
  const negatif = !sansObjectif && t.restant !== null && t.restant < 0
  return (
    <>
      <Anneau sansTrace={sansAnneau} ratio={sansAnneau ? null : cible ? Math.max(0, t.depense) / cible : t.ratio} couleur={depasse && !cible ? COULEURS_ANNEAU.depasse : clair} taille={bureau ? 36 : 38} trait={bureau ? 2 : 3} halo={bureau}>
        <Icone size={bureau ? 15 : 16} color={clair} strokeWidth={1.8} />
      </Anneau>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <p className={`truncate font-semibold text-ink-2 ${bureau ? 'text-[15px]' : 'text-[13px]'}`}>{t.titre}</p>
        {!sansObjectif && <p className={`whitespace-nowrap font-medium tabular-nums text-ink-3 ${bureau ? 'text-[12px]' : 'text-[11.5px]'}`}>
          {t.budget !== null ? (
            <>{euros(t.depense)} / <MontantBudget montant={t.budget} ajustement={edition.ajustement(t.ligneId)} onOuvrir={ouvrir} discret pointille /></>
          ) : ouvrir ? (
            <button type="button" onClick={ouvrir} data-testid="budget-fixer" className="-m-1 p-1 text-sun-soft/80 underline decoration-dotted decoration-sun-soft/60 underline-offset-2 hover:text-sun-soft">fixer un budget</button>
          ) : null}
        </p>}
      </div>
      <div className="shrink-0 text-right">
        <p className="mb-1 text-[10px] font-semibold leading-none tracking-[.06em] text-ink-3">{sansObjectif || t.restant === null ? 'Dépensé' : 'Reste'}</p>
        <b className={`block font-bold leading-none tabular-nums ${bureau ? 'text-[22px]' : 'text-[20px]'}`}
          style={{ color: negatif ? COULEURS_ANNEAU.depasse : CLES_AMBRE.has(t.cle) ? AMBRE : 'var(--color-ink)' }}>
          {euros(sansObjectif ? t.depense : t.restant ?? t.depense)}
        </b>
      </div>
    </>
  )
}

/** Poignée de dépliage : toucher la tuile la déplie, sauf si le toucher vise un bouton (montant du budget, fixer un budget). */
function enTete(depliable: boolean, ouvert: boolean, onBasculer: () => void) {
  return {
    role: depliable ? 'button' : undefined,
    tabIndex: depliable ? 0 : undefined,
    'aria-expanded': depliable ? ouvert : undefined,
    onClick: (e: React.MouseEvent) => { if (depliable && !(e.target as HTMLElement).closest('button, a')) onBasculer() },
    onKeyDown: (e: React.KeyboardEvent) => { if (depliable && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onBasculer() } },
  } as const
}

/** Téléphone : tuile teintée de la couleur du budget ; toucher la déplie (détail par catégorie, comme dans le Budget). */
function TuileBudgetAnneau({ t, edition, ouvert, onBasculer, exclureFF }: {
  exclureFF?: Set<string>; t: TuileBudget; edition: ReturnType<typeof useBudgetMois>; ouvert: boolean; onBasculer: () => void
}) {
  const clair = eclaircie(t.rvb, 0.24)
  const alpha = t.separe ? [0.1, 0.03] : [0.24, 0.06]
  const depliable = t.ligneId !== null
  return (
    <div data-testid={`tuile-${t.cle}`} data-ton={t.ton} data-ouvert={ouvert || undefined}>
      <div {...enTete(depliable, ouvert, onBasculer)}
        className={`flex min-h-[46px] items-center gap-3 border px-3 py-1 ${depliable ? 'cursor-pointer' : ''} ${ouvert ? 'rounded-t-[14px] border-b-transparent' : 'rounded-[14px]'}`}
        style={{ background: `linear-gradient(100deg, ${rgba(t.rvb, alpha[0]!)}, ${rgba(t.rvb, alpha[1]!)} 80%), #15110e`, borderColor: rgba(t.rvb, 0.28) }}>
        <CorpsTuile t={t} edition={edition} bureau={false} />
      </div>
      {ouvert && t.ligneId && (
        <div className={`${t.cle === 'fraisfixe' || t.cle === 'courses' ? '' : 'max-h-[45dvh] overflow-y-auto'} rounded-b-[14px] border border-t-0 px-3 py-0.5`} style={{ borderColor: rgba(t.rvb, 0.28), background: 'rgba(33,28,22,.55)' }}>
          <DetailLigneLecture cle={t.ligneId} couleur={clair} deplie={t.cle === 'courses'} aplat={t.cle === 'fraisfixe'} exclure={t.cle === 'fraisfixe' ? exclureFF : undefined} />
        </div>
      )}
    </div>
  )
}

/**
 * Bureau : ligne posée dans un panneau de verre, presque transparente, séparée de la précédente par un filet.
 * Le clic la déplie (détail par catégorie).
 */
function LigneVerre({ t, edition, ouvert, onBasculer, exclureFF }: {
  exclureFF?: Set<string>; t: TuileBudget; edition: ReturnType<typeof useBudgetMois>; ouvert: boolean; onBasculer: () => void
}) {
  const clair = eclaircie(t.rvb, 0.24)
  const depliable = t.ligneId !== null
  return (
    <div data-testid={`tuile-${t.cle}`} data-ton={t.ton} data-ouvert={ouvert || undefined} className="border-t border-white/[.09] first:border-t-0">
      <div {...enTete(depliable, ouvert, onBasculer)} className={`flex h-[50px] items-center gap-4 [@media(min-height:840px)]:h-[54px] ${depliable ? 'cursor-pointer' : ''}`}>
        <CorpsTuile t={t} edition={edition} bureau />
      </div>
      {ouvert && t.ligneId && (
        <div className={`${t.cle === 'fraisfixe' || t.cle === 'courses' ? '' : 'max-h-[45dvh] overflow-y-auto'} pb-2`}><DetailLigneLecture cle={t.ligneId} couleur={clair} deplie={t.cle === 'courses'} aplat={t.cle === 'fraisfixe'} exclure={t.cle === 'fraisfixe' ? exclureFF : undefined} /></div>
      )}
    </div>
  )
}

/**
 * Résumé : l'accueil de l'onglet Finances. Reste et Épargné du mois, puis une tuile à anneau
 * par budget du foyer (Courses, Aménagement, Vacances, Dépenses courantes, exceptionnelles, puis Dons à part).
 * Suit le mois et le filtre Foyer / Commun / Joffrey / Honorine, comme le Budget.
 */
/** Démo : ?variante=A|B|C force une variante du détail « Au-delà du budget ». */
const varianteDemo = () => { const v = new URLSearchParams(location.search).get('variante'); return v === 'A' || v === 'B' || v === 'C' ? v : undefined }

const COULEUR_UTILISEE = '#eda145'
export function ResumeView() {
  const { mois, setMois, filtre, setFiltre } = useFin()
  const lines = useHorizon((s) => s.finLines)
  const foyer = filtre === 'foyer'
  const [recents, setRecents] = useState(false)
  const [detail, setDetail] = useState<'reste' | 'epargne' | 'utilisee' | 'soldes' | 'epdep' | 'epvac' | null>(null)
  // Tuiles de budget dépliées (détail par catégorie).
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set())
  const basculerTuile = (cle: string) => setOuvertes((o) => { const n = new Set(o); if (n.has(cle)) n.delete(cle); else n.add(cle); return n })

  // Mêmes chiffres que le Budget : un seul calcul (tuilesMois.ts), capital de prêt compté en épargne et non en dépense.
  const { s, depenses, aVenir, epPrevues, listeEp, resteTuile, epargne } = useTuilesMois()
  const resteValable = resteTuile !== null
  const edition = useBudgetMois()
  const transactions = useHorizon((st) => st.finTransactions)
  const comptes = useHorizon((st) => st.finAccounts)
  const soldes = useMemo(() => soldesComptes(comptes, filtre), [comptes, filtre])
  const utilisee = useMemo(() => epargneUtilisee({ transactions, comptes, mois }), [transactions, comptes, mois])
  const categories = useHorizon((st) => st.finCategories)
  const epDep = useMemo(() => epargneDepenses({ transactions, comptes, categories, mois }), [transactions, comptes, categories, mois])
  const epVac = useMemo(() => epargneVacances({ transactions, comptes, categories, mois }), [transactions, comptes, categories, mois])
  // Salaire d'ouverture : la rémunération reçue en fin du mois précédent (elle ouvre ce mois) ; à défaut, le salaire prévu.
  const salaireOuverture = useMemo(() => {
    const prec = decaleMois(mois, -1)
    const r = transactions.filter((t) => t.date.startsWith(prec) && t.amount > 0 && !t.internal && /remuneration|salaire/i.test(t.label))
    return r.length ? r.reduce((n, t) => n + Number(t.amount), 0) : null
  }, [transactions, mois])
  const idx = useIndex()
  const prevues = useMemo(() => entreesPrevues({ mois, transactions, idx, filtre }), [mois, transactions, idx, filtre])
  const aPayer = aVenir.total + epPrevues.total

  // Bureau (≥ md, là où la barre latérale est affichée) : panneaux de verre ; téléphone : tuiles teintées.
  const bureau = useMediaQuery('(min-width: 768px)')
  const tuiles = useMemo(() => tuilesBudgets(s.lignes).filter((t) => !t.absente), [s.lignes])

  if (!lines.length) {
    return <EmptyState hint="Crée tes lignes (Frais fixe, Courses…) dans Réglages.">Aucune ligne de budget pour l’instant.</EmptyState>
  }

  const tailleMontant = bureau ? 'text-[20px] leading-tight' : 'text-[15px] leading-tight'
  const resteBtn = (
    <button type="button" data-testid="tuile-reste" aria-expanded={detail === 'reste'} disabled={!resteValable}
      onClick={() => setDetail(detail === 'reste' ? null : 'reste')} title="Voir le détail du calcul"
      className={`${bureau ? 'verre verre-tuile !py-2' : 'card px-2 py-2'} min-w-0 text-left disabled:cursor-default`}
      style={bureau ? undefined : { borderColor: 'rgba(245,158,11,.4)', background: 'linear-gradient(135deg, rgba(245,158,11,.14), rgba(25,21,18,.9) 70%)' }}>
      <p className="block-title overflow-hidden text-ellipsis whitespace-nowrap max-md:!tracking-[.04em]" data-testid="titre-reste">{resteTuile !== null && resteTuile < 0 ? 'Au-delà du budget' : 'Reste'}</p>
      <p className={`whitespace-nowrap font-bold tabular-nums ${tailleMontant}`}
        style={{ color: resteTuile === null ? '#857c6d' : resteTuile < 0 ? COULEURS_ANNEAU.depasse : COULEURS_ANNEAU.ok }}>
        {resteTuile === null ? '—' : euros(Math.abs(resteTuile))}
      </p>
      <p className="truncate text-[10.5px] leading-snug text-ink-3">
        {resteTuile === null ? 'budget : vue Foyer' : aPayer > 0.5 ? `${euros(aPayer)} dépenses à venir` : ' '}
      </p>
    </button>
  )
  const basculerEpargne = () => setDetail(detail === 'epargne' ? null : 'epargne')
  // Ligne Épargné : posée sous Frais fixe, comme une ligne de budget (montant épargné, anneau à 1 800 €, « Utilisée − x € »).
  const ratioEp = Math.min(1, Math.max(0, epargne) / CIBLE_EPARGNE)
  const corpsEpargne = (
    <>
      <span data-testid="anneau-epargne" data-ratio={Math.round(ratioEp * 100)} className="inline-flex">
        <Anneau ratio={ratioEp} couleur={COULEURS_ANNEAU.ok} taille={bureau ? 36 : 38} trait={bureau ? 2 : 3} halo={bureau}>
          <PiggyBank size={bureau ? 15 : 16} style={{ color: COULEURS_ANNEAU.ok }} strokeWidth={1.8} aria-hidden />
        </Anneau>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <p className={`truncate font-semibold text-ink-2 ${bureau ? 'text-[15px]' : 'text-[13px]'}`}>Épargne Avenir</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="mb-1 text-[10px] font-semibold leading-none tracking-[.06em] text-ink-3">Épargné</p>
        <b className={`block font-bold leading-none tabular-nums ${bureau ? 'text-[22px]' : 'text-[20px]'}`} style={{ color: COULEURS_ANNEAU.ok }}>{euros(epargne)}</b>
      </div>
    </>
  )
  const detailEpargne = detail === 'epargne' ? <DetailEpargne liste={listeEp} /> : detail === 'utilisee' ? <DetailEpargneUtilisee donnees={utilisee} /> : null
  const ouvertEp = detail === 'epargne' || detail === 'utilisee'
  const ligneEpargne = bureau ? (
    <div key="epargne" data-testid="tuile-epargne" data-ouvert={ouvertEp || undefined} className="border-t border-white/[.09] first:border-t-0">
      <div {...enTete(true, detail === 'epargne', basculerEpargne)} title="Voir les épargnes du mois" className="flex h-[50px] cursor-pointer items-center gap-4 [@media(min-height:840px)]:h-[54px]">{corpsEpargne}</div>
      {detailEpargne && <div className="flex justify-center pb-2">{detailEpargne}</div>}
    </div>
  ) : (
    <div key="epargne" data-testid="tuile-epargne" data-ouvert={ouvertEp || undefined}>
      <div {...enTete(true, detail === 'epargne', basculerEpargne)} title="Voir les épargnes du mois"
        className={`flex min-h-[46px] cursor-pointer items-center gap-3 border px-3 py-1 ${detailEpargne ? 'rounded-t-[14px] border-b-transparent' : 'rounded-[14px]'}`}
        style={{ background: 'linear-gradient(100deg, rgba(110,190,120,.2), rgba(110,190,120,.05) 80%), #15110e', borderColor: 'rgba(110,190,120,.28)' }}>
        {corpsEpargne}
      </div>
      {detailEpargne && <div className="flex justify-center rounded-b-[14px] border border-t-0 px-1 py-1" style={{ borderColor: 'rgba(110,190,120,.28)', background: 'rgba(33,28,22,.55)' }}>{detailEpargne}</div>}
    </div>
  )
  // Ligne Épargne Dépenses : virements vers le compte Epargne Dépenses ; le clic montre ce qui reste sur ce compte.
  const ligneMaison = (cle: string, rvb: [number, number, number], corps: ReactNode, ouvert: boolean, onBasculer: () => void, detailNode: ReactNode, sous?: ReactNode) => bureau ? (
    <div key={cle} data-testid={`tuile-${cle}`} data-ouvert={ouvert || undefined} className="border-t border-white/[.09] first:border-t-0">
      <div {...enTete(true, ouvert, onBasculer)} className="flex h-[50px] cursor-pointer items-center gap-4 [@media(min-height:840px)]:h-[54px]">{corps}</div>
      {sous && <div className="-mt-1.5 pb-1.5">{sous}</div>}
      {ouvert && detailNode && <div className="flex justify-center pb-2">{detailNode}</div>}
    </div>
  ) : (
    <div key={cle} data-testid={`tuile-${cle}`} data-ouvert={ouvert || undefined}>
      <div className={`border ${ouvert && detailNode ? 'rounded-t-[14px] border-b-transparent' : 'rounded-[14px]'}`}
        style={{ background: `linear-gradient(100deg, ${rgba(rvb, 0.2)}, ${rgba(rvb, 0.05)} 80%), #15110e`, borderColor: rgba(rvb, 0.28) }}>
        <div {...enTete(true, ouvert, onBasculer)} className="flex min-h-[46px] cursor-pointer items-center gap-3 px-3 py-1">{corps}</div>
        {sous && <div className="-mt-1 pb-1.5">{sous}</div>}
      </div>
      {ouvert && detailNode && <div className="flex justify-center rounded-b-[14px] border border-t-0 px-1 py-1" style={{ borderColor: rgba(rvb, 0.28), background: 'rgba(33,28,22,.55)' }}>{detailNode}</div>}
    </div>
  )
  const corpsMaison = (Icone: LucideIcon, couleur: string, titre: string, montant: number, droite?: ReactNode, ratio: number | null = null) => (
    <>
      <Anneau sansTrace={ratio === null} ratio={ratio} couleur={couleur} taille={bureau ? 36 : 38} trait={bureau ? 2 : 3} halo={bureau}>
        <Icone size={bureau ? 15 : 16} style={{ color: couleur }} strokeWidth={1.8} aria-hidden />
      </Anneau>
      <p className={`min-w-0 flex-1 truncate font-semibold text-ink-2 ${bureau ? 'text-[15px]' : 'text-[13px]'}`}>{titre}</p>
      {droite ?? (
        <div className="shrink-0 text-right">
          <p className="mb-1 text-[10px] font-semibold leading-none tracking-[.06em] text-ink-3">Épargné</p>
          <b className={`block font-bold leading-none tabular-nums ${bureau ? 'text-[22px]' : 'text-[20px]'}`} style={{ color: couleur }}>{euros(montant)}</b>
        </div>
      )}
    </>
  )
  const detailEpDep = (
    <div data-testid="detail-epargne-depenses" className="card mx-auto w-full max-w-md space-y-1 px-4 py-3 text-sm">
      {epDep.virements.length === 0 && <p className="text-ink-3">Aucun virement ce mois-ci.</p>}
      {epDep.virements.map((v) => (
        <div key={v.id} className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-ink-2">{v.date.slice(8, 10)}/{v.date.slice(5, 7)} · {v.libelle}</span>
          <span className="shrink-0 tabular-nums">{euros(v.montant)}</span>
        </div>
      ))}
      <div className="mt-1 flex items-center justify-between gap-3 border-t border-line/40 pt-1.5">
        <span className="text-ink-3">Reste sur le compte {epDep.compte ? 'Epargne Dépenses' : ''}</span>
        <b data-testid="solde-epargne-depenses" className="tabular-nums">{epDep.solde === null ? '—' : euros(epDep.solde)}</b>
      </div>
    </div>
  )
  const ligneEpDep = ligneMaison('epargne-depenses', [237, 161, 69], corpsMaison(PiggyBank, COULEUR_UTILISEE, 'Épargne Dépenses', epDep.total),
    detail === 'epdep', () => setDetail(detail === 'epdep' ? null : 'epdep'), detailEpDep)
  const loupeBtn = (
    <button type="button" data-testid="tuile-loupe" aria-label="Dernières opérations" onClick={() => setRecents(true)}
      className={`${bureau ? 'verre verre-tuile !px-0' : 'card'} flex items-center justify-center text-ink-2 hover:text-ink`}>
      <Search size={bureau ? 18 : 16} strokeWidth={2} />
    </button>
  )
  const colonnes = 'grid-cols-4'
  const salaireTuile = salaireOuverture ?? (prevues ? Math.round(prevues.montant / 100) * 100 : null)
  const salaireBtn = (
    <div data-testid="tuile-salaire" className={`${bureau ? 'verre verre-tuile !py-2' : 'card px-2 py-2'} min-w-0 text-left`}>
      <p className="block-title overflow-hidden text-ellipsis whitespace-nowrap max-md:!tracking-[.04em]">Salaire</p>
      <p data-testid="montant-salaire" className={`truncate font-bold tabular-nums ${bureau ? 'text-[20px] leading-tight' : 'text-[15px] leading-tight'}`} style={{ color: COULEURS_ANNEAU.ok }}>{salaireTuile === null ? '—' : euros(salaireTuile)}</p>
    </div>
  )
  const hautDeVue = (
    <div className={`grid gap-2.5 ${bureau ? 'gap-3' : ''} ${colonnes}`}>
      {resteBtn}
      {loupeBtn}
      <button type="button" data-testid="soldes-comptes" aria-expanded={detail === 'soldes'} onClick={() => setDetail(detail === 'soldes' ? null : 'soldes')}
        title="Voir le solde de chaque compte"
        className={`${bureau ? 'verre verre-tuile !py-2' : 'card px-2 py-2'} min-w-0 text-left`}>
        <p className="block-title flex items-center gap-1.5 overflow-hidden whitespace-nowrap max-md:!tracking-[.04em]">Comptes
          <span className="flex -space-x-1 max-md:hidden">{soldes.comptes.map((a) => <IconeDeCompte key={a.id} compte={a} taille={12} />)}</span>
        </p>
        <p className={`truncate font-bold tabular-nums ${bureau ? 'text-[20px] leading-tight' : 'text-[15px] leading-tight'}`} style={soldes.total < 0 ? { color: COULEURS_ANNEAU.depasse } : undefined}>{euros(soldes.total)}</p>
      </button>
      {salaireBtn}
      {detail === 'soldes' && <div className="col-span-full flex justify-center"><PanneauSoldes soldes={soldes} /></div>}
      {detail === 'reste' && resteTuile !== null && (
        <div className="col-span-full flex justify-center">
          <DetailAuDela lignes={lignesAuDela(depenses, aVenir, epPrevues)} variante={varianteDemo()} />
        </div>
      )}
    </div>
  )
  const noteFiltre = !foyer && <p className="-mt-1 text-[11px] text-ink-3">Les budgets sont ceux du foyer : ici, ce que {filtre === 'commun' ? 'le compte commun' : filtre === 'joffrey' ? 'Joffrey' : 'Honorine'} a dépensé. Choisis Foyer pour voir le restant.</p>
  const vide = <p className="py-4 text-center text-sm text-ink-3">Aucune ligne Courses, Aménagement, Vacances, Dons… trouvée dans ton budget.</p>
  const entete = (
    <header className="relative flex items-center justify-between gap-1 text-[13px] sm:gap-3 md:grid md:grid-cols-[1fr_auto_1fr] [&_button]:!py-0.5 [&_svg]:!h-3.5 [&_svg]:!w-3.5">
      <div className="md:justify-self-start"><NavMois mois={mois} onChange={setMois} /></div>
      <span className="max-md:hidden" />
      <div className="md:justify-self-end"><FiltreSeg value={filtre} onChange={setFiltre} /></div>
    </header>
  )
  // Ordre : Salaire, écart, Frais fixe + Épargné, écart, les autres budgets (Dons encore à part). Écarts = celui avant Dons.
  const groupes = (rendu: (t: TuileBudget) => ReactNode): ReactNode[][] => {
    const par = (cle: string) => tuiles.find((t) => t.cle === cle)
    const ff = par('fraisfixe'), courses = par('courses'), vac = par('vacances')
    // Frais fixe compte aussi Courses et Vacances (total et anneau).
    const ffTot = ff && (() => {
      const lst = [ff, courses, vac].filter(Boolean) as TuileBudget[]
      const depense = lst.reduce((n, t) => n + t.depense, 0) - epDep.totalDebits
      const budget = lst.some((t) => t.budget !== null) ? lst.reduce((n, t) => n + (t.budget ?? 0), 0) : null
      const ratio = budget ? Math.max(0, depense) / budget : null
      return { ...ff, depense, budget, restant: budget !== null ? budget - depense : null, ratio, ton: ratio === null ? ff.ton : ratio > 1 ? 'depasse' : ratio >= 0.75 ? 'attention' : 'ok' } as TuileBudget
    })()
    const vert = COULEURS_ANNEAU.ok
    const vacRvb = vac?.rvb ?? [139, 92, 246]
    const deuxCol = vac && (
      <div className="flex shrink-0 gap-4 text-right">
        <div><p className="mb-1 text-[10px] font-semibold leading-none tracking-[.06em] text-ink-3">Épargne</p>
          <b data-testid="col-epargne-vacances" className={`block font-bold leading-none tabular-nums ${bureau ? 'text-[19px]' : 'text-[16px]'}`} style={{ color: vert }}>{euros(epVac.total)}</b></div>
        <div><p className="mb-1 text-[10px] font-semibold leading-none tracking-[.06em] text-ink-3">Dépenses</p>
          <b className={`block font-bold leading-none tabular-nums ${bureau ? 'text-[19px]' : 'text-[16px]'}`}>{euros(vac.depense)}</b></div>
      </div>
    )
    const ligneVac = vac && ligneMaison('vacances', vacRvb, corpsMaison(Plane, eclaircie(vacRvb, 0.24), 'Vacances', 0, deuxCol, Math.max(0, vac.depense) / CIBLE_VACANCES), ouvertes.has('vacances'), () => basculerTuile('vacances'),
      vac.ligneId ? <div className="w-full px-2"><DetailLigneLecture cle={vac.ligneId} couleur={eclaircie(vacRvb, 0.24)} /></div> : null)
    const bloc1: ReactNode[] = [ffTot && rendu(ffTot), ligneEpargne, ligneEpDep, ligneVac, courses && rendu(courses)]
    const ordre2 = ['courantes', 'exceptionnelles', 'amenagement'].map(par).filter(Boolean) as TuileBudget[]
    const apart = tuiles.filter((t) => t.separe)
    // Ligne « Reste » en tête du bloc des dépenses de vie : même valeur que la tuile Reste, verte si positive, ambre sinon.
    const ligneReste = ordre2.length > 0 && resteTuile !== null && ligneMaison('reste', [76, 199, 154],
      corpsMaison(Wallet, COULEURS_ANNEAU.ok, 'Reste', 0,
        <div className="shrink-0 text-right"><p className="mb-1 text-[10px] font-semibold leading-none tracking-[.06em] text-ink-3">Reste</p>
          <b data-testid="montant-ligne-reste" className={`block font-bold leading-none tabular-nums ${bureau ? 'text-[22px]' : 'text-[20px]'}`} style={{ color: resteTuile < 0 ? AMBRE : COULEURS_ANNEAU.ok }}>{euros(resteTuile)}</b></div>),
      detail === 'reste', () => setDetail(detail === 'reste' ? null : 'reste'), null)
    return [bloc1.filter(Boolean), apart.map(rendu), [ligneReste, ...ordre2.map(rendu)].filter(Boolean)].filter((g) => g.length)
  }
  // Mois sans objectif : total du dépensé en bas des lignes (l'épargne n'est pas une dépense : exclue).
  const totalDepense = tuiles.reduce((n, t) => n + t.depense, 0)
  const ligneTotal = estMoisSansObjectif(mois) && (
    <div data-testid="total-depense" className={`flex items-center justify-between ${bureau ? 'px-0 pt-1' : 'px-3 pt-1.5'}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[.06em] text-ink-3">Total dépensé</span>
      <b className={`font-bold tabular-nums ${bureau ? 'text-[22px]' : 'text-[20px]'}`}>{euros(totalDepense)}</b>
    </div>
  )
  const basculer = (t: TuileBudget) => ({ t, edition, ouvert: ouvertes.has(t.cle), onBasculer: () => basculerTuile(t.cle), exclureFF: epDep.idsDebits })

  if (bureau) {
    return (
      <div className="rise space-y-2">
        {edition.dialogue}
        {recents && <DernieresOperations bureau onClose={() => setRecents(false)} />}
        {entete}
        <div className="mx-auto w-full max-w-[660px] space-y-2.5">
          {hautDeVue}
          {noteFiltre}
          {tuiles.length ? (
            <>
              {groupes((t) => <LigneVerre key={t.cle} {...basculer(t)} />).map((g, i) => (
                <div key={i} data-testid={`bloc-${i + 1}`} className={`verre verre-panneau !py-0.5 ${i ? '!mt-3 [@media(min-height:840px)]:!mt-5' : ''}`}>{g}</div>
              ))}
              {ligneTotal}
            </>
          ) : vide}
        </div>
      </div>
    )
  }

  return (
    <div className="rise space-y-2">
      {edition.dialogue}
      {recents && <DernieresOperations bureau={false} onClose={() => setRecents(false)} />}
      {entete}
      {hautDeVue}
      {noteFiltre}
      {tuiles.length ? (
        <div className="space-y-3">
          {groupes((t) => <TuileBudgetAnneau key={t.cle} {...basculer(t)} />).map((g, i) => (
            <div key={i} data-testid={`bloc-${i + 1}`} className="bloc-lignes divide-y divide-white/[.07] overflow-hidden rounded-[14px] border border-white/[.09] bg-[#15110e]">{g}</div>
          ))}
          {ligneTotal}
        </div>
      ) : vide}
    </div>
  )
}
