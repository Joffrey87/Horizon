import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import {
  NON_CLASSE, decaleMois, entreesPrevues, euros, fondLigne, libelleMois, type LigneBudget,
} from '../../lib/finances'
import { EmptyState, ProgressBar } from '../../components/ui'
import { FiltreSeg, MontantEditable, NavMois, Tuile } from './partage'
import { ResteTuile } from './ResteTuile'
import { DetailEpargne, DetailReste } from './DetailsTuiles'
import { somme, useTuilesMois } from './tuilesMois'
import { DetailTroisMois } from './DetailTroisMois'
import { ChampRecherche, ResultatsRecherche } from './RechercheOperations'
import { useFin, useIndex, useVue } from './contexte'
import { MontantBudget, useBudgetMois } from './budgetMois'
import { estFraisFixe, estMoisSansObjectif } from '../../lib/moisSansObjectif'
import { BoutonDetails, DetailLigne, type Niveau } from './DetailLigne'

const CLE_PREV = 'horizon.finances.voirPrevision'
const CLE_M1 = 'horizon.finances.voirM1'

/** Salaire prévu : arrondi à la centaine la plus proche. */
const aLaCentaine = (v: number) => Math.round(v / 100) * 100

/** Ce qui est déplié sous une ligne : le détail du mois, ou celui des 3 mois précédents. */
type Depli = { cle: string; vue: 'mois' | 'moy3' } | null

/** Le tableau de bord du mois : atteinte du budget (réel / budget au survol), reste,
 *  M-1, moyenne des 3 mois précédents, prévisionnel M+1. */
export function BudgetView() {
  const { mois, setMois, filtre, setFiltre } = useFin()
  const transactions = useHorizon((s) => s.finTransactions)
  const lines = useHorizon((s) => s.finLines)
  const setFinBudget = useHorizon((s) => s.setFinBudget)
  const idx = useIndex()
  const [depli, setDepli] = useState<Depli>(null)
  // Pastille Détails d'une ligne du tableau : toutes ses catégories ouvertes sur leurs groupes (1) ou leurs opérations (2).
  const [niveauTous, setNiveauTous] = useState<{ cle: string; n: Niveau } | null>(null)
  // Mois d'où l'on est parti en cliquant un montant de M-1 : tant qu'on ne l'a pas retrouvé,
  // une flèche dans l'en-tête de la colonne M-1 avance d'un mois.
  const [retour, setRetour] = useState<string | null>(null)
  // Recherche : tant qu'elle est remplie, ses résultats (tous les mois) remplacent le tableau.
  const [recherche, setRecherche] = useState('')
  // Colonne du prévisionnel : cachée tant qu'on ne clique pas son intitulé (choix gardé sur cet appareil).
  const [voirPrev, setVoirPrev] = useState(() => { try { return localStorage.getItem(CLE_PREV) === '1' } catch { return false } })
  const basculerPrev = () => {
    setVoirPrev(!voirPrev)
    try { localStorage.setItem(CLE_PREV, voirPrev ? '0' : '1') } catch { /* sans mémoire, tant pis */ }
  }
  // Colonne M-1 : cachée de même tant qu'on ne clique pas son intitulé.
  const [voirM1, setVoirM1] = useState(() => { try { return localStorage.getItem(CLE_M1) === '1' } catch { return false } })
  const basculerM1 = () => {
    setVoirM1(!voirM1)
    try { localStorage.setItem(CLE_M1, voirM1 ? '0' : '1') } catch { /* sans mémoire, tant pis */ }
  }
  // Vue partagée : les budgets et le prévisionnel restent ceux du propriétaire.
  const modifiable = !useVue()
  // Budget d'une ligne pour ce mois seulement (même fenêtre que dans le Résumé).
  const budgetMois = useBudgetMois()

  const { s, depenses, epargnes, capitalMois, aVenir, epPrevues, listeEp, budgetDepenses, reelDepenses, resteTuile, epargne } = useTuilesMois()
  const prevues = useMemo(() => entreesPrevues({ mois, transactions, idx, filtre }), [mois, transactions, idx, filtre])
  const foyer = filtre === 'foyer'
  const suivant = decaleMois(mois, 1)
  const precedent = decaleMois(mois, -1)
  const enRetour = retour !== null && retour > mois
  const reste = s.total.budget !== null ? s.total.budget - s.total.reel : null
  const [detailTuile, setDetailTuile] = useState<'reste' | 'epargne' | null>(null)
  // Mois sans objectif : pas de barre, pas de budget ni de reste par ligne ; « Dépensé » à la place du reste, anneau pour Frais fixe.
  const sansObjectif = estMoisSansObjectif(mois)

  if (!lines.length) {
    return <EmptyState hint="Crée tes lignes (Frais fixe, Courses…) dans Réglages.">Aucune ligne de budget pour l’instant.</EmptyState>
  }

  const basculer = (cle: string, vue: 'mois' | 'moy3') => {
    setDepli(depli?.cle === cle && depli.vue === vue ? null : { cle, vue })
    setNiveauTous(null)
  }
  const reglerTous = (cle: string, n: Niveau) => {
    setDepli(n ? { cle, vue: 'mois' } : null)
    setNiveauTous(n ? { cle, n } : null)
  }
  // Changer de mois ne referme rien : ligne, groupes et opérations dépliés restent ouverts.
  const allerPrecedent = () => { setRetour(retour ?? mois); setMois(precedent) }
  const montantPrecedent = (v: number, className = '') => (
    <button onClick={allerPrecedent} title={`Voir ${libelleMois(precedent)}`}
      className={`rounded px-1 tabular-nums decoration-dotted underline-offset-4 hover:underline ${className}`}>
      {euros(v)}
    </button>
  )

  const ligneTableau = (l: LigneBudget) => {
    // Un budget à 0 veut dire « pas de budget fixé » (comme dans l'Excel) : rien à signaler.
    const aBudget = l.budget !== null && l.budget > 0
    const ecart = aBudget ? l.budget! - l.reel : null
    const depasse = ecart !== null && ecart < -0.5
    const ouvert = depli?.cle === l.cle ? depli.vue : null
    const editable = !!l.ligne && foyer && modifiable
    return (
      <Fragment key={l.cle}>
        <tr className="cursor-pointer border-t border-line/60 hover:bg-panel-2/50" style={fondLigne(l.ligne) ? { background: fondLigne(l.ligne)! } : undefined}
          onClick={(e) => { if (!(e.target as HTMLElement).closest('button, input, a')) basculer(l.cle, 'mois') }}>
          <td className="py-2 pr-2">
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => basculer(l.cle, 'mois')} aria-expanded={ouvert === 'mois'} className="flex items-center gap-1.5 text-left">
                {ouvert === 'mois' ? <ChevronDown size={14} className="text-ink-3" /> : <ChevronRight size={14} className="text-ink-3" />}
                <span className="flex flex-col">
                  <span className={l.ligne ? '' : 'italic text-ink-2'}>{l.ligne?.name ?? 'Non classé'}</span>
                  {(capitalMois?.extraitParLigne.get(l.cle) ?? 0) > 0.5 && (
                    <span className="text-[10px] leading-tight text-ink-3" title="Le capital des prêts n'est pas une dépense : il est retiré de cette ligne et compté dans l'épargne">
                      hors {euros(capitalMois!.extraitParLigne.get(l.cle)!)} de capital (compté en épargne)
                    </span>
                  )}
                </span>
              </button>
              <BoutonDetails niveau={ouvert === 'mois' && niveauTous?.cle === l.cle ? niveauTous.n : 0} onChange={(n) => reglerTous(l.cle, n)} />
            </div>
          </td>
          {sansObjectif ? (
            <td className="w-6 px-0">
              {estFraisFixe(l.ligne?.name) && aBudget && <AnneauRemplissage ratio={l.reel / l.budget!} depasse={depasse} />}
            </td>
          ) : <td className="w-52 px-2">
            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <BarreBudget reel={l.reel} budget={l.budget} depasse={depasse}
                  onClic={() => (editable ? budgetMois.ouvrir(l.ligne!, l.budget) : basculer(l.cle, 'mois'))} modifiable={editable} />
              </div>
              {l.ligne && foyer && (editable || aBudget) && (
                <MontantBudget montant={l.budget} ajustement={budgetMois.ajustement(l.ligne.id)} className="shrink-0 text-xs"
                  onOuvrir={editable ? () => budgetMois.ouvrir(l.ligne!, l.budget) : undefined} />
              )}
            </div>
          </td>}
          {sansObjectif ? <td className="whitespace-nowrap pl-1 pr-2 text-right tabular-nums text-ink-2" data-testid="depense-ligne">{euros(l.reel)}</td> :
          <td className={`px-2 text-right tabular-nums ${depasse ? 'text-[#eda145]' : 'text-ink-2'}`}>
            {ecart !== null ? (depasse ? `+${euros(-ecart)} au-delà` : euros(ecart))
              : l.ligne && foyer && l.reel > 0 ? <span className="text-xs text-ink-3">sans budget</span> : '—'}
          </td>}
          <td className="px-2 text-right">
            <button onClick={() => basculer(l.cle, 'moy3')} aria-expanded={ouvert === 'moy3'}
              title="Détail des 3 mois précédents, regroupé par intitulé"
              className={`rounded px-1 tabular-nums decoration-dotted underline-offset-4 hover:underline ${ouvert === 'moy3' ? 'bg-panel-3 text-ink' : 'text-ink-2'}`}>
              {euros(l.moyenne3)}
            </button>
          </td>
          <td className="px-2 text-right text-ink-2">{voirM1 && montantPrecedent(l.precedent)}</td>
          <td className="pl-2 text-right">
            {!voirPrev ? null : l.ligne && foyer && !modifiable
              ? <span className="tabular-nums text-ink-2">{l.prevision === null ? '—' : euros(l.prevision)}</span>
              : l.ligne && foyer
              ? <MontantEditable valeur={l.prevision} discret={!l.previsionSaisie}
                  titre={l.previsionSaisie ? `Prévu pour ${libelleMois(suivant)}` : `Reprend le budget — clique pour prévoir ${libelleMois(suivant)}`}
                  onSave={(v) => void setFinBudget(l.ligne!.id, 'prevision', `${suivant}-01`, v)} />
              : <span className="text-ink-3">—</span>}
          </td>
        </tr>
        {ouvert && (
          <tr>
            <td colSpan={6} className="bg-panel-2/40 px-3 pb-3 pt-1">
              {ouvert === 'mois'
                ? <DetailLigne cle={l.cle} niveauTous={niveauTous?.cle === l.cle ? niveauTous.n : 0} />
                : <DetailTroisMois cle={l.cle} />}
            </td>
          </tr>
        )}
      </Fragment>
    )
  }

  const sousTotal = (titre: string, ls: LigneBudget[], avecBudget = true) => {
    const budget = foyer && avecBudget ? somme(ls, (l) => l.budget) : null
    const reel = somme(ls, (l) => l.reel)
    return (
      <tr className="border-t border-line text-xs text-ink-3">
        <td className="py-1.5 pr-2 uppercase tracking-wider">{titre}</td>
        <td className="px-2">{!sansObjectif && <BarreBudget reel={reel} budget={budget} depasse={budget !== null && budget > 0 && reel > budget + 0.5} discret />}</td>
        <td className="px-2 text-right tabular-nums">{sansObjectif ? euros(reel) : budget !== null ? euros(budget - reel) : ''}</td>
        <td className="px-2 text-right tabular-nums">{euros(somme(ls, (l) => l.moyenne3))}</td>
        <td className="px-2 text-right">{voirM1 && montantPrecedent(somme(ls, (l) => l.precedent))}</td>
        <td className="pl-2 text-right tabular-nums">{voirPrev && budget !== null ? euros(somme(ls, (l) => l.prevision)) : ''}</td>
      </tr>
    )
  }

  return (
    <div className="rise space-y-4">
      {budgetMois.dialogue}
      {/* Recherche à gauche, mois au centre, titulaire à droite. */}
      <header className="relative flex items-center justify-between gap-1 sm:gap-3 md:grid md:grid-cols-[1fr_auto_1fr]">
        <div className="md:justify-self-start"><ChampRecherche valeur={recherche} onChange={setRecherche} /></div>
        <NavMois mois={mois} onChange={(m) => { setMois(m); setRetour(null) }} />
        <div className="md:justify-self-end"><FiltreSeg value={filtre} onChange={setFiltre} /></div>
      </header>

      {recherche.trim() ? <ResultatsRecherche requete={recherche} /> : (
        <>
          {/* Petites tuiles côte à côte, à la largeur de leur contenu, centrées. */}
          <div className="flex flex-wrap justify-center gap-2">
            <ResteTuile />
            <button type="button" data-testid="tuile-reste" aria-expanded={detailTuile === 'reste'} disabled={resteTuile === null}
              onClick={() => setDetailTuile(detailTuile === 'reste' ? null : 'reste')}
              title="Voir le détail du calcul" className="rounded-[inherit] text-left disabled:cursor-default">
              <Tuile compacte titre={resteTuile !== null && resteTuile < 0 ? 'Au-delà du budget' : 'Reste'}
                valeur={resteTuile === null ? '—' : euros(Math.abs(resteTuile))} ton={resteTuile !== null && resteTuile < 0 ? 'warn' : undefined}
                detail={resteTuile === null ? 'budget : vue Foyer' : aVenir.total + epPrevues.total > 0.5
                  ? <span>{euros(aVenir.total + epPrevues.total)} dépenses à venir</span>
                  : undefined} />
            </button>
            <button type="button" data-testid="tuile-epargne" aria-expanded={detailTuile === 'epargne'}
              onClick={() => setDetailTuile(detailTuile === 'epargne' ? null : 'epargne')}
              title="Voir les épargnes du mois" className="rounded-[inherit] text-left">
              <Tuile compacte titre="Épargné" valeur={euros(epargne)} ton="ok" />
            </button>
          </div>

          {detailTuile === 'reste' && resteTuile !== null && (
            <DetailReste budget={budgetDepenses} depense={reelDepenses} aVenir={aVenir} epargnes={epPrevues} resteTuile={resteTuile} />
          )}
          {detailTuile === 'epargne' && <DetailEpargne liste={listeEp} />}

          <div className="card overflow-x-auto p-4">
            <table className={`w-full text-sm ${sansObjectif ? '' : 'min-w-[640px]'}`}>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-ink-3">
                  <th className="pb-2 pr-2 font-medium" aria-label="Ligne" />
                  <th className={`pb-2 font-medium ${sansObjectif ? 'w-6 px-0' : 'px-2'}`}>{sansObjectif ? '' : 'Réel / budget'}</th>
                  <th className="px-2 pb-2 text-right font-medium">{sansObjectif ? 'Dépensé' : 'Reste'}</th>
                  <th className="px-2 pb-2 text-right font-medium">Moy. 3 mois</th>
                  <th className="px-2 pb-2 text-right font-medium">
                    <span className="inline-flex items-center gap-1">
                      <button onClick={basculerM1} aria-pressed={voirM1}
                        title={voirM1 ? 'Cacher Mois-1' : `Afficher ${libelleMois(precedent)} (Mois-1)`}
                        className={`inline-flex items-center gap-1 rounded px-1 uppercase tracking-wider hover:text-ink ${voirM1 ? 'text-ink-2' : ''}`}>
                        {voirM1 ? <EyeOff size={12} /> : <Eye size={12} />} Mois-1
                      </button>
                      {enRetour && (
                        <button onClick={() => setMois(suivant)} title={`Revenir à ${libelleMois(suivant)}`}
                          aria-label={`Revenir à ${libelleMois(suivant)}`}
                          className="rounded p-0.5 text-sun-soft hover:bg-panel-3 hover:text-ink">
                          <ArrowRight size={13} />
                        </button>
                      )}
                    </span>
                  </th>
                  <th className="pb-2 pl-2 text-right font-medium">
                    <button onClick={basculerPrev} aria-pressed={voirPrev}
                      title={voirPrev ? 'Cacher le prévisionnel (Mois+1)' : `Afficher le prévisionnel de ${libelleMois(suivant)} (Mois+1)`}
                      className={`inline-flex items-center gap-1 rounded px-1 uppercase tracking-wider hover:text-ink ${voirPrev ? 'text-ink-2' : ''}`}>
                      {voirPrev ? <EyeOff size={12} /> : <Eye size={12} />} Mois+1
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {prevues && (
                  <tr className="text-xs text-ink-3" title={prevues.sources.map((x) => `${x.nom} : ${euros(x.montant)} au plus bas, ${euros(x.moyenne)} en moyenne`).join('\n')}>
                    {/* Même format que les sous-totaux (« Dépenses »). */}
                    <td className="py-1.5 pr-2 uppercase tracking-wider">Salaire prévu</td>
                    {sansObjectif ? <><td /><td className="whitespace-nowrap pl-1 pr-2 text-right tabular-nums">{euros(aLaCentaine(prevues.montant))}</td></>
                      : <><td className="px-2 tabular-nums">{euros(aLaCentaine(prevues.montant))}</td><td /></>}
                    <td className="px-2 text-right tabular-nums" title="Salaire moyen des 3 derniers mois">{euros(prevues.moyenne)}</td>
                    <td colSpan={2} />
                  </tr>
                )}
                {sousTotal('Dépenses', depenses.filter((l) => l.cle !== NON_CLASSE))}
                {depenses.filter((l) => l.cle !== NON_CLASSE).map(ligneTableau)}
                {epargnes.length > 0 && sousTotal('Épargne', epargnes)}
                {epargnes.map(ligneTableau)}
                {s.lignes.some((l) => l.cle === NON_CLASSE) && (
                  <>
                    {sousTotal('À classer', s.lignes.filter((l) => l.cle === NON_CLASSE), false)}
                    {ligneTableau(s.lignes.find((l) => l.cle === NON_CLASSE)!)}
                  </>
                )}
                <tr className="border-t-2 border-line-2 font-semibold">
                  <td className="py-2 pr-2">Total</td>
                  <td className="px-2">
                    {!sansObjectif && <BarreBudget reel={s.total.reel} budget={s.total.budget}
                      depasse={s.total.budget !== null && s.total.budget > 0 && s.total.reel > s.total.budget + 0.5} />}
                  </td>
                  <td className="px-2 text-right tabular-nums">{sansObjectif ? euros(s.total.reel) : reste === null ? '—' : reste < 0 ? `+${euros(-reste)} au-delà` : euros(reste)}</td>
                  <td className="px-2 text-right tabular-nums">{euros(s.total.moyenne3)}</td>
                  <td className="px-2 text-right">{voirM1 && montantPrecedent(s.total.precedent)}</td>
                  <td className="pl-2 text-right tabular-nums">{!voirPrev ? '' : s.total.prevision !== null ? euros(s.total.prevision) : '—'}</td>
                </tr>
              </tbody>
            </table>
            {!foyer && <p className="mt-3 text-xs text-ink-3">Les budgets sont ceux du foyer : ils ne s’affichent que dans la vue Foyer.</p>}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Barre d'atteinte du budget. Au survol : « Réel / Budget » avec les deux montants.
 * Un clic épingle la bulle (utile au doigt) et appelle `onClic` : ouvrir la catégorie, ou — si `modifiable` —
 * la fenêtre de saisie du budget de ce mois (voir budgetMois.tsx), sans bulle.
 * Sans budget (ou budget à 0), pas de barre : le réel s'écrit en discret à sa place.
 * La bulle est rendue hors du tableau (portail) pour ne pas être rognée par son défilement.
 */
function BarreBudget({ reel, budget, depasse, modifiable = false, onClic, discret = false }: {
  reel: number; budget: number | null; depasse: boolean; discret?: boolean; modifiable?: boolean; onClic?: () => void
}) {
  const ancre = useRef<HTMLButtonElement>(null)
  const bulle = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [epingle, setEpingle] = useState(false)
  const aBudget = budget !== null && budget > 0
  const [largeur, setLargeur] = useState(0)
  // La bulle reste entièrement dans l'écran (téléphone : la barre est tout à droite).
  useLayoutEffect(() => { if (pos && bulle.current) setLargeur(bulle.current.offsetWidth) }, [pos, epingle])

  const placer = () => {
    const r = ancre.current?.getBoundingClientRect()
    if (r) setPos({ x: r.left + r.width / 2, y: r.top })
  }
  const fermer = () => { setEpingle(false); setPos(null) }

  useEffect(() => {
    if (!epingle) return
    // Clic ailleurs, Échap ou défilement : on ferme la bulle.
    const dehors = (e: MouseEvent) => {
      const t = e.target as Node
      if (!ancre.current?.contains(t) && !bulle.current?.contains(t)) fermer()
    }
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') fermer() }
    document.addEventListener('click', dehors)
    document.addEventListener('keydown', touche)
    window.addEventListener('scroll', fermer, true)
    return () => {
      document.removeEventListener('click', dehors)
      document.removeEventListener('keydown', touche)
      window.removeEventListener('scroll', fermer, true)
    }
  }, [epingle])

  return (
    <>
      <button ref={ancre} type="button"
        onMouseEnter={() => { if (!epingle && !modifiable) placer() }} onMouseLeave={() => { if (!epingle) setPos(null) }}
        onClick={() => {
          onClic?.()
          if (modifiable) { setPos(null); return }
          if (epingle) { fermer(); return }
          placer(); setEpingle(true)
        }}
        title={modifiable ? 'Changer le budget de ce mois' : undefined}
        aria-label={`Réel ${euros(reel)}${budget !== null ? `, budget ${euros(budget)}` : ''}`}
        className="flex h-6 w-full items-center rounded px-0.5 hover:bg-panel-2/60">
        {aBudget
          ? <ProgressBar value={(reel / budget!) * 100} color={depasse ? 'var(--color-warn)' : 'var(--color-teal)'} />
          : <span className={`tabular-nums ${discret ? '' : 'text-xs text-ink-3'}`}>{euros(reel)}</span>}
      </button>
      {pos && createPortal(
        <div ref={bulle} role="tooltip" style={{ left: Math.min(Math.max(pos.x, largeur / 2 + 8), window.innerWidth - largeur / 2 - 8), top: pos.y - 6 }}
          className="fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-line-2 bg-panel px-3 py-2 text-xs shadow-lg">
          <p className="text-[10px] uppercase tracking-wider text-ink-3">Réel / Budget</p>
          <p className="mt-0.5 flex items-center gap-1 text-sm font-medium tabular-nums">
            <span className={depasse ? 'text-[#eda145]' : ''}>{euros(reel)}</span>
            <span className="text-ink-3">/</span>
            <span>{budget === null ? '—' : aBudget ? euros(budget) : 'sans budget'}</span>
          </p>
        </div>,
        document.body,
      )}
    </>
  )
}

/** Mois sans objectif : petit anneau de remplissage (dépensé / budget, plafonné), sans chiffre. */
function AnneauRemplissage({ ratio, depasse }: { ratio: number; depasse: boolean }) {
  const t = 18, tr = 2.5, r = t / 2 - tr / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, ratio)) * c
  return (
    <svg data-testid="anneau-frais-fixe" data-ratio={Math.round(Math.min(1, ratio) * 100)} width={t} height={t} viewBox={`0 0 ${t} ${t}`} aria-hidden>
      <circle cx={t / 2} cy={t / 2} r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={tr} />
      <circle cx={t / 2} cy={t / 2} r={r} fill="none" stroke={depasse ? '#ef5a36' : '#c9bf86'} strokeWidth={tr} strokeLinecap="round"
        strokeDasharray={`${v.toFixed(1)} ${c.toFixed(1)}`} transform={`rotate(-90 ${t / 2} ${t / 2})`} />
    </svg>
  )
}
