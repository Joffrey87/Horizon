import { useMemo, useState, type ReactNode } from 'react'
import { Heart, PiggyBank, Plane, ShoppingCart, Sofa, Wallet, Zap, type LucideIcon } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { euros } from '../../lib/finances'
import { COULEURS_ANNEAU, eclaircie, rgba, tuilesBudgets, type TuileBudget } from '../../lib/resume'
import { EmptyState } from '../../components/ui'
import { FiltreSeg, NavMois } from './partage'
import { DetailEpargne, DetailReste } from './DetailsTuiles'
import { useTuilesMois } from './tuilesMois'
import { useFin, useVue } from './contexte'
import { MontantBudget, useBudgetMois } from './budgetMois'
import { DetailLigneLecture } from './DetailLigne'
import { useMediaQuery } from '../../lib/useMediaQuery'

const ICONES: Record<string, LucideIcon> = {
  courses: ShoppingCart, amenagement: Sofa, vacances: Plane, courantes: Wallet, exceptionnelles: Zap, dons: Heart,
}

/** Cible mensuelle d'Épargne avenir : l'anneau d'« Épargné » est plein à ce montant. */
export const CIBLE_EPARGNE_AVENIR = 1000
const estAvenir = (nom?: string | null) => (nom ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('epargne avenir')

/** Anneau de part consommée (plafonnée à 100 % pour le tracé), l'icône du budget au centre. Aucun chiffre dedans. */
function Anneau({ ratio, couleur, taille, trait = 4, halo = false, children }: {
  ratio: number | null; couleur: string; taille: number; trait?: number; halo?: boolean; children: ReactNode
}) {
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
  const negatif = t.restant !== null && t.restant < 0
  return (
    <>
      <Anneau ratio={t.ratio} couleur={depasse ? COULEURS_ANNEAU.depasse : clair} taille={bureau ? 40 : 46} trait={bureau ? 2 : 3} halo={bureau}>
        <Icone size={bureau ? 17 : 19} color={clair} strokeWidth={1.8} />
      </Anneau>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <p className={`truncate font-semibold text-ink-2 ${bureau ? 'text-[15px]' : 'text-[13px]'}`}>{t.titre}</p>
        <p className={`whitespace-nowrap font-medium tabular-nums text-ink-3 ${bureau ? 'text-[12px]' : 'text-[11.5px]'}`}>
          {t.budget !== null ? (
            <>{euros(t.depense)} / <MontantBudget montant={t.budget} ajustement={edition.ajustement(t.ligneId)} onOuvrir={ouvrir} discret pointille /></>
          ) : ouvrir ? (
            <button type="button" onClick={ouvrir} data-testid="budget-fixer" className="-m-1 p-1 text-sun-soft/80 underline decoration-dotted decoration-sun-soft/60 underline-offset-2 hover:text-sun-soft">fixer un budget</button>
          ) : null}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="mb-1 text-[10px] font-semibold leading-none tracking-[.06em] text-ink-3">{t.restant === null ? 'Dépensé' : 'Reste'}</p>
        <b className={`block font-bold leading-none tabular-nums ${bureau ? 'text-[24px]' : 'text-[22px]'}`}
          style={{ color: negatif ? COULEURS_ANNEAU.depasse : 'var(--color-ink)' }}>
          {euros(t.restant ?? t.depense)}
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
    <div data-testid={`tuile-${t.cle}`} data-ton={t.ton} data-ouvert={ouvert || undefined} className={t.separe ? 'mt-3' : ''}>
      <div {...enTete(depliable, ouvert, onBasculer)}
        className={`flex min-h-[64px] items-center gap-3 border px-3.5 py-2 ${depliable ? 'cursor-pointer' : ''} ${ouvert ? 'rounded-t-[14px] border-b-transparent' : 'rounded-[14px]'}`}
        style={{ background: `linear-gradient(100deg, ${rgba(t.rvb, alpha[0]!)}, ${rgba(t.rvb, alpha[1]!)} 80%), #15110e`, borderColor: rgba(t.rvb, 0.28) }}>
        <CorpsTuile t={t} edition={edition} bureau={false} />
      </div>
      {ouvert && t.ligneId && (
        <div className="max-h-[45vh] overflow-y-auto rounded-b-[14px] border border-t-0 px-3 py-0.5" style={{ borderColor: rgba(t.rvb, 0.28), background: 'rgba(33,28,22,.55)' }}>
          <DetailLigneLecture cle={t.ligneId} couleur={clair} barres={t.cle !== 'courantes'} />
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
      <div {...enTete(depliable, ouvert, onBasculer)} className={`flex h-[68px] items-center gap-[18px] [@media(min-height:840px)]:h-[76px] ${depliable ? 'cursor-pointer' : ''}`}>
        <CorpsTuile t={t} edition={edition} bureau />
      </div>
      {ouvert && t.ligneId && (
        <div className="max-h-[45vh] overflow-y-auto pb-2"><DetailLigneLecture cle={t.ligneId} couleur={clair} barres={t.cle !== 'courantes'} /></div>
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
  const { mois, setMois, filtre, setFiltre } = useFin()
  const vue = useVue()
  const lines = useHorizon((s) => s.finLines)
  const foyer = filtre === 'foyer'
  const [detail, setDetail] = useState<'reste' | 'epargne' | null>(null)
  // Tuiles de budget dépliées (détail par catégorie).
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set())
  const basculerTuile = (cle: string) => setOuvertes((o) => { const n = new Set(o); if (n.has(cle)) n.delete(cle); else n.add(cle); return n })

  // Mêmes chiffres que le Budget : un seul calcul (tuilesMois.ts), capital de prêt compté en épargne et non en dépense.
  const { s, aVenir, epPrevues, listeEp, budgetDepenses, reelDepenses, resteTuile, epargne, epargnes } = useTuilesMois()
  const avenir = epargnes.filter((l) => estAvenir(l.ligne?.name)).reduce((a, l) => a + l.reel, 0)
  const resteValable = resteTuile !== null
  const edition = useBudgetMois()
  const aPayer = aVenir.total + epPrevues.total

  // Bureau (≥ md, là où la barre latérale est affichée) : panneaux de verre ; téléphone : tuiles teintées.
  const bureau = useMediaQuery('(min-width: 768px)')
  const tuiles = useMemo(() => tuilesBudgets(s.lignes).filter((t) => !t.absente), [s.lignes])

  if (!lines.length) {
    return <EmptyState hint="Crée tes lignes (Frais fixe, Courses…) dans Réglages.">Aucune ligne de budget pour l’instant.</EmptyState>
  }

  const resteBtn = !vue && (
    <button type="button" data-testid="tuile-reste" aria-expanded={detail === 'reste'} disabled={!resteValable}
      onClick={() => setDetail(detail === 'reste' ? null : 'reste')} title="Voir le détail du calcul"
      className={`${bureau ? 'verre verre-tuile' : 'card px-3 py-3'} text-left disabled:cursor-default`}
      style={bureau ? undefined : { borderColor: 'rgba(245,158,11,.4)', background: 'linear-gradient(135deg, rgba(245,158,11,.14), rgba(25,21,18,.9) 70%)' }}>
      <p className="block-title">{resteTuile !== null && resteTuile < 0 ? 'Au-delà du budget' : 'Reste'}</p>
      <p className={`whitespace-nowrap font-bold tabular-nums ${bureau ? 'my-0.5 text-[30px] leading-tight' : 'my-1 text-[28px]'}`}
        style={{ color: resteTuile === null ? '#857c6d' : resteTuile < 0 ? COULEURS_ANNEAU.depasse : COULEURS_ANNEAU.ok }}>
        {resteTuile === null ? '—' : euros(Math.abs(resteTuile))}
      </p>
      <p className="text-[11px] leading-snug text-ink-3 lg:text-xs">
        {resteTuile === null ? 'budget : vue Foyer' : aPayer > 0.5 ? `${euros(aPayer)} dépenses à venir` : ' '}
      </p>
    </button>
  )
  const epargneBtn = (
    <button type="button" data-testid="tuile-epargne" aria-expanded={detail === 'epargne'}
      onClick={() => setDetail(detail === 'epargne' ? null : 'epargne')} title="Voir les épargnes du mois"
      className={`${bureau ? 'verre verre-tuile' : 'card px-3 py-3'} text-left`}>
      <p className="block-title">Épargné</p>
      <div className="flex items-center gap-2.5">
        <span data-testid="anneau-epargne" data-avenir={Math.round(avenir)}>
          <Anneau ratio={Math.max(0, avenir) / CIBLE_EPARGNE_AVENIR} couleur={COULEURS_ANNEAU.ok} taille={bureau ? 34 : 36} trait={bureau ? 2 : 3} halo={bureau}>
            <PiggyBank size={bureau ? 15 : 16} style={{ color: COULEURS_ANNEAU.ok }} aria-hidden />
          </Anneau>
        </span>
        <p className={`whitespace-nowrap font-bold tabular-nums ${bureau ? 'my-0.5 text-[30px] leading-tight' : 'my-1 text-[28px]'}`} style={{ color: COULEURS_ANNEAU.ok }}>{euros(epargne)}</p>
      </div>
    </button>
  )
  const hautDeVue = (
    <div className={`grid gap-2.5 ${bureau ? 'gap-3' : ''} ${vue ? '' : 'grid-cols-2'}`}>
      {resteBtn}
      {epargneBtn}
      {detail === 'reste' && resteTuile !== null && (
        <div className="col-span-2 flex justify-center">
          <DetailReste budget={budgetDepenses} depense={reelDepenses} aVenir={aVenir} epargnes={epPrevues} resteTuile={resteTuile} />
        </div>
      )}
      {detail === 'epargne' && <div className={`flex justify-center ${vue ? '' : 'col-span-2'}`}><DetailEpargne liste={listeEp} /></div>}
    </div>
  )
  const noteFiltre = !foyer && <p className="-mt-1 text-[11px] text-ink-3">Les budgets sont ceux du foyer : ici, ce que {filtre === 'commun' ? 'le compte commun' : filtre === 'joffrey' ? 'Joffrey' : 'Honorine'} a dépensé. Choisis Foyer pour voir le restant.</p>
  const vide = <p className="py-4 text-center text-sm text-ink-3">Aucune ligne Courses, Aménagement, Vacances, Dons… trouvée dans ton budget.</p>
  const entete = (
    <header className="relative flex items-center justify-between gap-1 sm:gap-3 md:grid md:grid-cols-[1fr_auto_1fr]">
      <div className="md:justify-self-start"><NavMois mois={mois} onChange={setMois} /></div>
      <span className="max-md:hidden" />
      <div className="md:justify-self-end"><FiltreSeg value={filtre} onChange={setFiltre} /></div>
    </header>
  )
  const basculer = (t: TuileBudget) => ({ t, edition, ouvert: ouvertes.has(t.cle), onBasculer: () => basculerTuile(t.cle) })

  if (bureau) {
    const principales = tuiles.filter((t) => !t.separe)
    const apart = tuiles.filter((t) => t.separe)
    return (
      <div className="rise space-y-3">
        {edition.dialogue}
        {entete}
        <div className="mx-auto w-full max-w-[660px] space-y-2.5">
          {hautDeVue}
          {noteFiltre}
          {tuiles.length ? (
            <>
              {principales.length > 0 && <div className="verre verre-panneau !py-0.5">{principales.map((t) => <LigneVerre key={t.cle} {...basculer(t)} />)}</div>}
              {apart.length > 0 && <div className="verre verre-panneau !mt-3 !py-0 [@media(min-height:840px)]:!mt-5">{apart.map((t) => <LigneVerre key={t.cle} {...basculer(t)} />)}</div>}
            </>
          ) : vide}
        </div>
      </div>
    )
  }

  return (
    <div className="rise space-y-3">
      {edition.dialogue}
      {entete}
      {hautDeVue}
      {noteFiltre}
      {tuiles.length ? (
        <div className="space-y-1.5">
          {tuiles.map((t) => <TuileBudgetAnneau key={t.cle} {...basculer(t)} />)}
        </div>
      ) : vide}
    </div>
  )
}
