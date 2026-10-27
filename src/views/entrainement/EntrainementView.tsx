// ================================================================
// Entraînement — séance guidée A/B : échauffement minuté, séries d'échauffement
// à charge conseillée, saisie des séries de travail, repos lancé tout seul,
// bilan, historique et records. Chargé à la première ouverture (routes.tsx).
// ================================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronDown, ChevronRight, Dumbbell, Pause, Play, Plus, Trash2 } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { Badge } from '../../components/ui'
import {
  EXERCICES, SEANCES, arrondiDisque, etapesSeance, libelleEtape,
  type Etape, type EtapeEchauffement, type EtapeSerie, type SeanceId,
} from './programme'
import {
  dernierePerf, ecrireEnCours, lireEnCours, records, stockageEntrainement, tonnage, unRm,
  type SaisieSerie, type SeanceEnCours, type SeanceFaite, type SerieFaite,
} from './stockage'
import { amorcerSon, chrono, useCompteARebours, type CompteARebours } from './useCompteARebours'

type Ecran = 'accueil' | 'seance' | 'bilan'

const nombre = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
const jour = (iso: string) => format(parseISO(iso), 'EEE d MMM', { locale: fr })
const nouvelId = () => crypto.randomUUID()
const signaler = (message: string) => useHorizon.setState({ error: message })
const texteErreur = (e: unknown) => (e instanceof Error ? e.message : String(e))

function useMaintenant(actif: boolean) {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => {
    if (!actif) return
    const id = window.setInterval(() => setT(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [actif])
  return t
}

/** Garde l'écran allumé pendant la séance, si le navigateur le permet. */
function useEcranAllume(actif: boolean) {
  useEffect(() => {
    if (!actif || !('wakeLock' in navigator)) return
    let verrou: WakeLockSentinel | null = null
    const demander = async () => {
      try { verrou = await navigator.wakeLock.request('screen') } catch { /* refusé */ }
    }
    const auRetour = () => { if (document.visibilityState === 'visible') void demander() }
    void demander()
    document.addEventListener('visibilitychange', auRetour)
    return () => {
      document.removeEventListener('visibilitychange', auRetour)
      void verrou?.release().catch(() => undefined)
    }
  }, [actif])
}

export function EntrainementView() {
  const [historique, setHistorique] = useState<SeanceFaite[]>([])
  const [enCours, setEnCours] = useState<SeanceEnCours | null>(() => lireEnCours())
  const [ecran, setEcran] = useState<Ecran>('accueil')
  const [notes, setNotes] = useState('')
  const [finSeance, setFinSeance] = useState<number | null>(null)
  const [enregistrement, setEnregistrement] = useState(false)

  const charger = useCallback(async () => {
    try {
      setHistorique(await stockageEntrainement().lister())
    } catch (e) {
      signaler(`Historique d’entraînement indisponible : ${texteErreur(e)}`)
    }
  }, [])

  useEffect(() => { void charger() }, [charger])
  useEffect(() => { ecrireEnCours(enCours) }, [enCours])

  const seanceId = enCours?.seance
  const etapes = useMemo(() => (seanceId ? etapesSeance(seanceId) : []), [seanceId])
  const etape: Etape | undefined = enCours ? etapes[enCours.index] : undefined

  const maintenant = useMaintenant(ecran === 'seance')
  useEcranAllume(ecran === 'seance')

  const majEnCours = (f: (s: SeanceEnCours) => SeanceEnCours) => setEnCours((s) => (s ? f(s) : s))

  // ----- Valeurs proposées -----

  const chargeEchauffement = (e: EtapeSerie): number | undefined => {
    if (e.spec.kg != null) return e.spec.kg
    if (e.spec.pct == null) return undefined
    if (e.spec.pct === 0) return 0
    const reference = dernierePerf(historique, e.exercice.id, 1)?.kg
    return reference != null ? arrondiDisque(reference * e.spec.pct) : undefined
  }

  const progressionDue = (e: EtapeSerie) => {
    if (e.numero == null || e.exercice.mesure === 'duree' || e.exercice.sansProgression) return false
    const d = dernierePerf(historique, e.exercice.id, e.numero, e.cote)
    return d?.kg != null && d.reps != null && e.spec.max != null && d.reps >= e.spec.max
  }

  const parDefaut = (e: Etape): SaisieSerie => {
    if (e.type !== 'serie') return {}
    if (e.exercice.mesure === 'duree') return { secondes: e.spec.secondes }
    if (e.numero == null) return { kg: chargeEchauffement(e), reps: e.spec.reps }
    const d = dernierePerf(historique, e.exercice.id, e.numero, e.cote)
    if (progressionDue(e) && d?.kg != null) return { kg: d.kg + 2.5, reps: e.spec.min }
    return {
      kg: d?.kg ?? (e.exercice.mesure === 'poids_du_corps' ? 0 : undefined),
      reps: d?.reps ?? e.spec.min,
    }
  }

  const saisie = (e: Etape): SaisieSerie => ({ ...parDefaut(e), ...enCours?.saisies[e.id] })
  const modifier = (e: Etape, patch: SaisieSerie) =>
    majEnCours((s) => ({ ...s, saisies: { ...s.saisies, [e.id]: { ...parDefaut(e), ...s.saisies[e.id], ...patch } } }))

  // ----- Navigation -----

  const terminer = () => {
    minuteur.arreter()
    setFinSeance(Date.now())
    setEcran('bilan')
  }

  const allerA = (index: number) => {
    minuteur.arreter()
    if (index >= etapes.length) { terminer(); return }
    majEnCours((s) => ({ ...s, index: Math.max(0, index), phase: 'effort', finRepos: null }))
  }

  const valider = (extra: SaisieSerie = {}) => {
    if (!enCours || !etape) return
    const remplie: SaisieSerie = { ...saisie(etape), ...extra, faite: true, passee: false }
    const derniere = enCours.index >= etapes.length - 1
    if (etape.repos > 0 && !derniere) {
      const finRepos = Date.now() + etape.repos * 1000
      majEnCours((s) => ({ ...s, saisies: { ...s.saisies, [etape.id]: remplie }, phase: 'repos', finRepos }))
      minuteur.demarrer(etape.repos)
    } else {
      majEnCours((s) => ({ ...s, saisies: { ...s.saisies, [etape.id]: remplie } }))
      allerA(enCours.index + 1)
    }
  }

  const passer = () => {
    if (!enCours || !etape) return
    majEnCours((s) => ({ ...s, saisies: { ...s.saisies, [etape.id]: { passee: true } } }))
    allerA(enCours.index + 1)
  }

  const finDuMinuteur = () => {
    if (!enCours || !etape) return
    if (enCours.phase === 'repos') allerA(enCours.index + 1)
    else if (etape.type === 'echauffement') valider()
    else if (etape.exercice.mesure === 'duree') valider({ secondes: minuteur.totalSec })
  }

  const minuteur = useCompteARebours(() => finDuMinuteur())

  const commencer = (seance: SeanceId) => {
    amorcerSon()
    setNotes('')
    setFinSeance(null)
    setEnCours({ id: nouvelId(), seance, debut: Date.now(), index: 0, phase: 'effort', finRepos: null, saisies: {} })
    setEcran('seance')
  }

  const reprendre = () => {
    if (!enCours) return
    amorcerSon()
    setEcran('seance')
    if (enCours.phase === 'repos' && enCours.finRepos) {
      const reste = Math.ceil((enCours.finRepos - Date.now()) / 1000)
      if (reste > 0) minuteur.demarrer(reste)
      else allerA(enCours.index + 1)
    }
  }

  const abandonner = () => {
    if (!window.confirm('Abandonner la séance ? Les séries saisies seront perdues.')) return
    minuteur.arreter()
    setEnCours(null)
    setEcran('accueil')
  }

  // ----- Bilan -----

  const seriesFaites = (): SerieFaite[] => {
    if (!enCours) return []
    const out: SerieFaite[] = []
    for (const e of etapes) {
      if (e.type !== 'serie' || e.numero == null) continue
      const s = enCours.saisies[e.id]
      if (!s?.faite || s.passee) continue
      const base = { exerciceId: e.exercice.id, exerciceNom: e.exercice.nom, numero: e.numero, cote: e.cote, cible: e.spec.label }
      out.push(e.exercice.mesure === 'duree' ? { ...base, secondes: s.secondes } : { ...base, kg: s.kg, reps: s.reps })
    }
    return out
  }

  const enregistrer = async () => {
    if (!enCours) return
    setEnregistrement(true)
    const fin = finSeance ?? Date.now()
    try {
      await stockageEntrainement().enregistrer({
        id: enCours.id,
        seance: enCours.seance,
        debut: new Date(enCours.debut).toISOString(),
        fin: new Date(fin).toISOString(),
        dureeSec: Math.round((fin - enCours.debut) / 1000),
        notes,
        series: seriesFaites(),
      })
      setEnCours(null)
      setEcran('accueil')
      await charger()
    } catch (e) {
      signaler(`Séance non enregistrée : ${texteErreur(e)}. Elle reste gardée sur cet appareil.`)
    } finally {
      setEnregistrement(false)
    }
  }

  // ---------- Rendu ----------

  if (ecran === 'seance' && enCours && etape) {
    const suivante = etapes[enCours.index + 1]
    return (
      <div className="rise mx-auto max-w-xl space-y-4 pt-4 max-md:pb-24">
        <header className="flex items-center justify-between">
          <div>
            <div className="block-title">{SEANCES[enCours.seance].titre} · étape {enCours.index + 1}/{etapes.length}</div>
            <div className="text-lg tabular-nums">{chrono((maintenant - enCours.debut) / 1000)}</div>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost px-3 py-1.5 text-sm" onClick={terminer}>Terminer</button>
            <button className="px-2 py-1.5 text-sm text-bad" onClick={abandonner}>Abandonner</button>
          </div>
        </header>
        <div className="h-1.5 overflow-hidden rounded-full bg-panel-3">
          <div className="h-full bg-sun transition-all" style={{ width: `${(enCours.index / etapes.length) * 100}%` }} />
        </div>

        {enCours.phase === 'repos' ? (
          <CarteRepos
            minuteur={minuteur}
            suivante={suivante}
            saisieSuivante={suivante ? saisie(suivante) : undefined}
            onPasser={() => allerA(enCours.index + 1)}
            onCorriger={() => { minuteur.arreter(); majEnCours((s) => ({ ...s, phase: 'effort', finRepos: null })) }}
          />
        ) : etape.type === 'echauffement' ? (
          <CarteEchauffement etape={etape} minuteur={minuteur} onFait={() => valider()} />
        ) : (
          <CarteSerie
            etape={etape}
            saisie={saisie(etape)}
            historique={historique}
            progression={progressionDue(etape)}
            minuteur={minuteur}
            onModifier={(p) => modifier(etape, p)}
            onValider={(extra) => valider(extra)}
            onPasser={passer}
          />
        )}

        <div className="flex items-center justify-between text-sm">
          <button className="px-1 py-1 text-ink-3 hover:text-ink disabled:opacity-40" disabled={enCours.index === 0}
            onClick={() => allerA(enCours.index - 1)}>← Étape précédente</button>
          {enCours.phase === 'effort' && (
            <button className="px-1 py-1 text-ink-3 hover:text-ink" onClick={() => allerA(enCours.index + 1)}>Passer →</button>
          )}
        </div>

        <section className="space-y-1">
          <h2 className="block-title">À suivre</h2>
          <ul className="space-y-0.5 text-sm text-ink-3">
            {etapes.slice(enCours.index + (enCours.phase === 'repos' ? 2 : 1), enCours.index + 5).map((e) => (
              <li key={e.id} className="truncate">• {libelleEtape(e)}</li>
            ))}
          </ul>
        </section>
      </div>
    )
  }

  if (ecran === 'bilan' && enCours) {
    return (
      <Bilan
        seance={enCours.seance}
        series={seriesFaites()}
        dureeSec={Math.round(((finSeance ?? Date.now()) - enCours.debut) / 1000)}
        notes={notes}
        enregistrement={enregistrement}
        onNotes={setNotes}
        onEnregistrer={() => void enregistrer()}
        onRetour={() => setEcran('seance')}
      />
    )
  }

  return (
    <Accueil
      historique={historique}
      enCours={enCours}
      nbEtapes={etapes.length}
      onCommencer={commencer}
      onReprendre={reprendre}
      onAbandonner={abandonner}
      onSupprimer={async (id) => {
        if (!window.confirm('Supprimer cette séance de l’historique ?')) return
        try {
          await stockageEntrainement().supprimer(id)
          await charger()
        } catch (e) {
          signaler(`Séance non supprimée : ${texteErreur(e)}`)
        }
      }}
    />
  )
}

// ---------- Accueil ----------

function Accueil(props: {
  historique: SeanceFaite[]
  enCours: SeanceEnCours | null
  nbEtapes: number
  onCommencer: (s: SeanceId) => void
  onReprendre: () => void
  onAbandonner: () => void
  onSupprimer: (id: string) => void
}) {
  const { historique, enCours } = props
  const [ouverte, setOuverte] = useState<string | null>(null)
  const conseillee: SeanceId = historique[0]?.seance === 'A' ? 'B' : 'A'
  const meilleurs = useMemo(() => records(historique), [historique])

  return (
    <div className="rise mx-auto max-w-xl space-y-6 pt-4 max-md:pb-24">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><Dumbbell size={20} className="text-sun" /> Entraînement</h1>
        <p className="text-sm text-ink-3">Séances A et B en alternance. Les repos se lancent seuls, les charges de la dernière fois sont reprises.</p>
      </header>

      {enCours ? (
        <div className="card space-y-3 border-sun/40 p-4">
          <div>
            <div className="font-semibold">{SEANCES[enCours.seance].titre} en cours</div>
            <div className="text-sm text-ink-3">
              Étape {enCours.index + 1} sur {props.nbEtapes}, commencée à {format(enCours.debut, 'HH:mm')}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-sun flex-1 py-3" onClick={props.onReprendre}>Reprendre</button>
            <button className="px-3 text-sm text-bad" onClick={props.onAbandonner}>Abandonner</button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {(['A', 'B'] as const).map((id) => {
            const conseil = id === conseillee
            return (
              <div key={id} className={`card space-y-2 p-4 ${conseil ? 'border-sun/40' : ''}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-lg font-semibold">{SEANCES[id].titre}</div>
                  <div className="text-xs text-ink-3">{SEANCES[id].duree}</div>
                </div>
                {conseil && <Badge tone="sun">Séance conseillée aujourd’hui</Badge>}
                <ul className="text-sm text-ink-2">
                  {SEANCES[id].blocs.map((b) => (
                    <li key={b.join('+')}>• {b.map((e) => EXERCICES[e].nom).join(' + ')}</li>
                  ))}
                </ul>
                <button className={`${conseil ? 'btn-sun' : 'btn-ghost'} w-full py-3`} onClick={() => props.onCommencer(id)}>
                  Commencer
                </button>
              </div>
            )
          })}
        </div>
      )}

      {meilleurs.length > 0 && (
        <section className="space-y-2">
          <h2 className="block-title">Records</h2>
          <ul className="card divide-y divide-line text-sm">
            {meilleurs.map((r) => (
              <li key={r.exerciceId} className="flex justify-between gap-3 px-3 py-2">
                <span>{r.exerciceNom}</span>
                <span className="tabular-nums text-ink-2">{nombre(r.kg)} kg × {r.reps} · 1RM ≈ {Math.round(r.unRm)} kg</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="block-title">Historique</h2>
        {historique.length === 0 && <p className="text-sm text-ink-3">Aucune séance enregistrée pour l’instant.</p>}
        <ul className="space-y-2">
          {historique.map((h) => (
            <li key={h.id} className="card">
              <button className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                onClick={() => setOuverte(ouverte === h.id ? null : h.id)}>
                <span className="flex items-center gap-2">
                  {ouverte === h.id ? <ChevronDown size={15} className="text-ink-3" /> : <ChevronRight size={15} className="text-ink-3" />}
                  <span className="font-medium">{SEANCES[h.seance].titre}</span>
                  <span className="text-sm text-ink-3">{jour(h.debut)}</span>
                </span>
                <span className="text-sm tabular-nums text-ink-2">{chrono(h.dureeSec)} · {nombre(tonnage(h.series))} kg</span>
              </button>
              {ouverte === h.id && (
                <div className="space-y-2 border-t border-line px-3 py-3 text-sm">
                  <ListeSeries series={h.series} />
                  {h.notes && <p className="italic text-ink-2">{h.notes}</p>}
                  <button className="flex items-center gap-1 text-xs text-bad" onClick={() => props.onSupprimer(h.id)}>
                    <Trash2 size={12} /> Supprimer
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

// ---------- Cartes de séance ----------

function Anneau({ reste, total }: { reste: number; total: number }) {
  const r = 70
  const c = 2 * Math.PI * r
  const ratio = total > 0 ? reste / total : 0
  return (
    <div className="relative mx-auto h-44 w-44">
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" strokeWidth="10" stroke="var(--color-panel-3)" />
        <circle cx="80" cy="80" r={r} fill="none" strokeWidth="10" strokeLinecap="round" stroke="var(--color-sun)"
          strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} className="transition-[stroke-dashoffset] duration-200" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-4xl font-semibold tabular-nums">{chrono(reste)}</div>
    </div>
  )
}

function CommandesMinuteur({ minuteur }: { minuteur: CompteARebours }) {
  return (
    <div className="flex justify-center gap-2">
      <button className="btn-ghost flex items-center gap-1.5 px-4 py-2 text-sm" onClick={minuteur.enPause ? minuteur.reprendre : minuteur.pause}>
        {minuteur.enPause ? <><Play size={14} /> Reprendre</> : <><Pause size={14} /> Pause</>}
      </button>
      <button className="btn-ghost flex items-center gap-1 px-4 py-2 text-sm" onClick={() => minuteur.ajouter(15)}>
        <Plus size={14} /> 15 s
      </button>
    </div>
  )
}

function CarteRepos(props: {
  minuteur: CompteARebours
  suivante?: Etape
  saisieSuivante?: SaisieSerie
  onPasser: () => void
  onCorriger: () => void
}) {
  const { minuteur, suivante, saisieSuivante } = props
  return (
    <div className="card space-y-4 p-5 text-center">
      <div className="block-title">Repos</div>
      <Anneau reste={minuteur.resteSec} total={minuteur.totalSec} />
      <CommandesMinuteur minuteur={minuteur} />
      {suivante && (
        <div className="rounded-xl bg-panel-2 p-3 text-left">
          <div className="block-title">Ensuite</div>
          <div className="mt-1 font-medium">{libelleEtape(suivante)}</div>
          {suivante.type === 'serie' && suivante.exercice.mesure !== 'duree' && saisieSuivante?.kg != null && saisieSuivante.kg > 0 && (
            <div className="text-sm text-ink-2">
              Charge prévue : {nombre(saisieSuivante.kg)} kg{saisieSuivante.reps ? ` × ${saisieSuivante.reps}` : ''}
            </div>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <button className="btn-sun flex-1 py-3" onClick={props.onPasser}>Passer le repos</button>
        <button className="btn-ghost px-4 py-3 text-sm" onClick={props.onCorriger}>Corriger la série</button>
      </div>
    </div>
  )
}

function CarteEchauffement({ etape, minuteur, onFait }: { etape: EtapeEchauffement; minuteur: CompteARebours; onFait: () => void }) {
  const secondes = etape.secondes
  return (
    <div className="card space-y-4 p-5">
      <Badge tone="warn">{etape.bloc}</Badge>
      <div>
        <div className="text-2xl font-semibold">{etape.titre}</div>
        <p className="mt-1 text-ink-2">{etape.detail}</p>
      </div>
      {secondes ? (
        minuteur.actif ? (
          <>
            <Anneau reste={minuteur.resteSec} total={minuteur.totalSec} />
            <CommandesMinuteur minuteur={minuteur} />
            <button className="btn-ghost w-full py-3" onClick={onFait}>Terminer maintenant</button>
          </>
        ) : (
          <button className="btn-sun w-full py-4 text-lg" onClick={() => minuteur.demarrer(secondes)}>Démarrer · {chrono(secondes)}</button>
        )
      ) : (
        <button className="btn-sun w-full py-4 text-lg" onClick={onFait}>
          Fait{etape.repos ? ` · repos ${chrono(etape.repos)}` : ''}
        </button>
      )}
    </div>
  )
}

function CarteSerie(props: {
  etape: EtapeSerie
  saisie: SaisieSerie
  historique: SeanceFaite[]
  progression: boolean
  minuteur: CompteARebours
  onModifier: (p: SaisieSerie) => void
  onValider: (extra?: SaisieSerie) => void
  onPasser: () => void
}) {
  const { etape, saisie, historique, minuteur } = props
  const ex = etape.exercice
  const nbTravail = ex.series.filter((s) => !s.echauffement).length
  const derniere = etape.numero != null ? dernierePerf(historique, ex.id, etape.numero, etape.cote) : undefined
  const record = useMemo(() => records(historique).find((r) => r.exerciceId === ex.id), [historique, ex.id])
  const libelleRepos = etape.repos ? ` · repos ${chrono(etape.repos)}` : ''
  const cible = etape.spec.secondes ?? 30

  return (
    <div className="card space-y-4 p-5">
      <div className="block-title">{etape.bloc}</div>
      <div>
        <div className="text-2xl font-semibold">{ex.nom}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {etape.spec.echauffement
            ? <Badge tone="warn">Échauffement</Badge>
            : <Badge tone="good">Série {etape.numero} / {nbTravail}</Badge>}
          {etape.cote && <span className="text-sm text-ink-2">côté {etape.cote}</span>}
        </div>
        <div className="mt-2 text-3xl font-semibold">{etape.spec.label}</div>
        {ex.consigne && <p className="mt-1 text-sm text-ink-3">{ex.consigne}</p>}
      </div>

      {etape.spec.echauffement ? (
        <>
          <p className="text-ink-2">
            {saisie.kg != null && saisie.kg > 0
              ? `Charge conseillée : ${nombre(saisie.kg)} kg × ${saisie.reps ?? ''}`
              : saisie.kg === 0
                ? `Sans charge × ${saisie.reps ?? ''}`
                : 'Charge à choisir : la première séance enregistrée servira de référence.'}
          </p>
          <button className="btn-sun w-full py-4 text-lg" onClick={() => props.onValider()}>Fait{libelleRepos}</button>
        </>
      ) : ex.mesure === 'duree' ? (
        minuteur.actif ? (
          <>
            <Anneau reste={minuteur.resteSec} total={minuteur.totalSec} />
            <CommandesMinuteur minuteur={minuteur} />
            <button className="btn-ghost w-full py-3" onClick={() => {
              const tenu = minuteur.totalSec - minuteur.resteSec
              minuteur.arreter()
              props.onValider({ secondes: tenu })
            }}>Arrêter (lâché avant la fin)</button>
          </>
        ) : (
          <button className="btn-sun w-full py-4 text-lg" onClick={() => minuteur.demarrer(cible)}>Démarrer · {chrono(cible)}</button>
        )
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Pas label={ex.mesure === 'poids_du_corps' ? 'Lest (kg)' : 'Charge (kg)'} valeur={saisie.kg} pas={2.5}
              onChange={(kg) => props.onModifier({ kg })} />
            <Pas label="Répétitions" valeur={saisie.reps} pas={1} onChange={(reps) => props.onModifier({ reps })} />
          </div>
          <div className="space-y-0.5 text-sm text-ink-3">
            {derniere && <div>Dernière fois : {derniere.kg != null && derniere.kg > 0 ? `${nombre(derniere.kg)} kg × ` : ''}{derniere.reps}</div>}
            {props.progression && <div className="text-teal-soft">Haut de fourchette atteint la dernière fois : charge augmentée de 2,5 kg.</div>}
            {record && <div>Record : {nombre(record.kg)} kg × {record.reps} (1RM ≈ {Math.round(record.unRm)} kg)</div>}
            {saisie.kg != null && saisie.kg > 0 && saisie.reps ? <div>1RM estimé de cette série : {Math.round(unRm(saisie.kg, saisie.reps))} kg</div> : null}
          </div>
          <button className="btn-sun w-full py-4 text-lg" onClick={() => props.onValider()}>Série validée{libelleRepos}</button>
          {etape.spec.optionnelle && (
            <button className="w-full py-1 text-sm text-ink-3 hover:text-ink" onClick={props.onPasser}>Passer cette série optionnelle</button>
          )}
        </>
      )}
    </div>
  )
}

/** Champ numérique à boutons − / + (virgule décimale acceptée). */
function Pas(props: { label: string; valeur?: number; pas: number; onChange: (v: number | undefined) => void }) {
  const { valeur, pas } = props
  const versTexte = (v?: number) => (v != null ? String(v).replace('.', ',') : '')
  const [texte, setTexte] = useState(versTexte(valeur))
  const [vu, setVu] = useState(valeur)
  // Valeur changée de l'extérieur (boutons, étape suivante) : on resynchronise le texte.
  if (vu !== valeur) {
    setVu(valeur)
    const lu = parseFloat(texte.replace(',', '.'))
    if ((Number.isNaN(lu) ? undefined : lu) !== valeur) setTexte(versTexte(valeur))
  }
  const ajuster = (d: number) => props.onChange(Math.max(0, Math.round(((valeur ?? 0) + d) * 100) / 100))
  return (
    <label className="block">
      <span className="text-xs text-ink-3">{props.label}</span>
      <div className="mt-1 flex items-center gap-1">
        <button type="button" className="btn-ghost h-12 w-11 shrink-0 text-xl" onClick={() => ajuster(-pas)} aria-label="Diminuer">−</button>
        <input inputMode="decimal" className="field h-12 min-w-0 text-center text-2xl tabular-nums" value={texte}
          onChange={(e) => {
            setTexte(e.target.value)
            const v = parseFloat(e.target.value.replace(',', '.'))
            props.onChange(Number.isNaN(v) ? undefined : v)
          }} />
        <button type="button" className="btn-ghost h-12 w-11 shrink-0 text-xl" onClick={() => ajuster(pas)} aria-label="Augmenter">+</button>
      </div>
    </label>
  )
}

// ---------- Bilan ----------

function ListeSeries({ series }: { series: SerieFaite[] }) {
  const groupes = new Map<string, SerieFaite[]>()
  for (const s of series) groupes.set(s.exerciceNom, [...(groupes.get(s.exerciceNom) ?? []), s])
  return (
    <ul className="space-y-1">
      {[...groupes.entries()].map(([nom, liste]) => (
        <li key={nom}>
          <span className="font-medium">{nom}</span>{' '}
          <span className="tabular-nums text-ink-2">
            {liste.map((s) => s.secondes != null
              ? `${s.secondes} s${s.cote ? ` (${s.cote.charAt(0).toUpperCase()})` : ''}`
              : `${s.kg != null && s.kg > 0 ? `${nombre(s.kg)}×` : ''}${s.reps ?? '?'}`).join(' · ')}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Bilan(props: {
  seance: SeanceId
  series: SerieFaite[]
  dureeSec: number
  notes: string
  enregistrement: boolean
  onNotes: (v: string) => void
  onEnregistrer: () => void
  onRetour: () => void
}) {
  const { series } = props
  const tuiles: [string, string][] = [
    ['Durée', chrono(props.dureeSec)],
    ['Séries', String(series.length)],
    ['Tonnage', `${nombre(tonnage(series))} kg`],
  ]
  return (
    <div className="rise mx-auto max-w-xl space-y-4 pt-4 max-md:pb-24">
      <h1 className="text-xl font-semibold">Bilan · {SEANCES[props.seance].titre}</h1>
      <div className="grid grid-cols-3 gap-2 text-center">
        {tuiles.map(([l, v]) => (
          <div key={l} className="card p-3">
            <div className="block-title">{l}</div>
            <div className="mt-1 font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      <div className="card p-3 text-sm">
        {series.length ? <ListeSeries series={series} /> : <p className="text-ink-3">Aucune série de travail validée.</p>}
      </div>
      <label className="block space-y-1">
        <span className="text-sm text-ink-2">Notes et ressenti</span>
        <textarea className="field" rows={3} value={props.notes} onChange={(e) => props.onNotes(e.target.value)}
          placeholder="Forme du jour, douleurs, sommeil…" />
      </label>
      <button className="btn-sun w-full py-4 text-lg disabled:opacity-50" disabled={props.enregistrement} onClick={props.onEnregistrer}>
        {props.enregistrement ? 'Enregistrement…' : 'Enregistrer la séance'}
      </button>
      <button className="w-full py-1 text-sm text-ink-3 hover:text-ink" onClick={props.onRetour}>Revenir à la séance</button>
    </div>
  )
}
