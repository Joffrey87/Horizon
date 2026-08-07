import { useState } from 'react'
import { differenceInCalendarDays, parseISO, subDays } from 'date-fns'
import { Plus, Pencil, CheckCircle2, Circle } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { habitStats, iso, todayIso } from '../lib/logic'
import { Card, Badge, DomainDot, Modal, EmptyState } from '../components/ui'
import { TrendBars } from '../components/charts'
import type { AnchorState, Habit } from '../lib/types'

const ANCHOR_LABEL: Record<AnchorState, string> = {
  nouvelle: 'Nouvelle', consolidation: 'En consolidation', stable: 'Stable', a_revoir: 'À revoir',
}
const ANCHOR_TONE: Record<AnchorState, 'sun' | 'info' | 'good' | 'warn'> = {
  nouvelle: 'sun', consolidation: 'info', stable: 'good', a_revoir: 'warn',
}

/** Habitudes : construire sur 2-3 mois, vérifier l'ancrage mois par mois.
 *  Tendance sur plusieurs semaines — pas de culte du streak quotidien. */
export function HabitsView() {
  const s = useHorizon()
  const [editing, setEditing] = useState<Habit | 'new' | null>(null)
  const today = todayIso()
  const active = s.habits.filter((h) => h.active)
  const archived = s.habits.filter((h) => !h.active)

  const newCount = active.filter((h) => h.anchor_state === 'nouvelle').length

  return (
    <div className="rise space-y-4 pt-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Habitudes</h1>
          <p className="text-sm text-ink-3">Qu'est-ce qui doit devenir automatique ? Moins décider, plus exécuter.</p>
        </div>
        <button onClick={() => setEditing('new')} className="btn-sun flex items-center gap-1.5 px-4 py-2 text-sm">
          <Plus size={15} /> Nouvelle habitude
        </button>
      </header>

      {newCount > 1 && (
        <p className="text-xs text-[#eda145]">
          {newCount} nouvelles habitudes en même temps : la méthode Horizon conseille d'en ancrer une seule à la fois (2-3 mois).
        </p>
      )}

      {active.length === 0 ? (
        <Card>
          <EmptyState hint="Rangement, courses, sport, prière… : ce qui est répétitif peut devenir routine.">
            Aucune habitude suivie pour l'instant.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {active.map((h) => {
            const domain = s.domains.find((d) => d.id === h.domain_id)
            const st = habitStats(h, s.habitLogs)
            const doneToday = s.habitLogs.some((l) => l.habit_id === h.id && l.log_date === today && l.done)
            const days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i))
            const monthsOld = Math.floor(differenceInCalendarDays(new Date(), parseISO(h.start_date)) / 30)
            return (
              <Card key={h.id} className="card-hover">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {domain && <DomainDot color={domain.color} />}
                    <h3 className="truncate font-medium">{h.title}</h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={ANCHOR_TONE[h.anchor_state]}>{ANCHOR_LABEL[h.anchor_state]}</Badge>
                    <button onClick={() => setEditing(h)} className="btn-ghost p-1.5" aria-label="Modifier"><Pencil size={13} /></button>
                  </div>
                </div>

                <p className="mt-1 text-xs text-ink-3">
                  {h.frequency_type === 'daily' ? 'Quotidienne' : `${h.weekly_target}× / semaine`}
                  {' · '}suivie depuis {monthsOld < 1 ? 'moins d’un mois' : `${monthsOld} mois`}
                </p>

                <div className="mt-3 flex items-end justify-between gap-3">
                  {/* 7 derniers jours */}
                  <div className="flex gap-1">
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
                  {/* Tendance 4 semaines : la vraie mesure d'ancrage */}
                  <div className="text-right">
                    <TrendBars values={st.trend4w} color={domain?.color ?? '#d97706'} />
                    <p className="mt-0.5 text-[10px] text-ink-3">4 dernières semaines</p>
                  </div>
                </div>

                <p className="mt-2 text-xs text-ink-2">
                  Cette semaine : <span className="tabular-nums">{st.doneThisWeek}/{st.target}</span>
                  {!doneToday && h.frequency_type === 'daily' && <span className="text-ink-3"> — pas encore aujourd'hui</span>}
                </p>
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
    frequency_type: habit?.frequency_type ?? 'daily',
    weekly_target: habit?.weekly_target ?? 3,
    anchor_state: habit?.anchor_state ?? 'nouvelle',
    active: habit?.active ?? true,
    description: habit?.description ?? '',
  }
  const close = () => { setForm(null); onClose() }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const values = {
      ...current,
      title: (current.title as string).trim(),
      weekly_target: current.frequency_type === 'daily' ? 7 : Number(current.weekly_target),
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
          onChange={(e) => setForm({ ...current, title: e.target.value })}
          placeholder="Routine simple et réaliste" className="field" autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs text-ink-3">
            Domaine
            <select value={current.domain_id as string} onChange={(e) => setForm({ ...current, domain_id: e.target.value })} className="field">
              {s.domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-ink-3">
            Fréquence
            <select value={current.frequency_type as string} onChange={(e) => setForm({ ...current, frequency_type: e.target.value })} className="field">
              <option value="daily">Chaque jour</option>
              <option value="weekly">X fois par semaine</option>
            </select>
          </label>
        </div>
        {current.frequency_type === 'weekly' && (
          <label className="block space-y-1 text-xs text-ink-3">
            Objectif : {current.weekly_target as number}× / semaine
            <input type="range" min={1} max={7} value={current.weekly_target as number}
              onChange={(e) => setForm({ ...current, weekly_target: Number(e.target.value) })}
              className="w-full accent-[#f59e0b]" />
          </label>
        )}
        <label className="block space-y-1 text-xs text-ink-3">
          État d'ancrage (à réviser pendant la revue mensuelle)
          <select value={current.anchor_state as string} onChange={(e) => setForm({ ...current, anchor_state: e.target.value })} className="field">
            {Object.entries(ANCHOR_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={current.active as boolean}
            onChange={(e) => setForm({ ...current, active: e.target.checked })} className="accent-[#f59e0b]" />
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
