import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHorizon } from '../../lib/store'
import { euros } from '../../lib/finances'
import { COULEURS_ANNEAU, tuilesBudgets, type TonAnneau, type TuileBudget } from '../../lib/resume'
import { EmptyState } from '../../components/ui'
import { FiltreSeg, NavMois } from './partage'
import { DetailEpargne, DetailReste } from './DetailsTuiles'
import { useTuilesMois } from './tuilesMois'
import { useFin, useVue } from './contexte'

/** Sommet de l'anneau : part consommée (plafonnée à 100 % pour le tracé, le texte dit le vrai pourcentage). */
function Anneau({ ratio, ton, taille }: { ratio: number | null; ton: TonAnneau; taille: number }) {
  const r = 21
  const circ = 2 * Math.PI * r
  const trace = ratio === null ? 0 : Math.min(1, ratio) * circ
  const couleur = COULEURS_ANNEAU[ton]
  return (
    <svg width={taille} height={taille} viewBox="0 0 54 54" className="shrink-0" role="img"
      aria-label={ratio === null ? 'Pas de budget' : `${Math.round(ratio * 100)} % du budget consommé`}>
      <circle cx="27" cy="27" r={r} fill="none" stroke="#2a231c" strokeWidth="6" />
      <circle cx="27" cy="27" r={r} fill="none" stroke={couleur} strokeWidth="6" strokeLinecap={trace > 0 ? 'round' : 'butt'}
        strokeDasharray={`${trace.toFixed(1)} ${circ.toFixed(1)}`} transform="rotate(-90 27 27)" />
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" fontSize={ratio !== null && ratio >= 0.995 ? 11.5 : 13} fontWeight="700" fill={couleur}>
        {ratio === null ? '—' : `${Math.round(ratio * 100)}%`}
      </text>
    </svg>
  )
}

function TuileBudgetAnneau({ t }: { t: TuileBudget }) {
  const couleur = COULEURS_ANNEAU[t.ton]
  const montant = t.restant !== null ? euros(t.restant) : euros(t.depense)
  const detail = t.budget === null ? 'dépensé ce mois'
    : t.restant! < 0 ? `dépassé · ${euros(t.budget)}` : `restant · ${euros(t.budget)}`
  return (
    <div data-testid={`tuile-${t.cle}`} data-ton={t.ton}
      className="card flex flex-row items-center gap-2 px-2 py-2.5 lg:flex-col lg:gap-1 lg:px-3 lg:py-4 lg:text-center">
      <span className="lg:hidden"><Anneau ratio={t.ratio} ton={t.ton} taille={54} /></span>
      <span className="hidden lg:block"><Anneau ratio={t.ratio} ton={t.ton} taille={68} /></span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 lg:flex-none lg:items-center">
        <p className="flex min-h-[2.1rem] items-center text-[11.5px] font-semibold leading-tight lg:min-h-[2.4rem] lg:text-[13px]">{t.titre}</p>
        <p className="whitespace-nowrap text-[17px] font-bold tabular-nums lg:text-xl" style={{ color: couleur }}>{montant}</p>
        <p className="text-[10.5px] leading-snug text-ink-3 lg:text-[11px]">{detail}</p>
      </div>
    </div>
  )
}

/**
 * Résumé : l'accueil de l'onglet Finances. Reste et Épargné du mois, puis une tuile à anneau
 * par budget du foyer (Courses, Aménagement, Vacances, Dons, Dépenses courantes, exceptionnelles).
 * Suit le mois et le filtre Foyer / Commun / Joffrey / Honorine, comme le Budget.
 */
export function ResumeView() {
  const { mois, setMois, filtre, setFiltre } = useFin()
  const vue = useVue()
  const lines = useHorizon((s) => s.finLines)
  const foyer = filtre === 'foyer'
  const [detail, setDetail] = useState<'reste' | 'epargne' | null>(null)

  // Mêmes chiffres que le Budget : un seul calcul (tuilesMois.ts), capital de prêt compté en épargne et non en dépense.
  const { s, capitalRetire, aVenir, epPrevues, listeEp, budgetDepenses, reelDepenses, resteTuile, epargne } = useTuilesMois()
  const resteValable = resteTuile !== null
  const aPayer = aVenir.total + epPrevues.total

  const tuiles = useMemo(() => tuilesBudgets(s.lignes).filter((t) => !t.absente), [s.lignes])

  if (!lines.length) {
    return <EmptyState hint="Crée tes lignes (Frais fixe, Courses…) dans Réglages.">Aucune ligne de budget pour l’instant.</EmptyState>
  }

  return (
    <div className="rise space-y-3">
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

      <div className="flex items-baseline justify-between gap-2 pt-1">
        <p className="block-title">Budgets du mois</p>
        <Link to="/finances/budget" className="text-[12px] text-sun-soft hover:underline">Budget détaillé ›</Link>
      </div>
      {!foyer && <p className="-mt-1 text-[11px] text-ink-3">Les budgets sont ceux du foyer : ici, ce que {filtre === 'commun' ? 'le compte commun' : filtre === 'joffrey' ? 'Joffrey' : 'Honorine'} a dépensé. Choisis Foyer pour voir le restant.</p>}

      {tuiles.length ? (
        <div className="grid grid-cols-2 gap-2.5 lg:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]"
          style={{ '--n': tuiles.length } as React.CSSProperties}>
          {tuiles.map((t) => <TuileBudgetAnneau key={t.cle} t={t} />)}
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-ink-3">Aucune ligne Courses, Aménagement, Vacances, Dons… trouvée dans ton budget.</p>
      )}
    </div>
  )
}
