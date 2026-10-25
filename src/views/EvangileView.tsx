import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, format as fmtDate, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Brain, RefreshCw, RotateCcw, ChevronRight, ChevronLeft, CalendarDays } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { iso, revisionWeek, todayIso } from '../lib/logic'
import { fetchMass, readingOfDay, readingQuote, useMassOfDay, type MassReading } from '../lib/aelf'
import { fetchMissel, misselReading, misselTitre, useFormeMesse, useMisselOfDay, type FormeMesse } from '../lib/missel'
import type { GospelQuiz } from '../lib/types'
import { Card, Badge } from '../components/ui'

const PASSAGE_KEY = (ref: string) => `horizon.gospel.passage.${ref}`
const QUIZ_KEY = (ref: string, lvl: number) => `horizon.gospel.quiz.${ref}.${lvl}`
const MAXLEVEL_KEY = (ref: string) => `horizon.gospel.maxlevel.${ref}`
const GENTS_KEY = (ref: string) => `horizon.gospel.gents.${ref}` // horodatage de la session de quiz
const RESET_MS = 3_600_000 // 1 h : au-delà, on repart au niveau 1 (quiz régénéré)
const MAX_LEVEL = 4        // au-delà, on tourne en rond : le quizz s'arrête là
const BACK_DAYS = 7        // on peut revenir sur les jours précédents (quiz compris)
// Révision de la semaine : un niveau par évangile du lundi au samedi précédents.
// Les quizz du missel de 1962 gardent leur clé d'origine ; ceux de la messe
// actuelle ont la leur (les évangiles de la semaine y sont différents).
const WEEK_KEY = (forme: FormeMesse, sunday: string, i: number) =>
  `horizon.gospel.semaine.${forme === 'ordinaire' ? 'ordinaire.' : ''}${sunday}.${i}`

/** Paragraphes d'un passage, chacun d'un seul tenant (les retours à la ligne deviennent des espaces). */
const enParagraphes = (texte: string) =>
  texte.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()).filter(Boolean)

export function EvangileView() {
  const today = todayIso()
  // On peut revenir sur les jours précédents : le quiz suit la date choisie.
  const [date, setDate] = useState(today)
  const [semaineOuverte, setSemaineOuverte] = useState(false)
  // Deux formes au choix. Missel de 1962 (défaut) : c'est le jour liturgique
  // (fête, dimanche après la Pentecôte…) qui commande, pas la date du calendrier.
  // Messe actuelle : lectionnaire AELF du jour.
  const [forme, setForme] = useFormeMesse()
  const ordinaire = forme === 'ordinaire'
  const { jour: jourBrut, loading: misselLoading, error: misselError } = useMisselOfDay(date, !ordinaire)
  // AELF sert de repli au missel de 1962 s'il est injoignable — et en mode démo,
  // qui n'a pas de session Supabase. C'est la source de la messe actuelle.
  const { mass: massBrute, loading: massLoading, error: massError } = useMassOfDay(date)
  // Un jour déjà affiché reste en place le temps que le suivant se charge : on
  // l'écarte, sinon le quiz porterait sur le passage de la veille.
  const jour = jourBrut?.date === date ? jourBrut : null
  const mass = massBrute?.date === date ? massBrute : null
  // TOUJOURS l'évangile : c'est lui qu'on lit et sur lequel porte le quiz.
  const duMissel = ordinaire ? undefined : misselReading(jour, 'evangile')
  const reading = duMissel ?? readingOfDay(mass, 'evangile')
  const loading = ordinaire ? massLoading : misselLoading
  const error = ordinaire ? massError : misselError
  const plusAncien = iso(addDays(parseISO(today), -BACK_DAYS))
  const decaler = (n: number) => setDate((d) => {
    const cible = iso(addDays(parseISO(d), n))
    return cible > today || cible < plusAncien ? d : cible
  })

  return (
    <div className="rise space-y-2">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {/* Forme de la messe : mémorisée sur l'appareil. */}
        <div className="inline-flex rounded-lg border border-line p-0.5 text-xs" role="group" aria-label="Forme de la messe">
          {([['extraordinaire', 'Missel de 1962'], ['ordinaire', 'Messe actuelle']] as const).map(([f, label]) => (
            <button key={f} onClick={() => setForme(f)} aria-pressed={forme === f}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                forme === f ? 'bg-sun/15 text-sun-soft' : 'text-ink-3 hover:text-ink'
              }`}>
              {label}
            </button>
          ))}
        </div>
        {/* Revenir sur un jour précédent : la lecture ET son quiz suivent. */}
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={() => decaler(-1)} disabled={date <= plusAncien}
            className="btn-ghost p-1.5 disabled:opacity-30" aria-label="Jour précédent" title="Jour précédent">
            <ChevronLeft size={15} />
          </button>
          <span className="min-w-24 text-center text-xs capitalize text-ink-2">
            {date === today ? "aujourd'hui" : fmtDate(parseISO(date), 'EEE d MMM', { locale: fr })}
          </span>
          <button onClick={() => decaler(1)} disabled={date >= today}
            className="btn-ghost p-1.5 disabled:opacity-30" aria-label="Jour suivant" title="Jour suivant">
            <ChevronRight size={15} />
          </button>
        </div>
      </header>

      <Card>
        {loading && !reading ? (
          <p className="text-sm text-ink-3">Chargement du propre du jour…</p>
        ) : !reading ? (
          <p className="text-sm text-ink-3">
            {ordinaire ? 'Lectures de la messe du jour' : 'Propre du jour'} indisponible{ordinaire ? 's' : ''} pour l’instant{error ? ` (${error})` : ''}.
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone="sun">Évangile</Badge>
              <h2 className="font-semibold">{reading.ref}</h2>
              {duMissel && <span className="text-sm capitalize text-ink-3">— {misselTitre(jour)}</span>}
              {!duMissel && mass?.name && <span className="text-sm text-ink-3">— {mass.name}</span>}            </div>

            {/* Citation courte — c'est celle qui s'affiche sur l'accueil. */}
            <blockquote className="border-l-2 border-sun/50 pl-3 text-[15px] italic leading-relaxed text-ink">
              « {readingQuote(reading).text} »
              <span className="mt-0.5 block text-xs not-italic text-ink-3">{reading.ref}</span>
            </blockquote>

            <div className="mt-4 border-t border-line pt-3">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Le texte en entier</p>
              {/* Paragraphes continus : les retours à la ligne du lectionnaire (phrases courtes) sont fondus. */}
              {enParagraphes(reading.text).map((para, i) => (
                <p key={i} className="mt-2 text-[15px] leading-relaxed text-ink">{para}</p>
              ))}
              <p className="mt-3 text-[11px] text-ink-3">
                {duMissel ? (
                  <>
                    Propre du jour selon le missel de 1962{jour?.titreLatin ? ` — ${jour.titreLatin}` : ''}.
                    {jour?.langue === 'la' && ' Traduction française indisponible pour ce jour : texte latin.'}
                  </>
                ) : ordinaire ? (
                  <>Lectures de la messe du jour (lectionnaire actuel, AELF).</>
                ) : (
                  <>Propre du missel injoignable{error ? ` (${error})` : ''} : lectures AELF affichées à la place.</>
                )}
              </p>
            </div>
          </>
        )}
      </Card>

      {/* La clé remet le quiz à zéro dès que le passage change (autre jour, autre
          forme de messe) : sans elle, il resterait celui du passage précédent. */}
      {reading && <SenseQuizCard key={reading.ref} reading={reading} />}

      {/* Révision de la semaine écoulée : ouverte le dimanche, disponible
          jusqu'au samedi suivant. */}
      {semaineOuverte
        ? <SemaineQuizCard key={forme} forme={forme} onClose={() => setSemaineOuverte(false)} />
        : (
          <button onClick={() => setSemaineOuverte(true)}
            className="btn-ghost flex w-full items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-sm">
            <CalendarDays size={15} className="text-sun" />
            Réviser les évangiles de la semaine
          </button>
        )}
    </div>
  )
}

// ---- Jours « passage » : quiz sur le sens (généré par l'edge function) -------

function SenseQuizCard({ reading }: { reading: MassReading }) {
  const s = useHorizon()
  const ref = reading.ref
  const quote = useMemo(() => readingQuote(reading), [reading])

  const [maxLevel, setMaxLevel] = useState(() => Number(localStorage.getItem(MAXLEVEL_KEY(ref)) ?? '0'))
  const [activeLevel, setActiveLevel] = useState<number | null>(null)
  const [activeQuiz, setActiveQuiz] = useState<GospelQuiz | null>(null)
  const [playNonce, setPlayNonce] = useState(0)
  const [quizBusy, setQuizBusy] = useState(false)
  const [quizError, setQuizError] = useState<string | null>(null)
  const inflight = useRef<Set<number>>(new Set())
  const initialise = useRef(false)
  const maxLevelRef = useRef(maxLevel)
  useEffect(() => { maxLevelRef.current = maxLevel }, [maxLevel])

  // Le texte du jour sert de source au quiz : on le garde en cache par référence.
  useEffect(() => { localStorage.setItem(PASSAGE_KEY(ref), reading.text) }, [ref, reading.text])

  const getCached = (level: number): GospelQuiz | null => {
    try {
      const raw = localStorage.getItem(QUIZ_KEY(ref, level))
      return raw ? JSON.parse(raw) as GospelQuiz : null
    } catch { return null }
  }

  // Questions déjà posées aux niveaux inférieurs (pour ne pas les répéter).
  const gatherAvoid = (level: number): string[] => {
    const out: string[] = []
    for (let l = 1; l < level; l++) {
      const q = getCached(l)
      if (q) out.push(...q.questions.map((x) => x.question))
    }
    return out
  }

  // Génère (ou renvoie depuis le cache) un niveau. Un seul appel par niveau.
  const generateLevel = async (level: number, silent = false): Promise<GospelQuiz | null> => {
    const cached = getCached(level)
    if (cached) return cached
    if (inflight.current.has(level)) return null
    inflight.current.add(level); setQuizBusy(true)
    const r = await s.gospelQuiz(ref, reading.text, level,
      { keyVerse: quote.text, verseRef: ref, avoid: gatherAvoid(level) })
    inflight.current.delete(level); setQuizBusy(false)
    if (r.ok && r.quiz) {
      localStorage.setItem(QUIZ_KEY(ref, level), JSON.stringify(r.quiz))
      if (level > maxLevelRef.current) {
        maxLevelRef.current = level; setMaxLevel(level)
        localStorage.setItem(MAXLEVEL_KEY(ref), String(level))
      }
      return r.quiz
    }
    if (!silent) setQuizError(r.error?.includes('ANTHROPIC') ? 'Quiz indisponible : clé API Anthropic à configurer.' : (r.error ?? 'Quiz indisponible.'))
    return null
  }

  // Prépare un niveau en arrière-plan sans l'ouvrir (pré-génération silencieuse).
  // Seul « Lancer le quizz » (ou l'ouverture d'un niveau) y mène : jamais l'arrivée sur la page.
  const prefetchLevel = (level: number) => { if (level <= MAX_LEVEL) void generateLevel(level, true) }

  // Ouvre un niveau (depuis le cache = gratuit, sinon 1 génération). Le niveau
  // suivant se prépare DÈS l'ouverture : il est prêt quand on valide celui-ci.
  const startLevel = async (level: number) => {
    if (level > MAX_LEVEL) return
    setQuizError(null)
    const q = await generateLevel(level)
    if (q) {
      setActiveLevel(level); setActiveQuiz(q); setPlayNonce((n) => n + 1)
      prefetchLevel(level + 1)
    }
  }

  // À l'ouverture : RIEN n'est généré (chaque génération coûte de l'API). Si la
  // dernière session date de ≥ 1 h (ou passage différent), on purge le cache :
  // le prochain « Lancer le quizz » repart au niveau 1 avec un quiz frais.
  useEffect(() => {
    if (initialise.current) return
    initialise.current = true
    const ts = Number(localStorage.getItem(GENTS_KEY(ref)) || 0)
    if (!ts || Date.now() - ts >= RESET_MS) {
      for (let l = 1; l <= maxLevelRef.current; l++) localStorage.removeItem(QUIZ_KEY(ref, l))
      localStorage.removeItem(MAXLEVEL_KEY(ref))
      maxLevelRef.current = 0; setMaxLevel(0)
      localStorage.setItem(GENTS_KEY(ref), String(Date.now()))
    }
  }, [ref]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card>
      <h3 className="flex items-center gap-1.5 font-medium"><Brain size={16} className="text-sun" /> Quizz sur le sens</h3>
      <p className="mt-0.5 text-xs text-ink-3">
        5 questions par niveau : 3 sur le sens et la leçon du passage, 2 textes à trous sur le verset
        clé. Chaque niveau creuse davantage,
        jusqu’au niveau {MAX_LEVEL}. Rien n’est généré avant ton clic ; une fois un niveau ouvert,
        le suivant se prépare en avance. Les niveaux déjà joués se rejouent sans coût.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {Array.from({ length: maxLevel }, (_, i) => i + 1).map((l) => (
          <button key={l} onClick={() => void startLevel(l)} disabled={quizBusy}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
              activeLevel === l ? 'border-sun/50 bg-sun/15 text-sun-soft' : 'border-line text-ink-2 hover:bg-panel-2 hover:text-ink'
            }`}>
            Niveau {l}
          </button>
        ))}
        {maxLevel < MAX_LEVEL && (
          <button onClick={() => void startLevel(maxLevel + 1)} disabled={quizBusy}
            className="btn-sun flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50">
            {quizBusy ? <RefreshCw size={14} className="animate-spin" /> : <Brain size={14} />}
            {maxLevel === 0 ? 'Lancer le quizz' : `Niveau ${maxLevel + 1} (nouveau)`}
          </button>
        )}
      </div>

      {quizError && <p className="mt-3 text-sm text-[#ec7f97]">{quizError}</p>}
      {activeQuiz && activeLevel !== null && (
        <Quiz key={`${activeLevel}-${playNonce}`} quiz={activeQuiz} level={activeLevel}
          onReplay={() => void startLevel(activeLevel)} />
      )}
    </Card>
  )
}

/** Réponse attendue vs donnée, casse/accents/ponctuation ignorés. Pour un texte
 *  à trous à plusieurs mots, TOUS les mots doivent y être, dans l'ordre :
 *  une moitié de bonne réponse reste fausse. */
function isRight(given: string, expected: string): boolean {
  const clean = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
  const g = clean(given), e = clean(expected)
  if (!g || !e) return false
  if (g === e) return true
  // Le modèle sépare parfois les mots attendus par « et », « / » ou une virgule :
  // on accepte alors la même suite de mots, dans le même ordre.
  const words = (t: string) => t.split(' ').filter((w) => w && w !== 'et')
  const gw = words(g), ew = words(e)
  return gw.length === ew.length && gw.every((w, i) => w === ew[i])
}

/** Quiz d'un niveau : les 5 questions sur la même page. On valide en une fois,
 *  puis récap « ta réponse » / « bonne réponse » côte à côte, avec correction stricte. */
function Quiz({ quiz, level, onReplay }: {
  quiz: GospelQuiz; level: number; onReplay: () => void
}) {
  const qs = quiz.questions
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [validated, setValidated] = useState(false)
  const allAnswered = qs.every((q) => (answers[q.id] ?? '').trim())

  if (!validated) {
    return (
      <div className="mt-4 space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Niveau {level}</p>
        {quiz.intro && <p className="text-sm italic text-ink-2">{quiz.intro}</p>}
        {qs.map((q, i) => {
          const given = answers[q.id] ?? ''
          return (
            <div key={q.id} className="space-y-1.5">
              <p className="text-sm font-medium">{i + 1}. {q.question}</p>
              {q.type === 'qcm' && q.choices ? (
                <div className="flex flex-col gap-1">
                  {q.choices.map((c) => (
                    <label key={c}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                        given === c ? 'border-sun/50 bg-sun/10' : 'border-line hover:bg-panel-2'
                      }`}>
                      <input type="radio" name={`${q.id}-${level}`} value={c} checked={given === c}
                        onChange={() => setAnswers((a) => ({ ...a, [q.id]: c }))}
                        className="accent-[color:var(--color-sun)]" />
                      <span className="flex-1">{c}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <input value={given} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  placeholder="Ta réponse…" className="field w-full" />
              )}
              {q.hint && <p className="text-[11px] text-ink-3">Indice : {q.hint}</p>}
            </div>
          )
        })}
        <button onClick={() => setValidated(true)} disabled={!allAnswered}
          className="btn-sun flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-50">
          Valider mes réponses <ChevronRight size={15} />
        </button>
      </div>
    )
  }

  // Récap : ta réponse vs bonne réponse, côte à côte. Correction STRICTE —
  // une réponse à trous n'est juste que si TOUS les mots attendus y sont.
  const verdicts = qs.map((q) => isRight(answers[q.id] ?? '', q.answer))
  const rights = verdicts.filter(Boolean).length
  return (
    <div className="mt-4 space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        Niveau {level} — {rights} / {qs.length} juste{rights > 1 ? 's' : ''}
      </p>
      {qs.map((q, i) => {
        const ok = verdicts[i]
        return (
        <div key={q.id} className="space-y-1.5">
          <p className="text-sm font-medium">{i + 1}. {q.question}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className={`rounded-lg border px-3 py-2 ${ok ? 'border-good/40 bg-good/10' : 'border-[#ec7f97]/40 bg-[#ec7f97]/10'}`}>
              <p className={`text-[10px] uppercase tracking-wide ${ok ? 'text-good' : 'text-[#ec7f97]'}`}>
                Ta réponse — {ok ? 'juste' : 'à revoir'}
              </p>
              <p className="text-sm text-ink">{answers[q.id]?.trim() || '—'}</p>
            </div>
            <div className="rounded-lg bg-panel-2 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-ink-3">Bonne réponse</p>
              <p className="text-sm text-ink">{q.answer}</p>
            </div>
          </div>
        </div>
        )
      })}
      <button onClick={onReplay} className="btn-ghost flex items-center gap-1.5 px-4 py-2 text-sm">
        <RotateCcw size={14} /> Rejouer ce niveau
      </button>
    </div>
  )
}

// ---- Révision de la semaine ------------------------------------------------

/** Les six évangiles du lundi au samedi qui précèdent le dernier dimanche.
 *  Un niveau par jour, 4 questions chacun, tous à la profondeur du niveau 4 :
 *  il s'agit de revoir ce qui a été travaillé, pas de recommencer une montée.
 *  Numérotés 5 à 10 — ils prolongent les 4 niveaux de l'évangile du jour.
 *  Ouverte le dimanche, elle reste disponible jusqu'au samedi suivant. */
function SemaineQuizCard({ forme, onClose }: { forme: FormeMesse; onClose: () => void }) {
  const s = useHorizon()
  const semaine = useMemo(() => revisionWeek(new Date()), [])
  type JourEvangile = { date: string; ref: string; texte: string }
  const [jours, setJours] = useState<(JourEvangile | null)[]>([])
  const [chargement, setChargement] = useState(true)
  const [actif, setActif] = useState<number | null>(null)
  const [quiz, setQuiz] = useState<GospelQuiz | null>(null)
  const [nonce, setNonce] = useState(0)
  const [busy, setBusy] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  // Les six évangiles (fetchMissel et fetchMass gardent chaque jour en cache local).
  useEffect(() => {
    let vivant = true
    setChargement(true)
    void Promise.all(semaine.days.map(async (d): Promise<JourEvangile | null> => {
      // Messe actuelle : AELF directement. Missel de 1962 : son propre, avec le
      // même repli que la lecture du jour (AELF si le propre est injoignable).
      let ev: MassReading | undefined
      if (forme === 'extraordinaire') {
        try { ev = misselReading(await fetchMissel(d), 'evangile') } catch { /* repli */ }
      }
      if (!ev) {
        try { ev = readingOfDay(await fetchMass(d), 'evangile') } catch { /* jour sans lecture */ }
      }
      return ev ? { date: d, ref: ev.ref, texte: ev.text } : null
    })).then((r) => { if (vivant) { setJours(r); setChargement(false) } })
    return () => { vivant = false }
  }, [semaine.sunday]) // eslint-disable-line react-hooks/exhaustive-deps

  const ouvrir = async (i: number) => {
    const j = jours[i]
    if (!j) return
    setErreur(null)
    const cle = WEEK_KEY(forme, semaine.sunday, i)
    const cache = localStorage.getItem(cle)
    if (cache) {
      try {
        setQuiz(JSON.parse(cache) as GospelQuiz); setActif(i); setNonce((n) => n + 1)
        return
      } catch { /* cache corrompu : on régénère */ }
    }
    setBusy(true)
    const r = await s.gospelQuiz(j.ref, j.texte, MAX_LEVEL, { verseRef: j.ref, format: 'revision' })
    setBusy(false)
    if (r.ok && r.quiz) {
      try { localStorage.setItem(cle, JSON.stringify(r.quiz)) } catch { /* quota */ }
      setQuiz(r.quiz); setActif(i); setNonce((n) => n + 1)
    } else {
      setErreur(r.error?.includes('ANTHROPIC') ? 'Quiz indisponible : clé API Anthropic à configurer.' : (r.error ?? 'Quiz indisponible.'))
    }
  }

  const disponibles = jours.filter(Boolean).length

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 font-medium">
            <CalendarDays size={16} className="text-sun" /> Révision de la semaine
          </h3>
          <p className="mt-0.5 text-xs text-ink-3">
            Les évangiles du lundi {fmtDate(parseISO(semaine.days[0] ?? semaine.sunday), 'd MMM', { locale: fr })} au
            samedi {fmtDate(parseISO(semaine.days[5] ?? semaine.sunday), 'd MMM', { locale: fr })} —
            un niveau par jour, 4 questions, tous à la profondeur du niveau {MAX_LEVEL}.
          </p>
        </div>
        <button onClick={onClose} className="btn-ghost shrink-0 px-2 py-1 text-xs text-ink-3">Fermer</button>
      </div>

      {chargement ? (
        <p className="mt-3 text-sm text-ink-3">Chargement des évangiles de la semaine…</p>
      ) : disponibles === 0 ? (
        <p className="mt-3 text-sm text-ink-3">
          Évangiles de la semaine indisponibles (le propre du missel n’a pas pu être chargé).
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {jours.map((j, i) => (
            <button key={semaine.days[i]} onClick={() => void ouvrir(i)} disabled={!j || busy}
              title={j ? `${j.ref} — ${fmtDate(parseISO(j.date), 'EEEE d MMMM', { locale: fr })}` : 'Évangile indisponible'}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-40 ${
                actif === i ? 'border-sun/50 bg-sun/15 text-sun-soft' : 'border-line text-ink-2 hover:bg-panel-2 hover:text-ink'
              }`}>
              <span className="font-medium">Niveau {MAX_LEVEL + 1 + i}</span>
              <span className="ml-1.5 text-xs capitalize text-ink-3">
                {fmtDate(parseISO(semaine.days[i] ?? semaine.sunday), 'EEE', { locale: fr })}
              </span>
            </button>
          ))}
          {busy && <RefreshCw size={14} className="animate-spin text-ink-3" />}
        </div>
      )}

      {erreur && <p className="mt-3 text-sm text-[#ec7f97]">{erreur}</p>}
      {quiz && actif !== null && jours[actif] && (
        <details key={`ev-${actif}`} open className="mt-3 rounded-lg border border-line bg-panel-2/40 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">
            Évangile du <span className="capitalize">{fmtDate(parseISO(jours[actif].date), 'EEEE d MMMM', { locale: fr })}</span>
            <span className="ml-1.5 text-ink-3">— {jours[actif].ref}</span>
          </summary>
          {enParagraphes(jours[actif].texte).map((para, i) => <p key={i} className="mt-2 text-sm leading-relaxed text-ink-2">{para}</p>)}
        </details>
      )}
      {quiz && actif !== null && (
        <Quiz key={`sem-${actif}-${nonce}`} quiz={quiz} level={MAX_LEVEL + 1 + actif}
          onReplay={() => void ouvrir(actif)} />
      )}
    </Card>
  )
}
