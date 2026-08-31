import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Brain, RefreshCw, RotateCcw, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { dailyScripturePlan, todayIso } from '../lib/logic'
import { readingOfDay, readingQuote, useMassOfDay, type MassReading } from '../lib/aelf'
import { misselReading, misselTitre, useMisselOfDay } from '../lib/missel'
import type { GospelQuiz } from '../lib/types'
import { Card, Badge } from '../components/ui'

const PASSAGE_KEY = (ref: string) => `horizon.gospel.passage.${ref}`
const QUIZ_KEY = (ref: string, lvl: number) => `horizon.gospel.quiz.${ref}.${lvl}`
const MAXLEVEL_KEY = (ref: string) => `horizon.gospel.maxlevel.${ref}`
const GENTS_KEY = (ref: string) => `horizon.gospel.gents.${ref}` // horodatage de la session de quiz
const RESET_MS = 3_600_000 // 1 h : au-delà, on repart au niveau 1 (quiz régénéré)
const MAX_LEVEL = 4        // au-delà, on tourne en rond : le quizz s'arrête là

export function EvangileView() {
  const today = todayIso()
  const plan = useMemo(() => dailyScripturePlan(new Date()), [])
  // Les lectures suivent le MISSEL DE 1962 : c'est le jour liturgique (fête,
  // dimanche après la Pentecôte…) qui commande, pas la date du calendrier.
  const { jour, loading, error } = useMisselOfDay(today)
  // Le psaume à apprendre reste tiré du lectionnaire AELF (le missel de 1962 a
  // un graduel, pas de psaume responsorial). AELF sert aussi de repli si le
  // propre est injoignable — et en mode démo, qui n'a pas de session Supabase.
  const { mass } = useMassOfDay(today)
  const duMissel = misselReading(jour, plan.kind)
  const reading = duMissel ?? readingOfDay(mass, plan.kind)
  const psaume = mass?.psaume

  // Un jour sur deux : psaume à apprendre. Sinon : la lecture du jour + quiz sur le sens.
  const psalmMode = plan.psalmDay && !!psaume

  return (
    <div className="rise space-y-4">
      <header className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sun/15 text-sun">
          <BookOpen size={18} />
        </span>
        <div>
          <h1 className="text-xl font-semibold">Écritures du jour</h1>
          <p className="text-xs text-ink-3">
            {psalmMode
              ? 'La lecture de la messe du jour, puis le psaume à apprendre par cœur.'
              : 'La lecture de la messe du jour, puis un quiz pour en saisir le sens.'}
          </p>
        </div>
      </header>

      <Card>
        {loading && !reading ? (
          <p className="text-sm text-ink-3">Chargement du propre du jour…</p>
        ) : !reading ? (
          <p className="text-sm text-ink-3">
            Propre du jour indisponible pour l’instant{error ? ` (${error})` : ''}.
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone={reading.type === 'evangile' ? 'sun' : 'info'}>
                {reading.type === 'evangile' ? 'Évangile' : 'Épître'}
              </Badge>
              <h2 className="font-semibold">{reading.ref}</h2>
              {duMissel && <span className="text-sm capitalize text-ink-3">— {misselTitre(jour)}</span>}
              {!duMissel && mass?.name && <span className="text-sm text-ink-3">— {mass.name}</span>}
            </div>

            {/* Citation courte — c'est celle qui s'affiche sur l'accueil. */}
            <blockquote className="border-l-2 border-sun/50 pl-3 text-[15px] italic leading-relaxed text-ink">
              « {readingQuote(reading).text} »
              <span className="mt-0.5 block text-xs not-italic text-ink-3">{reading.ref}</span>
            </blockquote>

            <div className="mt-4 border-t border-line pt-3">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Le texte en entier</p>
              {reading.text.split('\n\n').map((para, i) => (
                <p key={i} className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink">{para}</p>
              ))}
              <p className="mt-3 text-[11px] text-ink-3">
                {duMissel ? (
                  <>
                    Propre du jour selon le missel de 1962{jour?.titreLatin ? ` — ${jour.titreLatin}` : ''}.
                    {jour?.langue === 'la' && ' Traduction française indisponible pour ce jour : texte latin.'}
                  </>
                ) : (
                  <>Propre du missel injoignable{error ? ` (${error})` : ''} : lectures AELF affichées à la place.</>
                )}
              </p>
            </div>
          </>
        )}
      </Card>

      {psalmMode
        ? <PsalmCard psaume={psaume!} dayKey={today} />
        : reading && <SenseQuizCard reading={reading} />}
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
  const autoStarted = useRef(false)
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

  // À l'ouverture : on repart TOUJOURS au niveau 1. Si la dernière session date
  // de ≥ 1 h (ou passage différent), on purge le cache pour régénérer un quiz frais.
  useEffect(() => {
    if (autoStarted.current) return
    autoStarted.current = true
    const ts = Number(localStorage.getItem(GENTS_KEY(ref)) || 0)
    if (!ts || Date.now() - ts >= RESET_MS) {
      for (let l = 1; l <= maxLevelRef.current; l++) localStorage.removeItem(QUIZ_KEY(ref, l))
      localStorage.removeItem(MAXLEVEL_KEY(ref))
      maxLevelRef.current = 0; setMaxLevel(0)
      localStorage.setItem(GENTS_KEY(ref), String(Date.now()))
    }
    void startLevel(1)
  }, [ref]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card>
      <h3 className="flex items-center gap-1.5 font-medium"><Brain size={16} className="text-sun" /> Quizz sur le sens</h3>
      <p className="mt-0.5 text-xs text-ink-3">
        5 questions par niveau : 3 sur le sens et la leçon du passage, 2 textes à trous sur le verset
        clé. Chaque niveau creuse davantage,
        jusqu’au niveau {MAX_LEVEL}. Les niveaux déjà joués se rejouent sans coût.
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

// ---- Jours « psaume » : apprendre par cœur, puis texte à trous --------------

const MASK_RATIOS = [0.2, 0.4, 0.6, 0.85]

/** Générateur pseudo-aléatoire déterministe : même jour + même niveau = mêmes trous. */
function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) }
  return () => { h = (Math.imul(h, 48271) + 11) >>> 0; return h / 4294967296 }
}

/** Comparaison souple : casse, accents et ponctuation ignorés. */
function norm(w: string): string {
  return w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

interface Token { word: string; blank: boolean }

/** Découpe le psaume en lignes de mots, avec les trous du niveau demandé. */
function buildLines(text: string, level: number, dayKey: string): Token[][] {
  const ratio = MASK_RATIOS[Math.min(level, MASK_RATIOS.length) - 1] ?? 0.2
  const rand = seeded(`${dayKey}|${level}`)
  return text.split('\n').filter((l) => l.trim()).map((line) => {
    const words = line.trim().split(/\s+/)
    // Au moins un trou par ligne dès le niveau 2, sinon on suit le taux.
    const idx = words.map((_, i) => i).filter(() => rand() < ratio)
    if (idx.length === 0 && level >= 2 && words.length > 0) idx.push(Math.floor(rand() * words.length))
    const set = new Set(idx)
    return words.map((word, wi) => ({ word, blank: set.has(wi) }))
  })
}

function PsalmCard({ psaume, dayKey }: { psaume: MassReading; dayKey: string }) {
  const [level, setLevel] = useState(1)
  const [showText, setShowText] = useState(true)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [validated, setValidated] = useState(false)
  const lines = useMemo(() => buildLines(psaume.text, level, dayKey), [psaume.text, level, dayKey])

  const reset = (lvl: number) => { setLevel(lvl); setAnswers({}); setValidated(false) }

  const blanks = lines.flatMap((l, li) => l.map((t, wi) => ({ ...t, key: `${li}-${wi}` })).filter((t) => t.blank))
  const correct = blanks.filter((b) => norm(answers[b.key] ?? '') === norm(b.word)).length

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 font-medium"><Brain size={16} className="text-sun" /> Psaume à apprendre</h3>
        <Badge tone="info">{psaume.ref}</Badge>
      </div>
      <p className="mt-0.5 text-xs text-ink-3">
        Le psaume de la messe du jour. On le lit, puis on le retrouve de mémoire : à chaque niveau, il manque plus de mots.
      </p>

      {psaume.refrain && (
        <blockquote className="mt-3 border-l-2 border-sun/50 pl-3 text-[15px] italic leading-relaxed text-ink">
          « {psaume.refrain} »
          {psaume.refrainRef && <span className="mt-0.5 block text-xs not-italic text-ink-3">{psaume.refrainRef}</span>}
        </blockquote>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Le texte</p>
          <button onClick={() => setShowText((v) => !v)} className="btn-ghost flex items-center gap-1.5 px-2 py-1 text-xs">
            {showText ? <><EyeOff size={13} /> Masquer</> : <><Eye size={13} /> Afficher</>}
          </button>
        </div>
        {showText
          ? psaume.text.split('\n\n').map((para, i) => (
              <p key={i} className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink">{para}</p>
            ))
          : <p className="text-sm text-ink-3">Texte masqué — à toi de jouer.</p>}
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {MASK_RATIOS.map((r, i) => (
            <button key={i} onClick={() => reset(i + 1)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                level === i + 1 ? 'border-sun/50 bg-sun/15 text-sun-soft' : 'border-line text-ink-2 hover:bg-panel-2 hover:text-ink'
              }`}>
              Niveau {i + 1} <span className="text-[11px] opacity-70">({Math.round(r * 100)} %)</span>
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-1.5">
          {lines.map((line, li) => (
            <p key={li} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[15px] leading-relaxed text-ink">
              {line.map((t, wi) => {
                const key = `${li}-${wi}`
                if (!t.blank) return <span key={key}>{t.word}</span>
                const given = answers[key] ?? ''
                const ok = norm(given) === norm(t.word)
                return (
                  <input key={key} value={given} disabled={validated}
                    onChange={(e) => setAnswers((a) => ({ ...a, [key]: e.target.value }))}
                    style={{ width: `${Math.max(4, t.word.length + 1)}ch` }}
                    aria-label={`Mot manquant ${wi + 1}`}
                    className={`field px-1.5 py-0.5 text-center text-[14px] ${
                      validated ? (ok ? 'border-good/60 bg-good/10' : 'border-[#ec7f97]/60 bg-[#ec7f97]/10') : ''
                    }`} />
                )
              })}
            </p>
          ))}
        </div>

        {validated ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-ink-2">{correct} / {blanks.length} mots retrouvés.</p>
            {blanks.some((b) => norm(answers[b.key] ?? '') !== norm(b.word)) && (
              <p className="text-sm text-ink-3">
                À revoir : {blanks.filter((b) => norm(answers[b.key] ?? '') !== norm(b.word)).map((b) => b.word).join(', ')}
              </p>
            )}
            <button onClick={() => reset(level)} className="btn-ghost flex items-center gap-1.5 px-4 py-2 text-sm">
              <RotateCcw size={14} /> Recommencer ce niveau
            </button>
          </div>
        ) : (
          <button onClick={() => setValidated(true)} disabled={blanks.length === 0}
            className="btn-sun mt-3 flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-50">
            Vérifier <ChevronRight size={15} />
          </button>
        )}
      </div>
    </Card>
  )
}
