import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Heart, PiggyBank, Receipt, Search, Plane, ShoppingCart, Sofa, Wallet, Zap, type LucideIcon } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { entreesPrevues, euros } from '../../lib/finances'
import { COULEURS_ANNEAU, eclaircie, rgba, tuilesBudgets, type TuileBudget } from '../../lib/resume'
import { EmptyState } from '../../components/ui'
import { FiltreSeg, NavMois } from './partage'
import { DetailEpargne, DetailEpargneUtilisee } from './DetailsTuiles'
import { epargneUtilisee, ORIGINE_EPARGNE_DEPENSES } from '../../lib/epargneUtilisee'
import { epargneDepenses, epargneVacances, estCompteEpargneDepenses } from '../../lib/regroupement'
import { decaleMois } from '../../lib/finances'
import { partiesEpargne, soldesComptes } from '../../lib/soldes'
import { FenetreSoldes } from './SoldesComptes'
import { IconeDeCompte } from './IconeCompte'
import { useTuilesMois } from './tuilesMois'
import { moisCourant, useFin, useIndex, useTransactionsBudget } from './contexte'
import { estMoisSansObjectif, LIGNE_AVEC_ANNEAU } from '../../lib/moisSansObjectif'
import { MontantBudget, useBudgetMois } from './budgetMois'
import { DetailLigneLecture, type ApportLigne } from './DetailLigne'
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
/** Ambre : seulement le second Reste, quand il est négatif. */
const AMBRE = '#eda145'

/** Largeur d'une colonne de montant : la principale (Dépensé « / budget ») est plus large que celles de droite. */
const largeurCol = (bureau: boolean, principal?: boolean) => bureau ? (principal ? 'w-32' : 'w-24') : (principal ? 'w-[5.25rem]' : 'w-14')

/** Colonne de montant : intitulé facultatif au-dessus (« Dépensé » est en tête de colonne, une seule fois), montant et, petit et gris
 *  sur la même ligne, « / budget ». Mêmes largeurs partout : les montants s'alignent. */
function ColMontant({ titre, montant, budget, bureau, italique, couleur, test, infobulle, titreLong, principal }: {
  titre?: string; montant: number; budget?: ReactNode; bureau: boolean; italique?: boolean; couleur?: string; test?: string; infobulle?: string; titreLong?: string; principal?: boolean
}) {
  return (
    <div className={`relative shrink-0 text-center ${largeurCol(bureau, principal)}`}>
      {titre && <p title={titreLong} className="absolute inset-x-0 -top-[10px] whitespace-nowrap text-[10px] font-semibold leading-[10px] tracking-[.04em] text-ink-3">{titre}</p>}
      <p className="whitespace-nowrap leading-none">
        <b data-testid={test} title={infobulle} className={`font-bold tabular-nums ${italique ? 'italic' : ''} ${bureau ? 'text-[18px]' : 'text-[16px]'}`}
          style={{ color: couleur ?? 'var(--color-ink)' }}>{euros(montant)}</b>
        {budget ? <small className="ml-1 text-[9.5px] font-normal tabular-nums text-ink-3">/ {budget}</small> : null}
      </p>
    </div>
  )
}
const ColVide = ({ bureau, principal }: { bureau: boolean; principal?: boolean }) => <div aria-hidden className={`shrink-0 ${largeurCol(bureau, principal)}`} />

function CorpsTuile({ t, edition, bureau, apport, prevu }: { t: TuileBudget; edition: ReturnType<typeof useBudgetMois>; bureau: boolean; apport?: ApportLigne; prevu?: number }) {
  const Icone = ICONES[t.cle] ?? Wallet
  const depasse = t.ton === 'depasse'
  const clair = eclaircie(t.rvb, 0.24)
  const ouvrir = edition.peutModifier && t.ligneId ? () => edition.ouvrir({ id: t.ligneId!, name: t.titre }, t.budget) : undefined
  const { mois } = useFin()
  // Mois sans objectif : seulement le dépensé ; Frais fixe garde son anneau, les autres n'en ont pas.
  const cible = t.cle === 'courses' ? CIBLE_COURSES : null
  const sansObjectif = estMoisSansObjectif(mois) || cible !== null
  const sansAnneau = sansObjectif && t.cle !== LIGNE_AVEC_ANNEAU && cible === null
  // Mois à venir : ce qui doit encore partir (frais fixes réguliers, courses) est ajouté en italique tant que les comptes ne l'ont pas montré.
  const dep = t.depense + (prevu ?? 0)
  const restant = t.restant === null ? null : t.restant - (prevu ?? 0)
  // Mois à venir : jamais de « Reste » dans la colonne de droite, seulement ce qui est (ou sera) dépensé.
  const soloDepense = sansObjectif || mois > moisCourant()
  const negatif = !soloDepense && restant !== null && restant < 0
  return (
    <>
      <Anneau sansTrace={sansAnneau} ratio={sansAnneau ? null : cible ? Math.max(0, dep) / cible : prevu && t.budget ? dep / t.budget : t.ratio} couleur={depasse && !cible ? COULEURS_ANNEAU.depasse : clair} taille={bureau ? 28 : 28} trait={bureau ? 2 : 3} halo={bureau}>
        <Icone size={bureau ? 12 : 14} color={clair} strokeWidth={1.8} />
      </Anneau>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <p className={`font-semibold leading-tight text-ink-2 ${bureau ? 'truncate text-[14px]' : 'line-clamp-2 text-[12px]'}`}>{t.titre}</p>
      </div>
      {/* Dépensé (avec « / budget » en gris) à gauche, à droite de l'intitulé ; l'épargne utilisée dans la colonne de droite. */}
      <div className="flex shrink-0 gap-1">
        <ColMontant principal montant={dep} bureau={bureau} italique={!!prevu} couleur={negatif ? COULEURS_ANNEAU.depasse : undefined}
          infobulle={prevu ? 'Prévu : pas encore passé sur les comptes' : undefined}
          budget={t.budget !== null && t.budget > 0
            ? <MontantBudget montant={t.budget} ajustement={edition.ajustement(t.ligneId)} onOuvrir={ouvrir} discret pointille />
            : cible !== null ? euros(cible) : ouvrir ? <button type="button" onClick={ouvrir} data-testid="budget-fixer" className="text-sun-soft/80 underline decoration-dotted underline-offset-2">fixer</button> : null} />
        {t.cle === 'exceptionnelles' && apport
          ? <ColMontant titre="Utilisée" titreLong="Épargne utilisée (prise sur Épargne Dépenses)" test="col-epargne-dep" montant={apport.lignes.reduce((n, l) => n + l.montant, 0)} bureau={bureau} couleur={AMBRE} />
          : <ColVide bureau={bureau} />}
        <ColVide bureau={bureau} />
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
function TuileBudgetAnneau({ t, edition, ouvert, onBasculer, exclureFF, apport, prevu }: {
  exclureFF?: Set<string>; apport?: ApportLigne; prevu?: number; t: TuileBudget; edition: ReturnType<typeof useBudgetMois>; ouvert: boolean; onBasculer: () => void
}) {
  const clair = eclaircie(t.rvb, 0.24)
  const alpha = t.separe ? [0.1, 0.03] : [0.24, 0.06]
  const depliable = t.ligneId !== null
  return (
    <div data-testid={`tuile-${t.cle}`} data-ton={t.ton} data-ouvert={ouvert || undefined} className="flex flex-1 flex-col">
      <div {...enTete(depliable, ouvert, onBasculer)}
        className={`flex min-h-[40px] flex-1 items-center gap-2 border px-3 py-1 md:gap-3 ${depliable ? 'cursor-pointer' : ''} ${ouvert ? 'rounded-t-[14px] border-b-transparent' : 'rounded-[14px]'}`}
        style={{ background: `linear-gradient(100deg, ${rgba(t.rvb, alpha[0]!)}, ${rgba(t.rvb, alpha[1]!)} 80%), #15110e`, borderColor: rgba(t.rvb, 0.28) }}>
        <CorpsTuile t={t} edition={edition} bureau={false} apport={apport} prevu={prevu} />
      </div>
      {ouvert && t.ligneId && (
        <div className={`${t.cle === 'fraisfixe' || t.cle === 'courses' || t.cle === 'amenagement' || t.cle === 'exceptionnelles' ? '' : 'max-h-[45dvh] overflow-y-auto'} rounded-b-[14px] border border-t-0 px-3 py-0.5`} style={{ borderColor: rgba(t.rvb, 0.28), background: 'rgba(33,28,22,.55)' }}>
          <DetailLigneLecture cle={t.ligneId} couleur={clair} deplie={t.cle === 'courses' || t.cle === 'amenagement' || t.cle === 'exceptionnelles'} aplat={t.cle === 'fraisfixe'} exclure={t.cle === 'fraisfixe' ? exclureFF : undefined} apport={apport} />
        </div>
      )}
    </div>
  )
}

/**
 * Bureau : ligne posée dans un panneau de verre, presque transparente, séparée de la précédente par un filet.
 * Le clic la déplie (détail par catégorie).
 */
function LigneVerre({ t, edition, ouvert, onBasculer, exclureFF, apport, prevu }: {
  exclureFF?: Set<string>; apport?: ApportLigne; prevu?: number; t: TuileBudget; edition: ReturnType<typeof useBudgetMois>; ouvert: boolean; onBasculer: () => void
}) {
  const clair = eclaircie(t.rvb, 0.24)
  const depliable = t.ligneId !== null
  return (
    <div data-testid={`tuile-${t.cle}`} data-ton={t.ton} data-ouvert={ouvert || undefined} className="border-t border-white/[.09] first:border-t-0">
      <div {...enTete(depliable, ouvert, onBasculer)} className={`flex h-[38px] items-center gap-3 ${depliable ? 'cursor-pointer' : ''}`}>
        <CorpsTuile t={t} edition={edition} bureau apport={apport} prevu={prevu} />
      </div>
      {ouvert && t.ligneId && (
        <div className={`${t.cle === 'fraisfixe' || t.cle === 'courses' || t.cle === 'amenagement' || t.cle === 'exceptionnelles' ? '' : 'max-h-[45dvh] overflow-y-auto'} pb-2`}><DetailLigneLecture cle={t.ligneId} couleur={clair} deplie={t.cle === 'courses' || t.cle === 'amenagement' || t.cle === 'exceptionnelles'} aplat={t.cle === 'fraisfixe'} exclure={t.cle === 'fraisfixe' ? exclureFF : undefined} apport={apport} /></div>
      )}
    </div>
  )
}

/**
 * Résumé : l'accueil de l'onglet Finances. Reste et Épargné du mois, puis une tuile à anneau
 * par budget du foyer (Courses, Aménagement, Vacances, Dépenses courantes, exceptionnelles, puis Dons à part).
 * Suit le mois et le filtre Foyer / Commun / Joffrey / Honorine, comme le Budget.
 */
export function ResumeView() {
  const { mois, setMois, filtre, setFiltre, barreHaute } = useFin()
  const lines = useHorizon((s) => s.finLines)
  const foyer = filtre === 'foyer'
  const [recents, setRecents] = useState(false)
  const [detail, setDetail] = useState<'reste' | 'epargne' | 'utilisee' | 'soldes' | 'epvac' | null>(null)
  // Tuiles de budget dépliées (détail par catégorie).
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set())
  const [totalOuvert, setTotalOuvert] = useState(false)
  const basculerTuile = (cle: string) => setOuvertes((o) => { const n = new Set(o); if (n.has(cle)) n.delete(cle); else n.add(cle); return n })

  // Mêmes chiffres que le Budget : un seul calcul (tuilesMois.ts), capital de prêt compté en épargne et non en dépense.
  const { s, listeEp, epargne, budgetDepenses, epargnes, capitalMois } = useTuilesMois()
  // Budget de la tuile du haut : budgets des dépenses + budgets d'épargne comptés (Épargne avenir…, pas Épargne vacances).
  // Épargne exceptionnelle du mois (Matelas sécurité) : affichée à part, « 800 + le reste habituel » (PER, capital des prêts…).
  const exceptionnelle = epargnes.filter((l) => /matelas/i.test(l.ligne?.name ?? '')).reduce((n, l) => n + l.reel, 0)
  const budgetTuile = budgetDepenses + epargnes.reduce((n, l) => n + (l.budget ?? 0), 0)
  const edition = useBudgetMois()
  const transactions = useTransactionsBudget()
  const comptes = useHorizon((st) => st.finAccounts)
  const soldes = useMemo(() => soldesComptes(comptes, filtre), [comptes, filtre])
  const epargnesComptes = useMemo(() => partiesEpargne(comptes, filtre), [comptes, filtre])
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
  // Mois à venir (après le mois courant) : dépenses prévisibles montrées en italique tant qu'elles ne sont pas sur les comptes.
  // Frais fixe : les charges régulières pas encore passées ; Courses 750 € et Vacances 700 € (cibles) si rien n'est encore dépensé.
  const futur = mois > moisCourant()

  // Bureau (≥ md, là où la barre latérale est affichée) : panneaux de verre ; téléphone : tuiles teintées.
  const bureau = useMediaQuery('(min-width: 768px)')
  const tuiles = useMemo(() => tuilesBudgets(s.lignes).filter((t) => !t.absente), [s.lignes])
  const tVac = tuiles.find((t) => t.cle === 'vacances'), tCourses = tuiles.find((t) => t.cle === 'courses'), tFF = tuiles.find((t) => t.cle === 'fraisfixe')
  // Mois à venir : chaque ligne vaut son budget (en italique) tant que les comptes n'ont pas montré plus ; au-delà, le réel, en normal.
  const complement = (budget: number | null | undefined, reel: number) => futur && foyer ? Math.max(0, (budget ?? 0) - reel) : 0
  const prevuFraisFixe = tFF ? complement(tFF.budget, tFF.depense) : 0
  const prevuVac = tVac ? complement(tVac.budget && tVac.budget > 0 ? tVac.budget : CIBLE_VACANCES, tVac.depense + epVac.total) : 0
  const prevuCourses = tCourses ? complement(CIBLE_COURSES, tCourses.depense) : 0
  // Épargne Avenir : budget d'épargne (PER, capital de Reims…) complété jusqu'à son budget ; le capital Lille (hors budget) s'y ajoute
  // à l'affichage seulement, il n'entre jamais dans le Reste.
  const capitalHorsBudget = (capitalMois?.prets ?? []).filter((p) => p.horsBudget && p.etat === 'fait').reduce((n, p) => n + p.extrait, 0)
  const budgetEpargne = epargnes.reduce((n, l) => n + (l.budget ?? 0), 0) - epargnes.filter((l) => /matelas/i.test(l.ligne?.name ?? '')).reduce((n, l) => n + (l.budget ?? 0), 0)
  const prevuEpargneHabituelle = complement(budgetEpargne, epargne - exceptionnelle - capitalHorsBudget)
  const lillePrevu = (capitalMois?.prets ?? []).filter((p) => p.horsBudget && p.etat === 'prevu').reduce((n, p) => n + p.prevu, 0)
  const prevuEpargne = prevuEpargneHabituelle + lillePrevu
  // Épargne habituelle affichée (et retirée du Reste) : arrondie à l'euro. Capital Airbnb = capital Lille, fait ou prévu.
  const epHabAffichee = Math.round(epargne - exceptionnelle - capitalHorsBudget + prevuEpargneHabituelle)
  const capitalAirbnb = (capitalMois?.prets ?? []).filter((p) => p.horsBudget).reduce((n, p) => n + (p.etat === 'fait' ? p.extrait : p.prevu), 0)

  // Sous-catégorie « Épargne Dépenses » de Dépenses exceptionnelles : ce qui est venu de ce compte (téléphone, achat vêtements…),
  // montré seulement (le total de la ligne ne change pas) ; au survol, ce qu'il reste sur le compte.
  const apportEp = useMemo(() => {
    const compteEp = comptes.find(estCompteEpargneDepenses)
    const lignes = utilisee.virements.filter((v) => v.origine === ORIGINE_EPARGNE_DEPENSES || v.origine === compteEp?.name)
    return lignes.length ? {
      titre: 'Épargne Dépenses',
      infobulle: epDep.solde === null ? 'Virements reçus depuis le compte Épargne Dépenses' : `Reste sur le compte Épargne Dépenses : ${euros(epDep.solde)}`,
      lignes,
    } : undefined
  }, [utilisee, comptes, epDep.solde])
  if (!lines.length) {
    return <EmptyState hint="Crée tes lignes (Frais fixe, Courses…) dans Réglages.">Aucune ligne de budget pour l’instant.</EmptyState>
  }

  const basculerEpargne = () => setDetail(detail === 'epargne' ? null : 'epargne')
  // Ligne Épargné : posée sous Frais fixe, comme une ligne de budget (montant épargné, anneau à 1 800 €, « Utilisée − x € »).
  const ratioEp = Math.min(1, Math.max(0, epargne + prevuEpargne) / CIBLE_EPARGNE)
  const corpsEpargne = (
    <>
      <span data-testid="anneau-epargne" data-ratio={Math.round(ratioEp * 100)} className="inline-flex">
        <Anneau ratio={ratioEp} couleur={COULEURS_ANNEAU.ok} taille={bureau ? 28 : 28} trait={bureau ? 2 : 3} halo={bureau}>
          <PiggyBank size={bureau ? 12 : 14} style={{ color: COULEURS_ANNEAU.ok }} strokeWidth={1.8} aria-hidden />
        </Anneau>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <p className={`font-semibold leading-tight text-ink-2 ${bureau ? 'truncate text-[14px]' : 'line-clamp-2 text-[12px]'}`}>Épargne Avenir</p>
      </div>
      {/* Airbnb (capital remboursé de l'appart Lille, hors budget) puis l'épargne habituelle (PER, capital de Reims), arrondie à l'euro,
          avec son « / budget » ; à droite, le bonus salaire (épargne exceptionnelle, ex. Matelas sécurité). Mêmes colonnes que les autres lignes. */}
      <div className="flex shrink-0 gap-1">
        <ColMontant principal titre="Épargné" test="epargne-habituelle" montant={epHabAffichee} bureau={bureau} italique={prevuEpargneHabituelle > 0.5} couleur={COULEURS_ANNEAU.ok}
          budget={budgetEpargne > 0.5 ? euros(budgetEpargne) : undefined} infobulle={prevuEpargneHabituelle > 0.5 ? 'Prévu : pas encore passé sur les comptes' : undefined} />
        {exceptionnelle > 0.5
          ? <ColMontant titre="Bonus" titreLong="Bonus salaire" test="bonus-salaire" montant={exceptionnelle} bureau={bureau} couleur={COULEURS_ANNEAU.ok} />
          : <ColVide bureau={bureau} />}
        {capitalAirbnb > 0.5
          ? <ColMontant titre="Airbnb" test="capital-airbnb" montant={capitalAirbnb} bureau={bureau} italique={lillePrevu > 0.5} couleur={COULEURS_ANNEAU.ok} />
          : <ColVide bureau={bureau} />}
      </div>
    </>
  )
  const detailEpargne = detail === 'epargne' ? <DetailEpargne liste={listeEp} /> : detail === 'utilisee' ? <DetailEpargneUtilisee donnees={utilisee} /> : null
  const ouvertEp = detail === 'epargne' || detail === 'utilisee'
  const ligneEpargne = bureau ? (
    <div key="epargne" data-testid="tuile-epargne" data-ouvert={ouvertEp || undefined} className="border-t border-white/[.09] first:border-t-0">
      <div {...enTete(true, detail === 'epargne', basculerEpargne)} title="Voir les épargnes du mois" className="flex h-[38px] cursor-pointer items-center gap-3">{corpsEpargne}</div>
      {detailEpargne && <div className="flex justify-center pb-2">{detailEpargne}</div>}
    </div>
  ) : (
    <div key="epargne" data-testid="tuile-epargne" data-ouvert={ouvertEp || undefined} className="flex flex-1 flex-col">
      <div {...enTete(true, detail === 'epargne', basculerEpargne)} title="Voir les épargnes du mois"
        className={`flex min-h-[40px] flex-1 cursor-pointer items-center gap-2 border px-3 py-1 md:gap-3 ${detailEpargne ? 'rounded-t-[14px] border-b-transparent' : 'rounded-[14px]'}`}
        style={{ background: 'linear-gradient(100deg, rgba(110,190,120,.2), rgba(110,190,120,.05) 80%), #15110e', borderColor: 'rgba(110,190,120,.28)' }}>
        {corpsEpargne}
      </div>
      {detailEpargne && <div className="flex justify-center rounded-b-[14px] border border-t-0 px-1 py-1" style={{ borderColor: 'rgba(110,190,120,.28)', background: 'rgba(33,28,22,.55)' }}>{detailEpargne}</div>}
    </div>
  )
  // Ligne Épargne Dépenses : virements vers le compte Epargne Dépenses ; le clic montre ce qui reste sur ce compte.
  const ligneMaison = (cle: string, rvb: [number, number, number], corps: ReactNode, ouvert: boolean, onBasculer: () => void, detailNode: ReactNode, sous?: ReactNode) => bureau ? (
    <div key={cle} data-testid={`tuile-${cle}`} data-ouvert={ouvert || undefined} className="border-t border-white/[.09] first:border-t-0">
      <div {...enTete(true, ouvert, onBasculer)} className="flex h-[38px] cursor-pointer items-center gap-3">{corps}</div>
      {sous && <div className="-mt-1.5 pb-1.5">{sous}</div>}
      {ouvert && detailNode && <div className="flex justify-center pb-2">{detailNode}</div>}
    </div>
  ) : (
    <div key={cle} data-testid={`tuile-${cle}`} data-ouvert={ouvert || undefined} className="flex flex-1 flex-col">
      <div className={`flex flex-1 flex-col border ${ouvert && detailNode ? 'rounded-t-[14px] border-b-transparent' : 'rounded-[14px]'}`}
        style={{ background: `linear-gradient(100deg, ${rgba(rvb, 0.2)}, ${rgba(rvb, 0.05)} 80%), #15110e`, borderColor: rgba(rvb, 0.28) }}>
        <div {...enTete(true, ouvert, onBasculer)} className="flex min-h-[40px] flex-1 cursor-pointer items-center gap-2 px-3 py-1 md:gap-3">{corps}</div>
        {sous && <div className="-mt-1 pb-1.5">{sous}</div>}
      </div>
      {ouvert && detailNode && <div className="flex justify-center rounded-b-[14px] border border-t-0 px-1 py-1" style={{ borderColor: rgba(rvb, 0.28), background: 'rgba(33,28,22,.55)' }}>{detailNode}</div>}
    </div>
  )
  const corpsMaison = (Icone: LucideIcon, couleur: string, titre: string, montant: number, droite?: ReactNode, ratio: number | null = null, couleurMontant?: string, etiquette = 'Épargné') => (
    <>
      <Anneau sansTrace={ratio === null} ratio={ratio} couleur={couleur} taille={bureau ? 28 : 28} trait={bureau ? 2 : 3} halo={bureau}>
        <Icone size={bureau ? 12 : 14} style={{ color: couleur }} strokeWidth={1.8} aria-hidden />
      </Anneau>
      <p className={`min-w-0 flex-1 font-semibold leading-tight text-ink-2 ${bureau ? 'truncate text-[14px]' : 'line-clamp-2 text-[12px]'}`}>{titre}</p>
      {droite ?? (
        <ColMontant titre={etiquette} montant={montant} bureau={bureau} couleur={couleurMontant ?? couleur} />
      )}
    </>
  )
  const loupeBtn = (
    <button type="button" data-testid="tuile-loupe" aria-label="Dernières opérations" onClick={() => setRecents(true)}
      className={`${bureau ? 'verre verre-tuile !px-0' : 'card'} flex items-center justify-center text-ink-2 hover:text-ink`}>
      <Search size={bureau ? 18 : 16} strokeWidth={2} />
    </button>
  )
  const colonnes = 'grid-cols-3'
  const salaireTuile = salaireOuverture ?? (prevues ? Math.round(prevues.montant / 100) * 100 : null)
  const salaireBtn = (
    <div data-testid="tuile-salaire" className={`${bureau ? 'verre verre-tuile !py-1' : 'card px-2 py-2'} min-w-0 text-left`}>
      <p className="block-title overflow-hidden text-ellipsis whitespace-nowrap max-md:!tracking-[.04em]">Budget</p>
      <p data-testid="montant-budget" className={`truncate font-bold tabular-nums ${bureau ? 'text-[17px] leading-tight' : 'text-[15px] leading-tight'}`} style={{ color: foyer && budgetTuile > 0 ? COULEURS_ANNEAU.ok : '#857c6d' }}>{foyer && budgetTuile > 0 ? euros(budgetTuile) : '—'}</p>
      <p data-testid="montant-salaire" className="truncate text-[10.5px] leading-snug text-ink-3">{salaireTuile === null ? ' ' : `Salaire ${euros(salaireTuile)}`}</p>
    </div>
  )
  const hautDeVue = (
    <div className={`grid gap-2.5 ${bureau ? 'gap-3' : ''} ${colonnes}`}>
      {loupeBtn}
      <button type="button" data-testid="soldes-comptes" aria-expanded={detail === 'soldes'} onClick={() => setDetail(detail === 'soldes' ? null : 'soldes')}
        title="Voir le solde de chaque compte"
        className={`${bureau ? 'verre verre-tuile !py-1' : 'card px-2 py-2'} min-w-0 text-left`}>
        <p className="block-title flex items-center gap-1.5 overflow-hidden whitespace-nowrap max-md:!tracking-[.04em]">Comptes
          <span className="flex -space-x-1 max-md:hidden">{soldes.comptes.map((a) => <IconeDeCompte key={a.id} compte={a} taille={12} />)}</span>
        </p>
        <p className={`truncate font-bold tabular-nums ${bureau ? 'text-[17px] leading-tight' : 'text-[15px] leading-tight'}`} style={soldes.total < 0 ? { color: COULEURS_ANNEAU.depasse } : undefined}>{euros(soldes.total)}</p>
      </button>
      {salaireBtn}
      {detail === 'soldes' && <FenetreSoldes soldes={soldes} epargnes={epargnesComptes} onClose={() => setDetail(null)} />}
    </div>
  )
  const noteFiltre = !foyer && <p className="-mt-1 text-[11px] text-ink-3">Les budgets sont ceux du foyer : ici, ce que {filtre === 'commun' ? 'le compte commun' : filtre === 'joffrey' ? 'Joffrey' : 'Honorine'} a dépensé. Choisis Foyer pour voir le restant.</p>
  const vide = <p className="py-4 text-center text-sm text-ink-3">Aucune ligne Courses, Aménagement, Vacances, Dons… trouvée dans ton budget.</p>
  const entete = barreHaute ? null : (
    <header className="relative flex items-center justify-between gap-1 text-[13px] sm:gap-3 md:grid md:grid-cols-[1fr_auto_1fr] [&_button]:!py-0.5 [&_svg]:!h-3.5 [&_svg]:!w-3.5">
      <div className="md:justify-self-start"><NavMois mois={mois} onChange={setMois} /></div>
      <span className="max-md:hidden" />
      <div className="md:justify-self-end"><FiltreSeg value={filtre} onChange={setFiltre} /></div>
    </header>
  )
  // Ordre : Salaire, écart, Frais fixe + Épargné, écart, les autres budgets (Dons encore à part). Écarts = celui avant Dons.
  const groupes = (rendu: (t: TuileBudget) => ReactNode): { noeuds: ReactNode[]; apres?: ReactNode }[] => {
    const par = (cle: string) => tuiles.find((t) => t.cle === cle)
    const ff = par('fraisfixe'), courses = par('courses'), vac = par('vacances')
    // Frais fixe seul : il compte aussi le versé sur l'épargne « dépenses annuelles » (200 €…). Courses et Vacances ont leur ligne.
    const ffTot = ff
    const vert = COULEURS_ANNEAU.ok
    const vacRvb = vac?.rvb ?? [139, 92, 246]
    const epVacAffiche = epVac.total + prevuVac
    const budgetVac = vac && (vac.budget ?? 0) > 0 ? vac.budget! : CIBLE_VACANCES
    const deuxCol = vac && (
      <div className="flex shrink-0 gap-1">
        <ColMontant principal montant={vac.depense} bureau={bureau} italique={futur && foyer && vac.depense < 0.5} budget={euros(budgetVac)} />
        <ColMontant titre="Épargne" titreLong="Épargne vacances" test="col-epargne-vacances" montant={epVacAffiche} bureau={bureau} italique={prevuVac > 0}
          couleur={epVacAffiche >= 100 ? vert : undefined} infobulle={prevuVac ? 'Prévu : pas encore passé sur les comptes' : undefined} />
        <ColVide bureau={bureau} />
      </div>
    )
    const ligneVac = vac && ligneMaison('vacances', vacRvb, corpsMaison(Plane, eclaircie(vacRvb, 0.24), 'Vacances', 0, deuxCol, Math.max(0, vac.depense) / CIBLE_VACANCES), ouvertes.has('vacances'), () => basculerTuile('vacances'),
      vac.ligneId ? <div className="w-full px-2"><DetailLigneLecture cle={vac.ligneId} couleur={eclaircie(vacRvb, 0.24)} /></div> : null)
    const enteteDepense = (
      <div key="entete-depense" aria-hidden className={`flex justify-end gap-1.5 text-[10px] font-semibold uppercase leading-none tracking-[.06em] text-ink-3 ${bureau ? 'pb-0.5 pt-1' : 'px-3 py-1'}`}>
        <span className={`text-center ${largeurCol(bureau, true)}`}>Dépensé</span><span className={largeurCol(bureau)} /><span className={largeurCol(bureau)} />
      </div>
    )
    const bloc1: ReactNode[] = [enteteDepense, ffTot && rendu(ffTot), ligneEpargne, ligneVac, courses && rendu(courses)]
    const ordre2 = ['courantes', 'exceptionnelles', 'amenagement'].map(par).filter(Boolean) as TuileBudget[]
    const apart = tuiles.filter((t) => t.separe)
    // Deux lignes « Reste » en texte simple : « Reste après frais fixes » part du budget et retire Frais fixe, l'Épargne Avenir
    // habituelle (sans le bonus salaire, ni le capital Lille hors budget) tout Vacances (épargne + dépenses) et Courses ;
    // puis sous Aménagement (ce premier reste − Dons, Dépenses courantes, exceptionnelles, Aménagement, + ce qui est venu d'Épargne Dépenses).
    const montant = (t?: TuileBudget) => t?.depense ?? 0
    const bloc3 = [...apart, ...ordre2]
    const reste1 = !foyer || budgetTuile <= 0 ? null
      : budgetTuile - (montant(ffTot) + prevuFraisFixe + epHabAffichee + montant(vac) + epVac.total + prevuVac + montant(courses) + prevuCourses)
    // Ce qui est venu d'Épargne Dépenses (colonne « Épargne dép » de Dépenses exceptionnelles) est déduit des dépenses retranchées :
    // une dépense payée par cette épargne ne pèse pas sur le Reste du salaire.
    const apportTotal = apportEp ? apportEp.lignes.reduce((n, l) => n + l.montant, 0) : 0
    const reste2 = reste1 === null ? null : reste1 - bloc3.reduce((n, t) => n + t.depense, 0) + apportTotal
    const texteReste = (id: string, v: number | null, ambreSiNegatif = false, titre = 'Reste', calcul?: [string, number][]) => v !== null && (
      <div data-testid={id} className={`group relative flex items-center justify-between ${bureau ? 'px-0 pt-1' : 'px-3 pt-1.5'}`}>
        <span className="text-[11px] font-semibold uppercase tracking-[.06em] text-ink-3">{titre}</span>
        <b className={`font-bold tabular-nums text-[15px] ${futur ? 'italic' : ''}`} style={{ color: v >= 0 ? COULEURS_ANNEAU.ok : ambreSiNegatif ? AMBRE : 'var(--color-ink)' }}>{euros(v)}</b>
        {calcul && (
          <div role="tooltip" data-testid={`${id}-calcul`} className="pointer-events-none absolute right-0 top-full z-50 mt-1 hidden w-64 space-y-0.5 rounded-xl border border-line-2 bg-[#1b1611] px-3 py-2 text-[12px] shadow-xl shadow-black/60 group-hover:block">
            {calcul.map(([nom, m]) => (
              <div key={nom} className="flex justify-between gap-3 text-ink-2"><span>{nom}</span><span className="tabular-nums">{m >= 0 ? '−' : '+'} {euros(Math.abs(m))}</span></div>
            ))}
            <div className="mt-1 flex justify-between gap-3 border-t border-line/60 pt-1 font-semibold"><span>Reste</span><span className="tabular-nums">{euros(v)}</span></div>
          </div>
        )}
      </div>
    )
    const calculReste1: [string, number][] = [
      ['Frais fixe', montant(ffTot) + prevuFraisFixe], ['Épargne Avenir', epHabAffichee],
      ['Vacances', montant(vac) + epVac.total + prevuVac], ['Courses', montant(courses) + prevuCourses],
    ]
    return [
      { noeuds: bloc1.filter(Boolean), apres: texteReste('reste-apres-vacances', reste1, false, 'Reste après frais fixes', [['Budget', -budgetTuile], ...calculReste1]) },
      { noeuds: bloc3.map(rendu), apres: texteReste('reste-apres-amenagement', reste2, true) },
    ].filter((g) => g.noeuds.length)
  }
  // Total dépensé (mois sans objectif) : les lignes dans l'ordre du Résumé, Épargne Avenir comprise ; l'épargne utilisée n'y est pas comptée.
  // Le capital d'un prêt payé hors budget (Lille) compte dans l'Épargné affiché, mais pas dans ce total.
  const ORDRE_RESUME = ['fraisfixe', 'epargne', 'vacances', 'courses']
  const ordreLigne = (cle: string, separe?: boolean) => {
    const i = ORDRE_RESUME.indexOf(cle)
    if (i >= 0) return i
    if (separe) return 4
    const j = ['courantes', 'exceptionnelles', 'amenagement'].indexOf(cle)
    return j >= 0 ? 5 + j : 9
  }
  const lignesTotal = ([
    ...tuiles.map((t) => ({ cle: t.cle, nom: t.titre, montant: t.depense, separe: t.separe })),
    { cle: 'epargne', nom: 'Épargne Avenir', montant: epargne - capitalHorsBudget, separe: false },
  ] as { cle: string; nom: string; montant: number; separe?: boolean }[]).filter((l) => Math.abs(l.montant) >= 0.005).sort((x, y) => ordreLigne(x.cle, x.separe) - ordreLigne(y.cle, y.separe))
  const totalDepense = lignesTotal.reduce((n, l) => n + l.montant, 0)
  const syntheseTotal: { nom: string; montant: number; fort?: boolean }[] = [
    ...lignesTotal.map((l) => ({ nom: l.nom, montant: l.montant })),
    { nom: 'Total dépensé', montant: totalDepense, fort: true },
  ]
  const ligneTotal = estMoisSansObjectif(mois) && (
    <div data-testid="total-depense" className={bureau ? 'px-0 pt-1' : 'px-3 pt-1.5'}>
      <button type="button" onClick={() => setTotalOuvert(!totalOuvert)} aria-expanded={totalOuvert}
        title={syntheseTotal.map((l) => `${l.nom} : ${euros(l.montant)}`).join('\n')}
        className="flex w-full items-center justify-between text-left">
        <span className="text-[11px] font-semibold uppercase tracking-[.06em] text-ink-3">Total dépensé</span>
        <b className={`font-bold tabular-nums ${bureau ? 'text-[18px]' : 'text-[17px]'}`}>{euros(totalDepense)}</b>
      </button>
      {totalOuvert && (
        <div data-testid="synthese-total" className="card mx-auto mt-1.5 w-full max-w-sm space-y-1 px-4 py-2.5 text-[13px]">
          {syntheseTotal.map((l) => (
            <div key={l.nom} className={`flex items-center justify-between gap-3 ${l.fort ? 'border-t border-line/60 pt-1 font-semibold' : 'text-ink-2'}`}>
              <span className="min-w-0 truncate">{l.nom}</span>
              <span className="shrink-0 tabular-nums">{euros(l.montant)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
  const prevuDe = (t: TuileBudget) => t.cle === 'fraisfixe' ? prevuFraisFixe : t.cle === 'courses' ? prevuCourses : 0
  const basculer = (t: TuileBudget) => ({ t, edition, prevu: prevuDe(t) || undefined, ouvert: ouvertes.has(t.cle), onBasculer: () => basculerTuile(t.cle), apport: t.cle === 'exceptionnelles' ? apportEp : undefined })

  if (bureau) {
    return (
      <div className="rise space-y-2">
        {edition.dialogue}
        {recents && <DernieresOperations bureau onClose={() => setRecents(false)} />}
        {entete}
        <div className="mx-auto w-full max-w-[660px] space-y-2">
          {hautDeVue}
          {noteFiltre}
          {tuiles.length ? (
            <>
              {groupes((t) => <LigneVerre key={t.cle} {...basculer(t)} />).map((g, i) => (
                <Fragment key={i}>
                  <div data-testid={`bloc-${i + 1}`} className={`verre verre-panneau !py-0.5 ${i ? '!mt-4' : ''}`}>{g.noeuds}</div>
                  {g.apres}
                </Fragment>
              ))}
              {ligneTotal}
            </>
          ) : vide}
        </div>
      </div>
    )
  }

  return (
    <div className="rise flex flex-col gap-2" style={{ minHeight: 'calc(100dvh - 172px - env(safe-area-inset-bottom))' }}>
      {edition.dialogue}
      {recents && <DernieresOperations bureau={false} onClose={() => setRecents(false)} />}
      {entete}
      {hautDeVue}
      {noteFiltre}
      {tuiles.length ? (
        <div className="flex flex-1 flex-col gap-1.5">
          {groupes((t) => <TuileBudgetAnneau key={t.cle} {...basculer(t)} />).map((g, i) => (
            <Fragment key={i}>
              <div data-testid={`bloc-${i + 1}`} style={{ flexGrow: g.noeuds.length }} className="bloc-lignes flex flex-col divide-y divide-white/[.07] overflow-hidden rounded-[14px] border border-white/[.09] bg-[#15110e]">{g.noeuds}</div>
              {g.apres}
            </Fragment>
          ))}
          {ligneTotal}
        </div>
      ) : vide}
    </div>
  )
}
