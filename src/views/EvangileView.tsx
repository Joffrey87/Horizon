import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Brain, RefreshCw, RotateCcw, ChevronRight } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { scriptureOfDay } from '../lib/logic'
import { fetchPassage } from '../lib/bible'
import type { GospelQuiz } from '../lib/types'
import { Card, Badge } from '../components/ui'

const PASSAGE_KEY = (ref: string) => `horizon.gospel.passage.${ref}`
const QUIZ_KEY = (ref: string, lvl: number) => `horizon.gospel.quiz.${ref}.${lvl}`
const MAXLEVEL_KEY = (ref: string) => `horizon.gospel.maxlevel.${ref}`

/** Découpe un passage « [n] texte… » en versets, pour afficher les n° en petit gris. */
function parseVerses(passage: string): { n: string; text: string }[] {
  return passage
    .split(/(?=\[\d+\])/)
    .map((chunk) => {
      const m = chunk.match(/^\[(\d+)\]\s*([\s\S]*)$/)
      return m ? { n: m[1]!, text: m[2]!.trim() } : { n: '', text: chunk.trim() }
    })
    .filter((v) => v.text)
}

export function EvangileView() {
  const s = useHorizon()
  const daily = useMemo(() => scriptureOfDay(new Date()), [])

  const [passage, setPassage] = useState<string | null>(null)
  const [loadingPassage, setLoadingPassage] = useState(true)
  const [passageError, setPassageError] = useState<string | null>(null)

  // Niveaux de quiz : chaque niveau généré est mis en cache et rejouable sans coût.
  const [maxLevel, setMaxLevel] = useState(() => Number(localStorage.getItem(MAXLEVEL_KEY(daily.reference)) ?? '0'))
  const [activeLevel, setActiveLevel] = useState<number | null>(null)
  const [activeQuiz, setActiveQuiz] = useState<GospelQuiz | null>(null)
  const [playNonce, setPlayNonce] = useState(0)
  const [quizBusy, setQuizBusy] = useState(false)
  const [quizError, setQuizError] = useState<string | null>(null)
  const inflight = useRef<Set<number>>(new Set())
  const autoStarted = useRef(false)

  // Passage complet depuis getbible.net (Segond 1910, sans clé), cache par référence.
  useEffect(() => {
    let alive = true
    const cached = localStorage.getItem(PASSAGE_KEY(daily.reference))
    if (cached) { setPassage(cached); setLoadingPassage(false); return }
    setLoadingPassage(true); setPassageError(null)
    fetchPassage({ book: daily.book, chapter: daily.chapter, start: daily.start, end: daily.end })
      .then((text) => {
        if (!alive) return
        localStorage.setItem(PASSAGE_KEY(daily.reference), text); setPassage(text)
      })
      .catch((e) => { if (alive) setPassageError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (alive) setLoadingPassage(false) })
    return () => { alive = false }
  }, [daily.reference]) // eslint-disable-line react-hooks/exhaustive-deps

  const getCached = (level: number): GospelQuiz | null => {
    try {
      const raw = localStorage.getItem(QUIZ_KEY(daily.reference, level))
      return raw ? JSON.parse(raw) as GospelQuiz : null
    } catch { return null }
  }

  // Génère (ou renvoie depuis le cache) un niveau. Un seul appel par niveau.
  const generateLevel = async (level: number, silent = false): Promise<GospelQuiz | null> => {
    const cached = getCached(level)
    if (cached) return cached
    if (inflight.current.has(level)) return null
    inflight.current.add(level); setQuizBusy(true)
    const r = await s.gospelQuiz(daily.reference, passage ?? '', level)
    inflight.current.delete(level); setQuizBusy(false)
    if (r.ok && r.quiz) {
      localStorage.setItem(QUIZ_KEY(daily.reference, level), JSON.stringify(r.quiz))
      if (level > maxLevel) { setMaxLevel(level); localStorage.setItem(MAXLEVEL_KEY(daily.reference), String(level)) }
      return r.quiz
    }
    if (!silent) setQuizError(r.error?.includes('ANTHROPIC') ? 'Quiz indisponible : clé API Anthropic à configurer.' : (r.error ?? 'Quiz indisponible.'))
    return null
  }

  // Ouvre un niveau (depuis le cache = gratuit, sinon 1 génération).
  const startLevel = async (level: number) => {
    setQuizError(null)
    const q = await generateLevel(level)
    if (q) { setActiveLevel(level); setActiveQuiz(q); setPlayNonce((n) => n + 1) }
  }

  // Prépare un niveau en arrière-plan sans l'ouvrir (pré-génération silencieuse).
  const prefetchLevel = (level: number) => { void generateLevel(level, true) }

  // Niveau 1 lancé automatiquement à chaque jour (nouvelle référence = nouvelle
  // génération ; même jour = repris du cache, gratuit).
  useEffect(() => {
    if (loadingPassage || autoStarted.current) return
    autoStarted.current = true
    void startLevel(1)
  }, [loadingPassage]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rise space-y-4">
      <header className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sun/15 text-sun">
          <BookOpen size={18} />
        </span>
        <div>
          <h1 className="text-xl font-semibold">Écritures du jour</h1>
          <p className="text-xs text-ink-3">Le verset du jour, développé, puis un quiz pour en saisir le sens.</p>
        </div>
      </header>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge tone={daily.testament === 'AT' ? 'info' : 'sun'}>
            {daily.testament === 'AT' ? 'Ancien Testament' : 'Nouveau Testament'}
          </Badge>
          <h2 className="font-semibold">{daily.reference}</h2>
          <span className="text-sm text-ink-3">— {daily.title}</span>
        </div>

        {/* Verset clé — toujours affiché (intégré à l'app, sans IA). C'est la citation de l'accueil. */}
        <blockquote className="border-l-2 border-sun/50 pl-3 text-[15px] italic leading-relaxed text-ink">
          « {daily.verse} »
          <span className="mt-0.5 block text-xs not-italic text-ink-3">{daily.verseRef}</span>
        </blockquote>

        {/* Passage complet — texte public (getbible.net, Segond 1910), sans IA. */}
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Le passage en entier</p>
          {loadingPassage ? (
            <p className="text-sm text-ink-3">Chargement du passage…</p>
          ) : passageError ? (
            <p className="text-sm text-ink-3">Passage complet indisponible pour l’instant ({passageError}). Le verset ci-dessus reste consultable.</p>
          ) : (
            <>
              <p className="text-[15px] leading-relaxed text-ink">
                {parseVerses(passage ?? '').map((v) => (
                  <span key={v.n}>
                    {v.n && <sup className="mr-0.5 align-super text-[10px] font-normal text-ink-3">{v.n}</sup>}
                    {v.text}{' '}
                  </span>
                ))}
              </p>
              <p className="mt-3 text-[11px] text-ink-3">Traduction Louis Segond 1910 (domaine public).</p>
            </>
          )}
        </div>
      </Card>

      <Card>
        <h3 className="flex items-center gap-1.5 font-medium"><Brain size={16} className="text-sun" /> Quizz sur le sens</h3>
        <p className="mt-0.5 text-xs text-ink-3">
          3 questions par niveau, sur le sens et la leçon du passage. Chaque niveau creuse davantage.
          Les niveaux déjà joués se rejouent sans coût.
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
          <button onClick={() => void startLevel(maxLevel + 1)} disabled={quizBusy || loadingPassage}
            className="btn-sun flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50">
            {quizBusy ? <RefreshCw size={14} className="animate-spin" /> : <Brain size={14} />}
            {maxLevel === 0 ? 'Lancer le quizz' : `Niveau ${maxLevel + 1} (nouveau)`}
          </button>
        </div>

        {quizError && <p className="mt-3 text-sm text-[#ec7f97]">{quizError}</p>}
        {activeQuiz && activeLevel !== null && (
          <Quiz key={`${activeLevel}-${playNonce}`} quiz={activeQuiz} level={activeLevel}
            onReplay={() => void startLevel(activeLevel)}
            onValidate={() => prefetchLevel(activeLevel + 1)} />
        )}
      </Card>
    </div>
  )
}

/** Quiz d'un niveau : les 3 questions sur la même page. On valide en une fois,
 *  puis récap « ta réponse » / « bonne réponse » côte à côte (sans notation). */
function Quiz({ quiz, level, onReplay, onValidate }: {
  quiz: GospelQuiz; level: number; onReplay: () => void; onValidate: () => void
}) {
  const qs = quiz.questions
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [validated, setValidated] = useState(false)
  const allAnswered = qs.every((q) => (answers[q.id] ?? '').trim())

  // À la validation du niveau, on prépare le niveau suivant en arrière-plan.
  useEffect(() => { if (validated) onValidate() }, [validated]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Récap : ta réponse vs bonne réponse, côte à côte.
  return (
    <div className="mt-4 space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Niveau {level} — tes réponses</p>
      {qs.map((q, i) => (
        <div key={q.id} className="space-y-1.5">
          <p className="text-sm font-medium">{i + 1}. {q.question}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-panel-2 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-ink-3">Ta réponse</p>
              <p className="text-sm text-ink">{answers[q.id]?.trim() || '—'}</p>
            </div>
            <div className="rounded-lg border border-good/40 bg-good/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-good">Bonne réponse</p>
              <p className="text-sm text-ink">{q.answer}</p>
            </div>
          </div>
        </div>
      ))}
      <button onClick={onReplay} className="btn-ghost flex items-center gap-1.5 px-4 py-2 text-sm">
        <RotateCcw size={14} /> Rejouer ce niveau
      </button>
    </div>
  )
}
