import { useMemo, useState, type ReactNode } from 'react'
import { Banknote, Heart, PiggyBank, Receipt, Search, Plane, ShoppingCart, Sofa, Wallet, Zap, type LucideIcon } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { entreesPrevues, euros } from '../../lib/finances'
import { COULEURS_ANNEAU, eclaircie, rgba, tuilesBudgets, type TuileBudget } from '../../lib/resume'
import { EmptyState } from '../../components/ui'
import { FiltreSeg, NavMois } from './partage'
import { DetailAuDela, DetailEpargne, DetailEpargneUtilisee, lignesAuDela } from './DetailsTuiles'
import { epargneUtilisee } from '../../lib/epargneUtilisee'
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
function CorpsTuile({ t, edition, bureau }: { t: TuileBudget; edition: ReturnType<typeof useBudgetMois>; bureau: boolean }) {
  const Icone = ICONES[t.cle] ?? Wallet
  const depasse = t.ton === 'depasse'
  const clair = eclaircie(t.rvb, 0.24)
  const ouvrir = edition.peutModifier && t.ligneId ? () => edition.ouvrir({ id: t.ligneId!, name: t.titre }, t.budget) : undefined
  const { mois } = useFin()
  // Mois sans objectif : seulement le dépensé ; Frais fixe garde son anneau, les autres n'en ont pas.
  const sansObjectif = estMoisSansObjectif(mois)
  const sansAnneau = sansObjectif && t.cle !== LIGNE_AVEC_ANNEAU
  const negatif = !sansObjectif && t.restant !== null && t.restant < 0
  return (
    <>
      <Anneau sansTrace={sansAnneau} ratio={sansAnneau ? null : t.ratio} couleur={depasse ? COULEURS_ANNEAU.depasse : clair} taille={bureau ? 36 : 38} trait={bureau ? 2 : 3} halo={bureau}>
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
          style={{ color: negatif ? COULEURS_ANNEAU.depasse : 'var(--color-ink)' }}>
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
function TuileBudgetAnneau({ t, edition, ouvert, onBasculer }: {
  t: TuileBudget; edition: ReturnType<typeof useBudgetMois>; ouvert: boolean; onBasculer: () => void
}) {
  const clair = eclaircie(t.rvb, 0.24)
  const alpha = t.separe ? [0.1, 0.03] : [0.24, 0.06]
  const depliable = t.ligneId !== null
  return (
    <div data-testid={`tuile-${t.cle}`} data-ton={t.ton} data-ouvert={ouvert || undefined}>
      <div {...enTete(depliable, ouvert, onBasculer)}
        className={`flex min-h-[54px] items-center gap-3 border px-3 py-1.5 ${depliable ? 'cursor-pointer' : ''} ${ouvert ? 'rounded-t-[14px] border-b-transparent' : 'rounded-[14px]'}`}
        style={{ background: `linear-gradient(100deg, ${rgba(t.rvb, alpha[0]!)}, ${rgba(t.rvb, alpha[1]!)} 80%), #15110e`, borderColor: rgba(t.rvb, 0.28) }}>
        <CorpsTuile t={t} edition={edition} bureau={false} />
      </div>
      {ouvert && t.ligneId && (
        <div className="max-h-[45dvh] overflow-y-auto rounded-b-[14px] border border-t-0 px-3 py-0.5" style={{ borderColor: rgba(t.rvb, 0.28), background: 'rgba(33,28,22,.55)' }}>
          <DetailLigneLecture cle={t.ligneId} couleur={clair} />
        </div>
      )}
    </div>
  )
}

/**
 * Bureau : ligne posée dans un panneau de verre, presque transparente, séparée de la précédente par un filet.
 * Le clic la déplie (détail par catégorie).
 */
function LigneVerre({ t, edition, ouvert, onBasculer }: {
  t: TuileBudget; edition: ReturnType<typeof useBudgetMois>; ouvert: boolean; onBasculer: () => void
}) {
  const clair = eclaircie(t.rvb, 0.24)
  const depliable = t.ligneId !== null
  return (
    <div data-testid={`tuile-${t.cle}`} data-ton={t.ton} data-ouvert={ouvert || undefined} className="border-t border-white/[.09] first:border-t-0">
      <div {...enTete(depliable, ouvert, onBasculer)} className={`flex h-[58px] items-center gap-4 [@media(min-height:840px)]:h-[64px] ${depliable ? 'cursor-pointer' : ''}`}>
        <CorpsTuile t={t} edition={edition} bureau />
      </div>
      {ouvert && t.ligneId && (
        <div className="max-h-[45dvh] overflow-y-auto pb-2"><DetailLigneLecture cle={t.ligneId} couleur={clair} /></div>
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
  const [detail, setDetail] = useState<'reste' | 'epargne' | 'utilisee' | null>(null)
  // Tuiles de budget dépliées (détail par catégorie).
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set())
  const basculerTuile = (cle: string) => setOuvertes((o) => { const n = new Set(o); if (n.has(cle)) n.delete(cle); else n.add(cle); return n })

  // Mêmes chiffres que le Budget : un seul calcul (tuilesMois.ts), capital de prêt compté en épargne et non en dépense.
  const { s, depenses, aVenir, epPrevues, listeEp, resteTuile, epargne } = useTuilesMois()
  const resteValable = resteTuile !== null
  const edition = useBudgetMois()
  const transactions = useHorizon((st) => st.finTransactions)
  const comptes = useHorizon((st) => st.finAccounts)
  const utilisee = useMemo(() => epargneUtilisee({ transactions, comptes, mois }), [transactions, comptes, mois])
  const idx = useIndex()
  const prevues = useMemo(() => entreesPrevues({ mois, transactions, idx, filtre }), [mois, transactions, idx, filtre])
  const aPayer = aVenir.total + epPrevues.total

  // Bureau (≥ md, là où la barre latérale est affichée) : panneaux de verre ; téléphone : tuiles teintées.
  const bureau = useMediaQuery('(min-width: 768px)')
  const tuiles = useMemo(() => tuilesBudgets(s.lignes).filter((t) => !t.absente), [s.lignes])

  if (!lines.length) {
    return <EmptyState hint="Crée tes lignes (Frais fixe, Courses…) dans Réglages.">Aucune ligne de budget pour l’instant.</EmptyState>
  }

  const tailleMontant = bureau ? 'text-[24px] leading-tight' : 'text-[21px] leading-tight'
  const resteBtn = (
    <button type="button" data-testid="tuile-reste" aria-expanded={detail === 'reste'} disabled={!resteValable}
      onClick={() => setDetail(detail === 'reste' ? null : 'reste')} title="Voir le détail du calcul"
      className={`${bureau ? 'verre verre-tuile !py-2' : 'card px-3 py-2'} text-left disabled:cursor-default`}
      style={bureau ? undefined : { borderColor: 'rgba(245,158,11,.4)', background: 'linear-gradient(135deg, rgba(245,158,11,.14), rgba(25,21,18,.9) 70%)' }}>
      <p className="block-title overflow-hidden text-ellipsis whitespace-nowrap max-md:!tracking-[.04em]" data-testid="titre-reste">{resteTuile !== null && resteTuile < 0 ? 'Au-delà du budget' : 'Reste'}</p>
      <p className={`whitespace-nowrap font-bold tabular-nums ${tailleMontant}`}
        style={{ color: resteTuile === null ? '#857c6d' : resteTuile < 0 ? COULEURS_ANNEAU.depasse : COULEURS_ANNEAU.ok }}>
        {resteTuile === null ? '—' : euros(Math.abs(resteTuile))}
      </p>
      <p className="text-[10.5px] leading-snug text-ink-3">
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
        <p className={`truncate font-semibold text-ink-2 ${bureau ? 'text-[15px]' : 'text-[13px]'}`}>Épargné</p>
        {utilisee.total > 0.5 && (
          <button type="button" data-testid="tuile-epargne-utilisee" aria-expanded={detail === 'utilisee'}
            onClick={e => { e.stopPropagation(); setDetail(detail === 'utilisee' ? null : 'utilisee') }}
            title="Voir les virements depuis l'épargne"
            className="-mx-1 self-start rounded px-1 text-left text-[11px] leading-snug tabular-nums hover:underline" style={{ color: COULEUR_UTILISEE }}>
            Utilisée − {euros(utilisee.total)}
          </button>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="mb-1 text-[10px] font-semibold leading-none tracking-[.06em] text-ink-3">Épargné</p>
        <b className={`block font-bold leading-none tabular-nums ${bureau ? 'text-[22px]' : 'text-[20px]'}`} style={{ color: COULEURS_ANNEAU.ok }}>{euros(epargne)}</b>
      </div>
    </>
  )
  const detailEpargne = detail === 'epargne' ? <DetailEpargne liste={listeEp} utilisee={utilisee} /> : detail === 'utilisee' ? <DetailEpargneUtilisee donnees={utilisee} /> : null
  const ouvertEp = detail === 'epargne' || detail === 'utilisee'
  const ligneEpargne = bureau ? (
    <div key="epargne" data-testid="tuile-epargne" data-ouvert={ouvertEp || undefined} className="border-t border-white/[.09] first:border-t-0">
      <div {...enTete(true, detail === 'epargne', basculerEpargne)} title="Voir les épargnes du mois" className="flex h-[58px] cursor-pointer items-center gap-4 [@media(min-height:840px)]:h-[64px]">{corpsEpargne}</div>
      {detailEpargne && <div className="flex justify-center pb-2">{detailEpargne}</div>}
    </div>
  ) : (
    <div key="epargne" data-testid="tuile-epargne" data-ouvert={ouvertEp || undefined}>
      <div {...enTete(true, detail === 'epargne', basculerEpargne)} title="Voir les épargnes du mois"
        className={`flex min-h-[54px] cursor-pointer items-center gap-3 border px-3 py-1.5 ${detailEpargne ? 'rounded-t-[14px] border-b-transparent' : 'rounded-[14px]'}`}
        style={{ background: 'linear-gradient(100deg, rgba(110,190,120,.2), rgba(110,190,120,.05) 80%), #15110e', borderColor: 'rgba(110,190,120,.28)' }}>
        {corpsEpargne}
      </div>
      {detailEpargne && <div className="flex justify-center rounded-b-[14px] border border-t-0 px-1 py-1" style={{ borderColor: 'rgba(110,190,120,.28)', background: 'rgba(33,28,22,.55)' }}>{detailEpargne}</div>}
    </div>
  )
  const loupeBtn = (
    <button type="button" data-testid="tuile-loupe" aria-label="Dernières opérations" onClick={() => setRecents(true)}
      className={`${bureau ? 'verre verre-tuile !px-0 w-14' : 'card w-9'} flex items-center justify-center text-ink-2 hover:text-ink`}>
      <Search size={bureau ? 18 : 16} strokeWidth={2} />
    </button>
  )
  const colonnes = 'grid-cols-[minmax(0,1fr)_auto]'
  const hautDeVue = (
    <div className={`grid gap-2.5 ${bureau ? 'gap-3' : ''} ${colonnes}`}>
      {resteBtn}
      {loupeBtn}
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
  const salaire = prevues ? Math.round(prevues.montant / 100) * 100 : null
  const corpsSalaire = salaire !== null && (
    <>
      <Anneau sansTrace ratio={null} couleur="" taille={bureau ? 36 : 38}><Banknote size={bureau ? 15 : 16} color="#d8cfa8" strokeWidth={1.8} aria-hidden /></Anneau>
      <p className={`min-w-0 flex-1 truncate font-semibold text-ink-2 ${bureau ? 'text-[15px]' : 'text-[13px]'}`}>Salaire prévu</p>
      <div className="shrink-0 text-right">
        <p className="mb-1 text-[10px] font-semibold leading-none tracking-[.06em] text-ink-3">Prévu</p>
        <b data-testid="montant-salaire" className={`block font-bold leading-none tabular-nums ${bureau ? 'text-[22px]' : 'text-[20px]'}`} style={{ color: COULEURS_ANNEAU.ok }}>{euros(salaire)}</b>
      </div>
    </>
  )
  const ligneSalaire = corpsSalaire && (bureau
    ? <div key="salaire" data-testid="tuile-salaire" className="flex h-[58px] items-center gap-4 [@media(min-height:840px)]:h-[64px]">{corpsSalaire}</div>
    : <div key="salaire" data-testid="tuile-salaire" className="flex min-h-[54px] items-center gap-3 rounded-[14px] border px-3 py-1.5"
        style={{ background: 'linear-gradient(100deg, rgba(216,207,168,.16), rgba(216,207,168,.04) 80%), #15110e', borderColor: 'rgba(216,207,168,.26)' }}>{corpsSalaire}</div>)
  const groupes = (rendu: (t: TuileBudget) => ReactNode): ReactNode[][] => {
    const ff = tuiles.filter((t) => t.cle === 'fraisfixe')
    const autres = tuiles.filter((t) => t.cle !== 'fraisfixe' && !t.separe)
    const apart = tuiles.filter((t) => t.cle !== 'fraisfixe' && t.separe)
    return [ligneSalaire ? [ligneSalaire] : [], [...ff.map(rendu), ligneEpargne], autres.map(rendu), apart.map(rendu)].filter((g) => g.length)
  }
  // Mois sans objectif : total du dépensé en bas des lignes (l'épargne n'est pas une dépense : exclue).
  const totalDepense = tuiles.reduce((n, t) => n + t.depense, 0)
  const ligneTotal = estMoisSansObjectif(mois) && (
    <div data-testid="total-depense" className={`flex items-center justify-between ${bureau ? 'px-0 pt-1' : 'px-3 pt-1.5'}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[.06em] text-ink-3">Total dépensé</span>
      <b className={`font-bold tabular-nums ${bureau ? 'text-[22px]' : 'text-[20px]'}`}>{euros(totalDepense)}</b>
    </div>
  )
  const basculer = (t: TuileBudget) => ({ t, edition, ouvert: ouvertes.has(t.cle), onBasculer: () => basculerTuile(t.cle) })

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
                <div key={i} className={`verre verre-panneau !py-0.5 ${i ? '!mt-3 [@media(min-height:840px)]:!mt-5' : ''}`}>{g}</div>
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
        <div className="space-y-2">
          {groupes((t) => <TuileBudgetAnneau key={t.cle} {...basculer(t)} />).map((g, i) => <div key={i} className="space-y-1">{g}</div>)}
          {ligneTotal}
        </div>
      ) : vide}
    </div>
  )
}
