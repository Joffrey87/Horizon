import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { addDays, addWeeks, differenceInCalendarWeeks, format, isToday, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Church } from 'lucide-react'
import { HeureExposant, heureDebut } from './HeureExposant'
import { useHorizon } from '../../lib/store'
import {
  birthdaysForDay, compareTasksByTitleTime, feastOnDay, firstFridayOrSaturday, iso, sansHeure, spanPart, tasksForDay, todayIso,
} from '../../lib/logic'
import type { Task } from '../../lib/types'
import { couleurMois, debutMoisTelephone, margeMois, teinteMois } from './molette'
import { EVENT_DEFAULT_COLOR, remplaProposeOn, stepsForDay } from './partage'

/** Vue Mois pour téléphone : 4 semaines à l'écran (par défaut la semaine d'avant, la
 *  semaine en cours et les 2 suivantes), façon agenda de poche. Chaque semaine est une
 *  ligne ; dans chaque jour, des lignes colorées (domaine) et, s'il y en a trop, un « +n ».
 *  On défile verticalement, une semaine à la fois. Un appui sur un jour ouvre son détail. */
const LIGNE = 14 // hauteur d'une ligne d'évènement (px)
const ENTETE = 17 // numéro du jour
const VISIBLES = 4 // semaines à l'écran
const RANGEES = 25 // semaines rendues (fenêtre recentrée quand on s'approche du bord)
const RECENTRE = 10 // semaines avant la semaine du haut, au recentrage
const BORD = 5 // à moins de 5 semaines du bord, on recentre
const REPOS_MS = 150 // le défilement est « fini » après ce délai sans mouvement

type Ligne = { cle: string; texte: string; couleur: string; bande?: boolean; fine?: boolean; heure?: string; fait?: boolean; tache?: Task; icone?: 'messe' | 'fete' }

export function MoisTelephone({ anchor, fenetre, focus, onFenetre, onOpenDay }: {
  anchor: Date; fenetre?: Date | null; focus?: Date | null; onFenetre: (debut: Date) => void; onOpenDay: (d: Date) => void
}) {
  const zoneRef = useRef<HTMLDivElement>(null)
  const [hauteur, setHauteur] = useState(0)
  const voulu = fenetre ?? debutMoisTelephone(anchor, focus)
  const [base, setBase] = useState(() => addWeeks(voulu, -RECENTRE))
  // Lundi de la semaine tout en haut de l'écran (celle que le défilement vient de poser).
  const haut = useRef(voulu)
  // Semaine à amener en haut au prochain rendu (changement de fenêtre ou demande extérieure).
  const aPoser = useRef<Date | null>(voulu)
  // Les rappels du parent changent à chaque rendu : on les lit par référence pour garder les semaines mémoïsées.
  const rappels = useRef({ onFenetre, onOpenDay })
  rappels.current = { onFenetre, onOpenDay }
  const ouvrir = useCallback((d: Date) => rappels.current.onOpenDay(d), [])

  const hLigne = hauteur / VISIBLES

  useEffect(() => {
    const el = zoneRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setHauteur(el.clientHeight))
    ro.observe(el)
    setHauteur(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  // Période choisie hors du défilement (flèches, sélecteur, lien) : on amène cette semaine en haut.
  // Trop près du bord de la fenêtre rendue : on la recentre d'abord (le rendu suivant fait le défilement).
  useLayoutEffect(() => {
    const el = zoneRef.current
    if (!el || hLigne <= 0) return
    if (iso(voulu) !== iso(haut.current)) aPoser.current = voulu
    const cible = aPoser.current
    if (!cible) return
    const rang = differenceInCalendarWeeks(cible, base, { weekStartsOn: 1 })
    if (rang < BORD || rang > RANGEES - BORD - VISIBLES) { setBase(addWeeks(cible, -RECENTRE)); return }
    aPoser.current = null
    haut.current = cible
    el.scrollTop = rang * hLigne
  }, [voulu, base, hLigne])

  // Défilement : le doigt (et son élan) n'est jamais interrompu par un rendu. Une fois le défilement posé,
  // la semaine du haut devient la période (en-tête) et, près du bord, la fenêtre rendue se recentre.
  const repos = useRef(0)
  const surDefilement = () => {
    window.clearTimeout(repos.current)
    repos.current = window.setTimeout(() => {
      const el = zoneRef.current
      if (!el || hLigne <= 0) return
      const rang = Math.round(el.scrollTop / hLigne)
      const debut = addWeeks(base, rang)
      if (iso(debut) !== iso(haut.current)) {
        haut.current = debut
        rappels.current.onFenetre(debut)
      }
      if (rang < BORD || rang > RANGEES - BORD - VISIBLES) {
        aPoser.current = debut
        setBase(addWeeks(debut, -RECENTRE))
      }
    }, REPOS_MS)
  }
  useEffect(() => () => window.clearTimeout(repos.current), [])

  const debuts = Array.from({ length: RANGEES }, (_, i) => addWeeks(base, i))
  const marge = margeMois(debuts.map((d) => Array.from({ length: 7 }, (_, j) => addDays(d, j))))
  const maxLignes = Math.max(1, Math.floor((hLigne - ENTETE - 2) / LIGNE))

  return (
    <div className="flex h-full flex-col">
      <div className="grid shrink-0 grid-cols-[repeat(7,minmax(0,1fr))_14px] border-b border-line-2/40 text-center text-[10px] uppercase tracking-wide text-ink-3">
        {['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map((j) => <span key={j} className="py-0.5">{j}</span>)}
      </div>
      <div ref={zoneRef} onScroll={surDefilement}
        className="min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain border-l border-line-2/50 [scrollbar-width:none]">
        {debuts.map((debut, i) => (
          <Semaine key={iso(debut)} debut={iso(debut)} hauteur={hLigne} maxLignes={maxLignes}
            moisMs={marge[i]!.mois.getTime()} nomMois={marge[i]!.debut ? marge[i]!.nom : ''} onOpenDay={ouvrir} />
        ))}
      </div>
    </div>
  )
}

/** Une semaine (ligne de 7 jours + marge du mois). Mémoïsée : elle ne se redessine que si ses données changent,
 *  pas à chaque semaine franchie au défilement. */
const Semaine = memo(function Semaine({ debut, hauteur, maxLignes, moisMs, nomMois, onOpenDay }: {
  debut: string; hauteur: number; maxLignes: number; moisMs: number; nomMois: string; onOpenDay: (d: Date) => void
}) {
  const s = useHorizon()
  const jours = Array.from({ length: 7 }, (_, j) => addDays(parseISO(debut), j))
  const mois = new Date(moisMs)

  const couleurDe = (t: Task) =>
    s.domains.find((d) => d.id === (t.domain_id ?? s.projects.find((p) => p.id === t.project_id)?.domain_id))?.color
    ?? EVENT_DEFAULT_COLOR

  /** Les lignes d'un jour, dans l'ordre : bandes multi-jours, fêtes/messes, étapes, reste. */
  const lignesDuJour = (jour: Date): Ligne[] => {
    const d = iso(jour)
    const toutes = [...tasksForDay(s.tasks, jour)].sort(compareTasksByTitleTime)
    const bandes = toutes.filter((t) => spanPart(t, d) !== 'single')
      .sort((a, b) => (a.scheduled_date ?? '').localeCompare(b.scheduled_date ?? '') || a.id.localeCompare(b.id))
    const simples = toutes.filter((t) => spanPart(t, d) === 'single')
    const out: Ligne[] = []
    for (const t of bandes) {
      const part = spanPart(t, d)
      // Le titre s'écrit au début de la bande, et à chaque lundi pour rester lisible.
      const titre = part === 'start' || jour.getDay() === 1
      // Sans lieu : bande deux fois plus fine, sauf là où s'écrit l'intitulé.
      out.push({ cle: t.id, texte: titre ? sansHeure(t.title) : '', couleur: couleurDe(t), bande: true, fine: !titre && !t.location?.trim() })
    }
    const fete = s.settings?.catholic_feasts !== false ? feastOnDay(jour) : null
    if (fete) out.push({ cle: 'fete', texte: fete, couleur: '#f59e0b', icone: 'fete' })
    const devotion = firstFridayOrSaturday(jour)
    if (devotion && d >= todayIso()) out.push({ cle: 'messe', texte: `Messe · ${devotion}`, couleur: '#a78bfa', icone: 'messe' })
    for (const b of birthdaysForDay(s.birthdays, jour)) {
      out.push({ cle: `b${b.id}`, texte: `🎂 ${b.name}`, couleur: '#ec7f97' })
    }
    for (const st of stepsForDay(s.steps, jour)) {
      out.push({ cle: st.id, texte: st.title, couleur: '#a78bfa' })
    }
    for (const t of simples) {
      out.push({ cle: t.id, texte: sansHeure(t.title), heure: heureDebut(t.title) ? t.title : undefined, couleur: couleurDe(t), fait: !t.is_recurring && t.status === 'fait', tache: t.is_task === false ? undefined : t })
    }
    return out
  }

  return (
    <div style={{ height: hauteur || undefined }}
      className="grid snap-start grid-cols-[repeat(7,minmax(0,1fr))_14px] [scroll-snap-stop:always]">
      {jours.map((jour) => {
        const auj = isToday(jour)
        const lignes = lignesDuJour(jour)
        const trop = lignes.length > maxLignes
        const montrees = trop ? lignes.slice(0, Math.max(0, maxLignes - 1)) : lignes
        const rempla = remplaProposeOn(s.celesteProposals, iso(jour))
        return (
          <button key={jour.toISOString()} type="button" onClick={() => onOpenDay(jour)}
            aria-label={format(jour, 'EEEE d MMMM', { locale: fr })}
            style={auj ? { background: 'linear-gradient(rgba(245,158,11,.14), rgba(245,158,11,.14)), rgba(15,13,10,.62)' } : { backgroundColor: teinteMois(jour) }}
            className={`relative flex min-h-0 flex-col overflow-hidden border-b border-r border-line-2/50 text-left ${auj ? 'bg-sun/10 ring-1 ring-inset ring-sun/70' : ''} ${rempla ? 'outline outline-1 -outline-offset-1 outline-dashed outline-[#ef4444]/80' : ''}`}>
            <span className={`flex shrink-0 items-baseline gap-0.5 px-0.5 text-[11px] leading-[17px] ${auj ? 'font-semibold text-sun-soft' : 'text-ink-2'}`}>
              {format(jour, 'd')}
            </span>
            {montrees.map((l) => (
              // Tâche : encadrée en pointillé, rayée une fois faite (pas de case à cocher ici).
              <span key={l.cle} style={{ background: `${l.couleur}${l.bande ? 'cc' : '55'}`, height: l.fine ? LIGNE / 2 : LIGNE,
                ...(l.tache ? { outline: `1px dashed ${l.couleur}`, outlineOffset: -1 } : {}) }}
                className={`flex shrink-0 items-center gap-0.5 overflow-hidden whitespace-nowrap px-0.5 text-[8px] leading-[14px] text-white ${
                  l.bande ? '' : 'mt-px rounded-[2px]'} ${l.fait ? 'line-through opacity-60' : ''}`}>
                {l.icone === 'messe' && <Church size={9} className="shrink-0" />}
                {l.heure && <HeureExposant titre={l.heure} />}
                <span className="overflow-hidden text-clip">{l.texte}</span>
              </span>
            ))}
            {trop && <span className="px-0.5 text-[10px] leading-[14px] text-ink-3">+{lignes.length - montrees.length}</span>}
          </button>
        )
      })}
      {/* Marge : bande teintée du mois, nom à la verticale en tête de bande. */}
      <div className="relative overflow-hidden border-b border-line-2/10" aria-hidden style={{ background: teinteMois(mois) }}>
        {nomMois && (
          <span className="absolute left-1/2 top-1 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.15em] [writing-mode:vertical-rl]"
            style={{ color: couleurMois(mois) }}>{nomMois}</span>
        )}
      </div>
    </div>
  )
})
