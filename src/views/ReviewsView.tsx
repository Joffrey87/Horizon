import { useMemo, useState } from 'react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { ClipboardCheck, ChevronRight } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { habitStats, suggestedReview, todayIso } from '../lib/logic'
import { Card, Badge, DomainDot, EmptyState } from '../components/ui'
import type { AnchorState, ReviewKind } from '../lib/types'

const KIND_META: Record<ReviewKind, { title: string; subtitle: string }> = {
  hebdo: { title: 'Revue du samedi', subtitle: 'Je conçois ma semaine : projets, habitudes, idées, capacité.' },
  confirmation: { title: 'Confirmation du dimanche', subtitle: 'Je confirme la semaine que je vais réellement suivre — sans refaire la revue.' },
  mensuelle: { title: 'Revue mensuelle', subtitle: 'L’ancrage des habitudes tient-il vraiment ? Changements avec parcimonie.' },
}

export function ReviewsView() {
  const s = useHorizon()
  const [running, setRunning] = useState<ReviewKind | null>(null)
  const suggestion = suggestedReview()

  if (running) return <ReviewWizard kind={running} onDone={() => setRunning(null)} />

  return (
    <div className="rise space-y-4 pt-4">
      <header>
        <h1 className="text-xl font-semibold">Revues</h1>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        {(Object.keys(KIND_META) as ReviewKind[]).map((kind) => (
          <button key={kind} onClick={() => setRunning(kind)}
            className={`card card-hover p-4 text-left ${suggestion.kind === kind ? '!border-sun/60' : ''}`}>
            <div className="flex items-center justify-between">
              <ClipboardCheck size={18} className={suggestion.kind === kind ? 'text-sun' : 'text-ink-3'} />
              {suggestion.kind === kind && <Badge tone="sun">aujourd'hui</Badge>}
            </div>
            <h3 className="mt-3 font-medium">{KIND_META[kind].title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-3">{KIND_META[kind].subtitle}</p>
          </button>
        ))}
      </div>

      <Card title="Historique">
        {s.reviews.length === 0 ? (
          <EmptyState hint="Rituel : samedi je conçois, dimanche je confirme.">Aucune revue pour l'instant.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {s.reviews.slice(0, 10).map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink-2">{KIND_META[r.kind].title}</span>
                <span className="flex items-center gap-2 text-xs text-ink-3">
                  {r.review_date}
                  {r.completed ? <Badge tone="good">faite</Badge> : <Badge tone="warn">inachevée</Badge>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

/* ================= Assistant de revue guidée ================= */

function ReviewWizard({ kind, onDone }: { kind: ReviewKind; onDone: () => void }) {
  const s = useHorizon()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [focusIds, setFocusIds] = useState<string[]>(() => {
    if (kind !== 'confirmation') return []
    const lastHebdo = s.reviews.find((r) => r.kind === 'hebdo' && r.completed)
    return lastHebdo?.week_focus ?? []
  })

  const openTasks = useMemo(() => s.tasks.filter((t) =>
    (t.status === 'a_faire' || t.status === 'en_cours') && !t.is_recurring), [s.tasks])

  const steps = kind === 'hebdo'
    ? ['Projets', 'Habitudes', 'Idées', 'Focus de la semaine', 'Conclure']
    : kind === 'confirmation'
      ? ['Confirmer le focus', 'Conclure']
      : ['Ancrage des habitudes', 'Charge globale', 'Conclure']

  const finish = async () => {
    await s.insert('reviews', {
      kind, review_date: todayIso(), answers, week_focus: focusIds, completed: true,
    })
    onDone()
  }

  const Note = ({ k, placeholder }: { k: string; placeholder: string }) => (
    <textarea rows={2} className="field mt-3" placeholder={placeholder}
      value={answers[k] ?? ''} onChange={(e) => setAnswers({ ...answers, [k]: e.target.value })} />
  )

  return (
    <div className="rise mx-auto max-w-2xl space-y-4 pt-4">
      <header>
        <p className="block-title">{KIND_META[kind].title} — étape {step + 1}/{steps.length}</p>
        <h1 className="mt-1 text-xl font-semibold">{steps[step]}</h1>
      </header>
      <div className="h-1 overflow-hidden rounded-full bg-panel-3">
        <div className="h-full bg-gradient-to-r from-[#f59e0b] to-[#ea580c] transition-all"
          style={{ width: `${(100 * (step + 1)) / steps.length}%` }} />
      </div>

      <Card>
        {/* ---------- HEBDO ---------- */}
        {kind === 'hebdo' && step === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-ink-2">Pour chaque projet actif : progression, blocage, prochaine action.</p>
            {s.projects.filter((p) => p.status === 'actif').map((p) => {
              const domain = s.domains.find((d) => d.id === p.domain_id)
              const calm = differenceInCalendarDays(new Date(), parseISO(p.last_activity_at))
              return (
                <div key={p.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-center gap-2">
                    {domain && <DomainDot color={domain.color} />}
                    <p className="flex-1 text-sm font-medium">{p.title}</p>
                    <span className="text-xs tabular-nums text-ink-3">{p.progress}%</span>
                  </div>
                  {calm >= 10 && <p className="mt-1 text-xs text-[#eda145]">Calme depuis {calm} j — toujours d'actualité ?</p>}
                  <input className="field mt-2 text-sm" placeholder="+ Ajouter une tâche pour la semaine"
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v) {
                        void s.insert('tasks', { title: v, project_id: p.id, status: 'a_faire', is_task: true, sort_order: -1 })
                        e.target.value = ''
                      }
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
                </div>
              )
            })}
            <Note k="projets" placeholder="Ce que je retiens sur mes projets…" />
          </div>
        )}
        {kind === 'hebdo' && step === 1 && (
          <HabitCheck note={<Note k="habitudes" placeholder="Ce qui tient, ce qui se dégrade…" />} />
        )}
        {kind === 'hebdo' && step === 2 && (
          <div className="space-y-2">
            <p className="text-sm text-ink-2">
              {s.ideas.filter((i) => i.status === 'active').length} idée(s) à trier.
              Parcourir sans tout transformer en travail actif — la vue Priorités sert à décider.
            </p>
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {s.ideas.filter((i) => i.status === 'active').slice(0, 12).map((i) => (
                <li key={i.id} className="truncate text-sm text-ink-3">• {i.title}</li>
              ))}
            </ul>
            <Note k="idees" placeholder="Idées marquantes, à décider samedi prochain…" />
          </div>
        )}
        {kind === 'hebdo' && step === 3 && (
          <FocusPicker tasks={openTasks} focusIds={focusIds} setFocusIds={setFocusIds} />
        )}
        {kind === 'hebdo' && step === 4 && (
          <div>
            <p className="text-sm text-ink-2">
              Le plan est conçu. Demain, la confirmation du dimanche le transformera en engagement.
            </p>
            <Note k="conclusion" placeholder="Cohérence planning / capacité réelle ?" />
          </div>
        )}

        {/* ---------- CONFIRMATION ---------- */}
        {kind === 'confirmation' && step === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-ink-2">
              Le plan du samedi, simplement confirmé ou légèrement ajusté. De la réflexion à l'engagement.
            </p>
            <FocusPicker tasks={openTasks} focusIds={focusIds} setFocusIds={setFocusIds} />
          </div>
        )}
        {kind === 'confirmation' && step === 1 && (
          <div>
            <p className="text-sm text-ink-2">Je confirme la semaine que je vais réellement suivre.</p>
            <Note k="engagement" placeholder="Un mot d'engagement (optionnel)" />
          </div>
        )}

        {/* ---------- MENSUELLE ---------- */}
        {kind === 'mensuelle' && step === 0 && (
          <MonthlyAnchor note={<Note k="ancrage" placeholder="Simplifier, maintenir ou remplacer ?" />} />
        )}
        {kind === 'mensuelle' && step === 1 && (
          <div className="space-y-2">
            <p className="text-sm text-ink-2">
              {s.projects.filter((p) => p.status === 'actif').length} projets actifs
              (seuil : {s.settings?.wip_limit ?? 5}) ·{' '}
              {s.habits.filter((h) => h.active).length} habitudes suivies ·{' '}
              {s.ideas.filter((i) => i.status === 'active').length} idées à trier.
            </p>
            <p className="text-xs text-ink-3">
              Une nouvelle habitude ou amélioration mérite-t-elle d'être introduite ce mois-ci ? Une seule, au plus.
            </p>
            <Note k="charge" placeholder="Décisions du mois (avec parcimonie)…" />
          </div>
        )}
        {kind === 'mensuelle' && step === 2 && (
          <div>
            <p className="text-sm text-ink-2">Éviter les changements permanents de système : Horizon doit rester simple.</p>
            <Note k="conclusion" placeholder="Ce que je garde tel quel ce mois-ci…" />
          </div>
        )}
      </Card>

      <div className="flex justify-between">
        <button onClick={() => (step === 0 ? onDone() : setStep(step - 1))} className="btn-ghost px-4 py-2 text-sm">
          {step === 0 ? 'Annuler' : 'Retour'}
        </button>
        {step < steps.length - 1 ? (
          <button onClick={() => setStep(step + 1)} className="btn-sun flex items-center gap-1 px-5 py-2">
            Continuer <ChevronRight size={15} />
          </button>
        ) : (
          <button onClick={() => void finish()} className="btn-sun px-5 py-2">
            {kind === 'confirmation' ? 'Je m’engage sur cette semaine' : 'Terminer la revue'}
          </button>
        )}
      </div>
    </div>
  )
}

function FocusPicker({ tasks, focusIds, setFocusIds }: {
  tasks: ReturnType<typeof useHorizon.getState>['tasks']
  focusIds: string[]; setFocusIds: (ids: string[]) => void
}) {
  const s = useHorizon()
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-2">
        Les quelques priorités de la semaine ({focusIds.length} sélectionnée{focusIds.length > 1 ? 's' : ''}) —
        viser 3 à 5, pas plus.
      </p>
      {focusIds.length > 5 && <p className="text-xs text-[#eda145]">Plus de 5 : est-ce encore un focus ?</p>}
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {tasks.map((t) => {
          const domain = s.domains.find((d) => d.id ===
            (t.domain_id ?? s.projects.find((p) => p.id === t.project_id)?.domain_id))
          const on = focusIds.includes(t.id)
          return (
            <li key={t.id}>
              <button onClick={() => setFocusIds(on ? focusIds.filter((x) => x !== t.id) : [...focusIds, t.id])}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  on ? 'border-sun/60 bg-sun/10 text-ink' : 'border-line text-ink-2 hover:border-line-2'
                }`}>
                {domain && <DomainDot color={domain.color} size={7} />}
                <span className="flex-1 truncate">{t.title}</span>
                {on && <span className="text-sun-soft">✓</span>}
              </button>
            </li>
          )
        })}
        {tasks.length === 0 && <p className="text-xs text-ink-3">Aucune tâche ouverte : crée-les dans « Temps » ou depuis un projet.</p>}
      </ul>
    </div>
  )
}

function HabitCheck({ note }: { note: React.ReactNode }) {
  const s = useHorizon()
  return (
    <div className="space-y-2">
      {s.habits.filter((h) => h.active).map((h) => {
        const st = habitStats(h, s.habitLogs)
        const pct = Math.round(100 * (st.trend4w.reduce((a, b) => a + b, 0) / 4))
        return (
          <div key={h.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
            <span className="text-ink-2">{h.title}</span>
            <Badge tone={pct >= 70 ? 'good' : pct >= 40 ? 'warn' : 'bad'}>{pct}% sur 4 sem.</Badge>
          </div>
        )
      })}
      {note}
    </div>
  )
}

function MonthlyAnchor({ note }: { note: React.ReactNode }) {
  const s = useHorizon()
  const STATES: AnchorState[] = ['nouvelle', 'consolidation', 'stable', 'a_revoir']
  const LABEL: Record<AnchorState, string> = {
    nouvelle: 'Nouvelle', consolidation: 'Consolidation', stable: 'Stable', a_revoir: 'À revoir',
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">Pour chaque habitude : est-ce que ça tient réellement ?</p>
      {s.habits.filter((h) => h.active).map((h) => {
        const st = habitStats(h, s.habitLogs)
        const pct = Math.round(100 * (st.trend4w.reduce((a, b) => a + b, 0) / 4))
        return (
          <div key={h.id} className="rounded-xl border border-line p-3">
            <div className="flex items-center justify-between text-sm">
              <span>{h.title}</span>
              <span className="text-xs text-ink-3">{pct}% sur 4 sem. · {Math.floor(st.ageDays / 30)} mois</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {STATES.map((state) => (
                <button key={state} onClick={() => void s.update('habits', h.id, { anchor_state: state })}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    h.anchor_state === state ? 'border-sun bg-sun/10 text-sun-soft' : 'border-line-2 text-ink-3'
                  }`}>
                  {LABEL[state]}
                </button>
              ))}
            </div>
          </div>
        )
      })}
      {note}
    </div>
  )
}
