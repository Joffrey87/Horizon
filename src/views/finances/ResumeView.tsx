import { useMemo, useState, type ReactNode } from 'react'
import { Heart, Plane, ShoppingCart, Sofa, Wallet, Zap, type LucideIcon } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { euros } from '../../lib/finances'
import { COULEURS_ANNEAU, eclaircie, rgba, tuilesBudgets, type TuileBudget } from '../../lib/resume'
import { EmptyState } from '../../components/ui'
import { FiltreSeg, NavMois } from './partage'
import { DetailEpargne, DetailReste } from './DetailsTuiles'
import { useTuilesMois } from './tuilesMois'
import { useFin, useVue } from './contexte'
import { MontantBudget, useBudgetMois } from './budgetMois'
import { DetailLigne } from './DetailLigne'

const ICONES: Record<string, LucideIcon> = {
  courses: ShoppingCart, amenagement: Sofa, vacances: Plane, courantes: Wallet, exceptionnelles: Zap, dons: Heart,
}

/** Anneau de part consommée (plafonnée à 100 % pour le tracé), l'icône du budget au centre. Aucun chiffre dedans. */
function Anneau({ ratio, couleur, taille, children }: { ratio: number | null; couleur: string; taille: number; children: ReactNode }) {
  const trait = 4
  const r = taille / 2 - trait / 2
  const circ = 2 * Math.PI * r
  const trace = ratio === null ? 0 : Math.min(1, ratio) * circ
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: taille, height: taille }}>
      <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} className="absolute inset-0" aria-hidden>
        <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke="rgba(255,255,255,.10)" strokeWidth={trait} />
        <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke={couleur} strokeWidth={trait} strokeLinecap={trace > 0 ? 'round' : 'butt'}
          strokeDasharray={`${trace.toFixed(1)} ${circ.toFixed(1)}`} transform={`rotate(-90 ${taille / 2} ${taille / 2})`} />
      </svg>
      <span className="relative flex">{children}</span>
    </span>
  )
}

/**
 * Une tuile de budget : anneau + icône à gauche, nom et « restant / budget » à droite, teintée de la couleur du budget.
 * Toucher la tuile la déplie (détail par catégorie, comme dans le Budget) ; toucher le montant du budget change celui de ce mois.
 */
function TuileBudgetAnneau({ t, edition, ouvert, onBasculer }: {
  t: TuileBudget; edition: ReturnType<typeof useBudgetMois>; ouvert: boolean; onBasculer: () => void
}) {
  const Icone = ICONES[t.cle] ?? Wallet
  const depasse = t.ton === 'depasse'
  const clair = eclaircie(t.rvb, 0.24)
  const ouvrir = edition.peutModifier && t.ligneId ? () => edition.ouvrir({ id: t.ligneId!, name: t.titre }, t.budget) : undefined
  const alpha = t.separe ? [0.1, 0.03] : [0.24, 0.06]
  const depliable = t.ligneId !== null
  return (
    <div data-testid={`tuile-${t.cle}`} data-ton={t.ton} data-ouvert={ouvert || undefined} className={t.separe ? 'mt-3 lg:mt-5' : ''}>
      <div role={depliable ? 'button' : undefined} tabIndex={depliable ? 0 : undefined} aria-expanded={depliable ? ouvert : undefined}
        onClick={(e) => { if (depliable && !(e.target as HTMLElement).closest('button, a')) onBasculer() }}
        onKeyDown={(e) => { if (depliable && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onBasculer() } }}
        className={`flex min-h-[62px] items-center gap-3 border px-3.5 py-2 lg:min-h-[72px] lg:gap-[18px] lg:px-[22px] ${depliable ? 'cursor-pointer' : ''} ${ouvert ? 'rounded-t-[14px] border-b-transparent' : 'rounded-[14px]'}`}
        style={{ background: `linear-gradient(100deg, ${rgba(t.rvb, alpha[0]!)}, ${rgba(t.rvb, alpha[1]!)} 80%), #15110e`, borderColor: rgba(t.rvb, 0.28) }}>
        <Anneau ratio={t.ratio} couleur={depasse ? COULEURS_ANNEAU.depasse : clair} taille={48}>
          <Icone size={20} color={clair} strokeWidth={1.75} />
        </Anneau>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-[12.5px] font-medium text-ink-2 lg:text-[14.5px]">{t.titre}</p>
          <p className="flex items-baseline gap-1 whitespace-nowrap">
            <b className="text-[19px] font-bold tabular-nums lg:text-[23px]" style={{ color: t.restant !== null && t.restant < 0 ? COULEURS_ANNEAU.depasse : 'var(--color-ink)' }}>
              {euros(t.restant ?? t.depense)}
            </b>
            {t.budget !== null && (
              <span className="text-[12px] text-ink-3 lg:text-[14px]">
                / <MontantBudget montant={t.budget} ajustement={edition.ajustement(t.ligneId)} onOuvrir={ouvrir} discret />
              </span>
            )}
            {t.budget === null && ouvrir && (
              <button type="button" onClick={ouvrir} data-testid="budget-fixer"
                className="text-[12px] text-sun underline decoration-dotted underline-offset-4 lg:text-[14px]">fixer un budget</button>
            )}
          </p>
        </div>
      </div>
      {ouvert && t.ligneId && (
        <div className="rounded-b-[14px] border border-t-0 px-3 py-0.5 lg:px-4" style={{ borderColor: rgba(t.rvb, 0.28), background: 'rgba(33,28,22,.55)' }}>
          <DetailLigne cle={t.ligneId} couleur={clair} />
        </div>
      )}
    </div>
  )
}

/**
 * Résumé : l'accueil de l'onglet Finances. Reste et Épargné du mois, puis « Restant » : une tuile à anneau
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
  const { s, capitalRetire, aVenir, epPrevues, listeEp, budgetDepenses, reelDepenses, resteTuile, epargne } = useTuilesMois()
  const resteValable = resteTuile !== null
  const edition = useBudgetMois()
  const aPayer = aVenir.total + epPrevues.total

  const tuiles = useMemo(() => tuilesBudgets(s.lignes).filter((t) => !t.absente), [s.lignes])

  if (!lines.length) {
    return <EmptyState hint="Crée tes lignes (Frais fixe, Courses…) dans Réglages.">Aucune ligne de budget pour l’instant.</EmptyState>
  }

  return (
    <div className="rise space-y-3">
      {edition.dialogue}
      <header className="relative flex items-center justify-between gap-1 sm:gap-3 md:grid md:grid-cols-[1fr_auto_1fr]">
        <div className="md:justify-self-start"><NavMois mois={mois} onChange={setMois} /></div>
        <span className="max-md:hidden" />
        <div className="md:justify-self-end"><FiltreSeg value={filtre} onChange={setFiltre} /></div>
      </header>

      <div className={`grid gap-2.5 ${vue ? '' : 'grid-cols-2'}`}>
        {!vue && (
          <button type="button" data-testid="tuile-reste" aria-expanded={detail === 'reste'} disabled={!resteValable}
            onClick={() => setDetail(detail === 'reste' ? null : 'reste')} title="Voir le détail du calcul"
            className="card px-3 py-3 text-left disabled:cursor-default"
            style={{ borderColor: 'rgba(245,158,11,.4)', background: 'linear-gradient(135deg, rgba(245,158,11,.14), rgba(25,21,18,.9) 70%)' }}>
            <p className="block-title">{resteTuile !== null && resteTuile < 0 ? 'Au-delà du budget' : 'Reste'}</p>
            <p className="my-1 whitespace-nowrap text-[28px] font-bold tabular-nums lg:text-4xl"
              style={{ color: resteTuile === null ? '#857c6d' : resteTuile < 0 ? COULEURS_ANNEAU.depasse : COULEURS_ANNEAU.ok }}>
              {resteTuile === null ? '—' : euros(Math.abs(resteTuile))}
            </p>
            <p className="text-[11px] leading-snug text-ink-3 lg:text-xs">
              {resteTuile === null ? 'budget : vue Foyer' : aPayer > 0.5 ? `${euros(aPayer)} dépenses à venir` : ' '}
            </p>
          </button>
        )}
        <button type="button" data-testid="tuile-epargne" aria-expanded={detail === 'epargne'}
          onClick={() => setDetail(detail === 'epargne' ? null : 'epargne')} title="Voir les épargnes du mois"
          className="card px-3 py-3 text-left">
          <p className="block-title">Épargné</p>
          <p className="my-1 whitespace-nowrap text-[28px] font-bold tabular-nums text-sun-soft lg:text-4xl">{euros(epargne)}</p>
        </button>
        {detail === 'reste' && resteTuile !== null && (
          <div className="col-span-2 flex justify-center">
            <DetailReste budget={budgetDepenses} depense={reelDepenses} aVenir={aVenir} epargnes={epPrevues} capital={capitalRetire} resteTuile={resteTuile} />
          </div>
        )}
        {detail === 'epargne' && <div className={`flex justify-center ${vue ? '' : 'col-span-2'}`}><DetailEpargne liste={listeEp} /></div>}
      </div>

      <p className="block-title pt-1">Restant</p>
      {!foyer && <p className="-mt-1 text-[11px] text-ink-3">Les budgets sont ceux du foyer : ici, ce que {filtre === 'commun' ? 'le compte commun' : filtre === 'joffrey' ? 'Joffrey' : 'Honorine'} a dépensé. Choisis Foyer pour voir le restant.</p>}

      {tuiles.length ? (
        <div className="space-y-1.5 lg:space-y-2">
          {tuiles.map((t) => <TuileBudgetAnneau key={t.cle} t={t} edition={edition} ouvert={ouvertes.has(t.cle)} onBasculer={() => basculerTuile(t.cle)} />)}
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-ink-3">Aucune ligne Courses, Aménagement, Vacances, Dons… trouvée dans ton budget.</p>
      )}
    </div>
  )
}
