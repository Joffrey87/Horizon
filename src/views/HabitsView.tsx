import { useState } from 'react'
import { subDays } from 'date-fns'
import { Plus, CheckCircle2, Circle, Clock } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { habitStats, iso, todayIso } from '../lib/logic'
import { Card, DomainDot, Modal, EmptyState } from '../components/ui'
import { TrendBars } from '../components/charts'
import type { AnchorState, Habit } from '../lib/types'

const ANCHOR_LABEL: Record<AnchorState, string> = {
  nouvelle: 'Nouvelle', consolidation: 'En consolidation', stable: 'Stable', a_revoir: 'À revoir',
}

const DAYS: [string, string][] = [['1', 'L'], ['2', 'M'], ['3', 'M'], ['4', 'J'], ['5', 'V'], ['6', 'S'], ['7', 'D']]

export function HabitsView() {
  const s = useHorizon()
  const [editing, setEditing] = useState<Habit | 'new' | null>(null)
  const today = todayIso()
  const active = s.habits.filter((h) => h.active)
  const archived = s.habits.filter((h) => !h.active)
  const newCount = active.filter((h) => h.anchor_state === 'nouvelle').length

  return (
    <div className="rise space-y-4 pt-4">
      {/* Entête cliquable : un clic ici crée une habitude */}
      <header onClick={() => setEditing('new')}
        className="flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-xl px-1 py-1 transition-colors hover:bg-panel-2/40"
        title="Cliquer pour ajouter une habitude">
        <div>
          <h1 className="text-xl font-semibold">Habitudes</h1>
          <p className="text-sm text-ink-3">Qu'est-ce qui doit devenir automatique ? Clique ici (ou dans le vide) pour en ajouter une.</p>
        </div>
        <button onClick={(e) => { e.stopPropagation(); setEditing('new') }} className="btn-sun flex items-center gap-1.5 px-4 py-2 text-sm">
          <Plus size={15} /> Nouvelle habitude
        </button>
      </header>

      {newCount > 1 && (
        <p className="text-xs text-[#eda145]">
          {newCount} nouvelles habitudes en même temps : la méthode Horizon conseille d'en ancrer une seule à la fois (2-3 mois).
        </p>
      )}

      {active.length === 0 ? (
        <Card onClick={() => setEditing('new')} className="cursor-pointer">
          <EmptyState hint="Rangement, courses, sport, prière… : clique pour créer ta première habitude.">
            Aucune habitude suivie pour l'instant.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {active.map((h) => {
            const domain = s.domains.find((d) => d.id === h.domain_id)
            const st = habitStats(h, s.habitLogs)
            const days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i))
            return (
              <Card key={h.id} onClick={() => setEditing(h)} className="card-hover flex min-h-52 cursor-pointer flex-col">
                <div className="flex min-w-0 items-center gap-2">
                  {domain && <DomainDot color={domain.color} />}
                  <h3 className="truncate font-medium">{h.title}</h3>
                </div>

                <div className="mt-auto space-y-3 pt-4">
                  {/* 7 derniers jours */}
                  <div className="flex justify-between gap-1" onClick={(e) => e.stopPropagation()}>
                    {days.map((d) => {
                      const dIso = iso(d)
                      const done = s.habitLogs.some((l) => l.habit_id === h.id && l.log_date === dIso && l.done)
                      return (
                        <button key={dIso} onClick={() => void s.toggleHabitToday(h.id, dIso)}
                          title={dIso} aria-label={`${dIso} : ${done ? 'fait' : 'non fait'}`}
                          className="transition-transform hover:scale-110">
                          {done ? <CheckCircle2 size={18} className="text-[#4cc79a]" />
                            : <Circle size={18} className={dIso === today ? 'text-sun/60' : 'text-line-2'} />}
                        </button>
                      )
                    })}
                  </div>
                  {/* Tendance 4 semaines */}
                  <div>
                    <TrendBars values={st.trend4w} color={domain?.color ?? '#d97706'} />
                    <p className="mt-1 flex items-center justify-between text-[10px] text-ink-3">
                      <span>4 semaines</span>
                      <span className="tabular-nums">{st.doneThisWeek}/{st.target}</span>
                    </p>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {archived.length > 0 && (
        <details className="text-sm text-ink-3">
          <summary className="cursor-pointer">Habitudes archivées ({archived.length})</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {archived.map((h) => (
              <button key={h.id} onClick={() => setEditing(h)} className="btn-ghost px-3 py-1 text-xs">{h.title}</button>
            ))}
          </div>
        </details>
      )}

      <HabitForm state={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function HabitForm({ state, onClose }: { state: Habit | 'new' | null; onClose: () => void }) {
  const s = useHorizon()
  const habit = state === 'new' ? null : state
  const [form, setForm] = useState<Record<string, unknown> | null>(null)
  if (!state) return null

  const current = form ?? {
    title: habit?.title ?? '',
    domain_id: habit?.domain_id ?? s.domains[0]?.id ?? '',
    mode: habit?.weekdays ? 'jours' : 'frequence',
    frequency_type: habit?.frequency_type ?? 'daily',
    weekly_target: habit?.weekly_target ?? 3,
    weekdays: habit?.weekdays ?? '',
    time_of_day: habit?.time_of_day ?? '',
    anchor_state: habit?.anchor_state ?? 'nouvelle',
    active: habit?.active ?? true,
    description: habit?.description ?? '',
  }
  const setF = (k: string, v: unknown) => setForm({ ...current, [k]: v })
  const close = () => { setForm(null); onClose() }

  const selectedDays = String(current.weekdays).split(',').filter(Boolean)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const jours = current.mode === 'jours'
    const values = {
      title: (current.title as string).trim(),
      domain_id: current.domain_id,
      frequency_type: jours ? 'weekly' : current.frequency_type,
      weekly_target: jours
        ? (selectedDays.length || 1)
        : current.frequency_type === 'daily' ? 7 : Number(current.weekly_target),
      weekdays: jours ? (selectedDays.sort().join(',') || null) : null,
      time_of_day: (current.time_of_day as string) || null,
      anchor_state: current.anchor_state,
      active: current.active,
      description: (current.description as string).trim() || null,
    }
    if (habit) await s.update('habits', habit.id, values)
    else await s.insert('habits', values)
    close()
  }

  return (
    <Modal open onClose={close} title={habit ? 'Modifier l’habitude' : 'Nouvelle habitude'}>
      <form onSubmit={save} className="space-y-3">
        <input required value={current.title as string}
          onChange={(e) => setF('title', e.target.value)}
          placeholder="Routine simple et réaliste" className="field" autoFocus />

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs text-ink-3">
            Domaine
            <select value={current.domain_id as string} onChange={(e) => setF('domain_id', e.target.value)} className="field">
              {s.domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-ink-3">
            Rythme
            <select value={current.mode as string} onChange={(e) => setF('mode', e.target.value)} className="field">
              <option value="frequence">Une fréquence</option>
              <option value="jours">Des jours précis</option>
            </select>
          </label>
        </div>

        {current.mode === 'frequence' ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs text-ink-3">
              Fréquence
              <select value={current.frequency_type as string} onChange={(e) => setF('frequency_type', e.target.value)} className="field">
                <option value="daily">Chaque jour</option>
                <option value="weekly">X fois par semaine</option>
              </select>
            </label>
            {current.frequency_type === 'weekly' && (
              <label className="space-y-1 text-xs text-ink-3">
                Objectif : {current.weekly_target as number}× / sem.
                <input type="range" min={1} max={7} value={current.weekly_target as number}
                  onChange={(e) => setF('weekly_target', Number(e.target.value))} className="w-full accent-[#f59e0b]" />
              </label>
            )}
          </div>
        ) : (
          <div className="space-y-1 text-xs text-ink-3">
            Jours de la semaine
            <div className="flex gap-1">
              {DAYS.map(([v, l]) => (
                <button key={v} type="button"
                  onClick={() => {
                    const next = selectedDays.includes(v) ? selectedDays.filter((x) => x !== v) : [...selectedDays, v]
                    setF('weekdays', next.sort().join(','))
                  }}
                  className={`h-9 flex-1 rounded-lg border text-xs transition-colors ${
                    selectedDays.includes(v) ? 'border-sun bg-sun/15 text-sun-soft' : 'border-line-2 text-ink-3'
                  }`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-xs text-ink-3">
          <Clock size={14} /> Heure (optionnelle)
          <input type="time" value={current.time_of_day as string}
            onChange={(e) => setF('time_of_day', e.target.value)} className="field w-auto" />
        </label>

        <label className="block space-y-1 text-xs text-ink-3">
          État d'ancrage (à réviser pendant la revue mensuelle)
          <select value={current.anchor_state as string} onChange={(e) => setF('anchor_state', e.target.value)} className="field">
            {Object.entries(ANCHOR_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={current.active as boolean}
            onChange={(e) => setF('active', e.target.checked)} className="accent-[#f59e0b]" />
          Habitude suivie actuellement
        </label>

        <div className="flex justify-between gap-2 pt-1">
          {habit ? (
            <button type="button" onClick={() => { void s.remove('habits', habit.id); close() }}
              className="btn-ghost px-3 py-2 text-sm text-[#ec7f97]">Supprimer</button>
          ) : <span />}
          <button type="submit" className="btn-sun px-5 py-2">{habit ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </form>
    </Modal>
  )
}
