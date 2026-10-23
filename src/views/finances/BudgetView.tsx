import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import {
  NON_CLASSE, agregerHorsCapital, aplatirGroupes, decaleMois, depensesAVenir, detailLigne, entreesPrevues, euros, grouperParIntitule, libelleMois, syntheseMois, type GroupeIntitules, type LigneBudget,
} from '../../lib/finances'
import type { FinTransaction } from '../../lib/types'
import { EmptyState, ProgressBar } from '../../components/ui'
import { FiltreSeg, LigneOperation, MontantEditable, NavMois, Tuile } from './partage'
import { ResteTuile } from './ResteTuile'
import { DetailTroisMois } from './DetailTroisMois'
import { ChampRecherche, ResultatsRecherche } from './RechercheOperations'
import { moisCourant, useFin, useIndex, useReconnaissance, useVue } from './contexte'

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
  const budgets = useHorizon((s) => s.finBudgets)
  const echeances = useHorizon((s) => s.finEcheances)
  const prets = useHorizon((s) => s.finLoans)
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

  // Le capital des prêts n'est pas une dépense : il est retiré de la ligne qui porte le prélèvement
  // (il n'y reste que intérêts, assurance et frais) et compté en épargne, une seule fois.
  const { agregat, capital: capitalParMois } = useMemo(
    () => agregerHorsCapital({ prets, echeances, transactions, idx, filtre, moisCourant: moisCourant() }),
    [prets, echeances, transactions, idx, filtre])
  const s = useMemo(() => syntheseMois({ mois, lines, budgets, agregat, filtre }), [mois, lines, budgets, agregat, filtre])
  const prevues = useMemo(() => entreesPrevues({ mois, transactions, idx, filtre }), [mois, transactions, idx, filtre])
  const foyer = filtre === 'foyer'
  const suivant = decaleMois(mois, 1)
  const precedent = decaleMois(mois, -1)
  const enRetour = retour !== null && retour > mois

  const depenses = s.lignes.filter((l) => l.ligne?.kind !== 'epargne')
  const epargnes = s.lignes.filter((l) => l.ligne?.kind === 'epargne')
  const somme = (ls: LigneBudget[], f: (l: LigneBudget) => number | null) => ls.reduce((t, l) => t + (f(l) ?? 0), 0)
  const capitalMois = capitalParMois.get(mois)
  const aVenir = useMemo(() => depensesAVenir({ mois, moisCourant: moisCourant(), transactions, idx, filtre, lines, capital: capitalMois }),
    [mois, transactions, idx, filtre, lines, capitalMois])
  const reste = s.total.budget !== null ? s.total.budget - s.total.reel : null
  // Épargné : lignes d'épargne + capital de prêt remboursé (retiré des dépenses, donc compté une fois).
  const capital = capitalMois?.fait ?? 0
  // Tuile « Reste » : dépenses seulement (l'épargne n'y entre pas), après ce qui est encore à venir.
  const resteTuile = foyer ? somme(depenses, (l) => l.budget) - somme(depenses, (l) => l.reel) - aVenir.total : null

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
        <tr className="cursor-pointer border-t border-line/60 hover:bg-panel-2/50" style={l.ligne?.color ? { background: l.ligne.color } : undefined}
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
          <td className="w-44 px-2">
            <BarreBudget reel={l.reel} budget={l.budget} depasse={depasse} onClic={() => basculer(l.cle, 'mois')}
              edition={editable ? { mois, onSave: (v) => void setFinBudget(l.ligne!.id, 'budget', `${mois}-01`, v) } : undefined} />
          </td>
          <td className={`px-2 text-right tabular-nums ${depasse ? 'text-[#eda145]' : 'text-ink-2'}`}>
            {ecart !== null ? (depasse ? `+${euros(-ecart)} au-delà` : euros(ecart))
              : l.ligne && foyer && l.reel > 0 ? <span className="text-xs text-ink-3">sans budget</span> : '—'}
          </td>
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
        <td className="px-2"><BarreBudget reel={reel} budget={budget} depasse={budget !== null && budget > 0 && reel > budget + 0.5} discret /></td>
        <td className="px-2 text-right tabular-nums">{budget !== null ? euros(budget - reel) : ''}</td>
        <td className="px-2 text-right tabular-nums">{euros(somme(ls, (l) => l.moyenne3))}</td>
        <td className="px-2 text-right">{voirM1 && montantPrecedent(somme(ls, (l) => l.precedent))}</td>
        <td className="pl-2 text-right tabular-nums">{voirPrev && budget !== null ? euros(somme(ls, (l) => l.prevision)) : ''}</td>
      </tr>
    )
  }

  return (
    <div className="rise space-y-4">
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
            <Tuile compacte titre={resteTuile !== null && resteTuile < 0 ? 'Au-delà du budget' : 'Reste'}
              valeur={resteTuile === null ? '—' : euros(Math.abs(resteTuile))} ton={resteTuile !== null && resteTuile < 0 ? 'warn' : undefined}
              detail={resteTuile === null ? 'budget : vue Foyer' : aVenir.total > 0.5
                ? <span title={aVenir.details.map((d) => `${d.nom} : ${euros(d.montant)}`).join('\n')}>après {euros(aVenir.total)} à venir</span>
                : undefined} />
            <Tuile compacte titre="Épargné" valeur={euros(somme(epargnes, (l) => l.reel) + capital)}
              detail={capital > 0.5 ? <span title="Épargne + capital de prêt remboursé ce mois-ci">dont {euros(capital)} de capital remboursé</span> : undefined} />
          </div>

          <div className="card overflow-x-auto p-4">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-ink-3">
                  <th className="pb-2 pr-2 font-medium" aria-label="Ligne" />
                  <th className="px-2 pb-2 font-medium">Réel / budget</th>
                  <th className="px-2 pb-2 text-right font-medium">Reste</th>
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
                    <td className="px-2 tabular-nums">{euros(aLaCentaine(prevues.montant))}</td>
                    <td />
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
                    <BarreBudget reel={s.total.reel} budget={s.total.budget}
                      depasse={s.total.budget !== null && s.total.budget > 0 && s.total.reel > s.total.budget + 0.5} />
                  </td>
                  <td className="px-2 text-right tabular-nums">{reste === null ? '—' : reste < 0 ? `+${euros(-reste)} au-delà` : euros(reste)}</td>
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
 * Un clic épingle la bulle (utile au doigt) et appelle `onClic` (ouvrir la catégorie) ;
 * si `edition`, un clic sur le montant du budget dans la bulle permet de le changer.
 * Sans budget (ou budget à 0), pas de barre : le réel s'écrit en discret à sa place.
 * La bulle est rendue hors du tableau (portail) pour ne pas être rognée par son défilement.
 */
function BarreBudget({ reel, budget, depasse, edition, onClic, discret = false }: {
  reel: number; budget: number | null; depasse: boolean; discret?: boolean
  edition?: { mois: string; onSave: (v: number | null) => void }; onClic?: () => void
}) {
  const ancre = useRef<HTMLButtonElement>(null)
  const bulle = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [epingle, setEpingle] = useState(false)
  const [saisie, setSaisie] = useState(false)
  const [texte, setTexte] = useState('')
  const aBudget = budget !== null && budget > 0

  const placer = () => {
    const r = ancre.current?.getBoundingClientRect()
    if (r) setPos({ x: r.left + r.width / 2, y: r.top })
  }
  const fermer = () => { setEpingle(false); setSaisie(false); setPos(null) }

  useEffect(() => {
    if (!epingle) return
    // Clic ailleurs (après le blur du champ, qui enregistre), Échap ou défilement : on ferme.
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

  const enregistrer = () => {
    if (!edition) return
    const t = texte.replace(/\s/g, '').replace(',', '.')
    const v = t === '' ? null : Number(t)
    if (v !== null && !Number.isFinite(v)) return
    if (v !== budget) edition.onSave(v)
    fermer()
  }

  return (
    <>
      <button ref={ancre} type="button"
        onMouseEnter={() => { if (!epingle) placer() }} onMouseLeave={() => { if (!epingle) setPos(null) }}
        onClick={() => {
          onClic?.()
          if (epingle) { fermer(); return }
          placer(); setEpingle(true)
        }}
        aria-label={`Réel ${euros(reel)}${budget !== null ? `, budget ${euros(budget)}` : ''}`}
        className="flex h-6 w-full items-center rounded px-0.5 hover:bg-panel-2/60">
        {aBudget
          ? <ProgressBar value={(reel / budget!) * 100} color={depasse ? 'var(--color-warn)' : 'var(--color-teal)'} />
          : <span className={`tabular-nums ${discret ? '' : 'text-xs text-ink-3'}`}>{euros(reel)}</span>}
      </button>
      {pos && createPortal(
        <div ref={bulle} role="tooltip" style={{ left: pos.x, top: pos.y - 6 }}
          className="fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-line-2 bg-panel px-3 py-2 text-xs shadow-lg">
          <p className="text-[10px] uppercase tracking-wider text-ink-3">Réel / Budget</p>
          <p className="mt-0.5 flex items-center gap-1 text-sm font-medium tabular-nums">
            <span className={depasse ? 'text-[#eda145]' : ''}>{euros(reel)}</span>
            <span className="text-ink-3">/</span>
            {saisie && edition
              ? <input autoFocus value={texte} onChange={(e) => setTexte(e.target.value)} inputMode="decimal"
                  onFocus={(e) => e.target.select()} onBlur={enregistrer}
                  onKeyDown={(e) => { if (e.key === 'Enter') enregistrer(); if (e.key === 'Escape') fermer() }}
                  className="field !w-24 !px-2 !py-0.5 text-right text-sm tabular-nums" aria-label="Budget" />
              : epingle && edition
              ? <button onClick={() => { setTexte(budget === null ? '' : String(budget)); setSaisie(true) }} title="Changer le budget"
                  className="rounded px-1 decoration-dotted underline-offset-4 hover:underline">
                  {budget === null ? 'fixer un budget' : aBudget ? euros(budget) : 'sans budget'}
                </button>
              : <span>{budget === null ? '—' : aBudget ? euros(budget) : 'sans budget'}</span>}
          </p>
          {epingle && edition && (
            <p className="mt-1 text-[10px] text-ink-3">
              {saisie ? `À partir de ${libelleMois(edition.mois)} · vide = effacer · Entrée` : 'Clique le budget pour le changer'}
            </p>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

/** Niveau de détail d'une catégorie : fermée, ses groupes d'intitulés, ou toutes ses opérations. */
type Niveau = 0 | 1 | 2

/** Bouton « Détails » à droite d'une catégorie : 1er clic, les groupes ; 2e, « Détails+ »,
 *  toutes les opérations ; 3e, on referme. */
function BoutonDetails({ niveau, onChange }: { niveau: Niveau; onChange: (n: Niveau) => void }) {
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
function DetailLigne({ cle, niveauTous }: { cle: string; niveauTous: Niveau }) {
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
