import { useState } from 'react'
import { useHorizon } from '../lib/store'
import { Modal, Scale3 } from './ui'
import type { Task } from '../lib/types'

/** Une tâche est ancrée à un projet OU librement à un domaine (jamais nulle part). */
export function TaskForm({ open, task, defaultDate, overrideScheduled, defaultIsTask = false, onClose }: {
  open: boolean; task: Task | null; defaultDate?: string; overrideScheduled?: string
  defaultIsTask?: boolean; onClose: () => void
}) {
  const s = useHorizon()
  const [form, setForm] = useState<Record<string, unknown> | null>(null)

  if (!open) return null

  const initDur = (() => {
    const m = task?.duration_min
    if (!m) return { value: '', unit: 'min' }
    if (m % 1440 === 0) return { value: String(m / 1440), unit: 'jour' }
    if (m % 60 === 0) return { value: String(m / 60), unit: 'heure' }
    return { value: String(m), unit: 'min' }
  })()

  const current = form ?? {
    title: task?.title ?? '',
    anchor: task?.project_id ? `p:${task.project_id}` : `d:${task?.domain_id ?? s.domains[0]?.id ?? ''}`,
    scheduled_date: overrideScheduled ?? task?.scheduled_date ?? defaultDate ?? '',
    due_date: task?.due_date ?? '',
    dur_value: initDur.value,
    dur_unit: initDur.unit,
    end_date: task?.end_date ?? '',
    is_task: task?.is_task ?? defaultIsTask,
    importance: task?.importance ?? null,
    urgence: task?.urgence ?? null,
    is_recurring: task?.is_recurring ?? false,
    recur_kind: task?.recurrence_rule?.split(':')[0] ?? 'weekly',
    recur_days: task?.recurrence_rule?.startsWith('weekly') ? (task.recurrence_rule.split(':')[1] ?? '') : '1',
    recur_dom: task?.recurrence_rule?.startsWith('monthly') ? (task.recurrence_rule.split(':')[1] ?? '1') : '1',
    notable: task?.notable ?? false,
    notes: task?.notes ?? '',
  }
  const setF = (k: string, v: unknown) => setForm({ ...current, [k]: v })
  const close = () => { setForm(null); onClose() }

  // Cohérence : une tâche planifiée ne peut pas l'être après son échéance.
  const sched = current.scheduled_date as string
  const due = current.due_date as string
  const incoherent = !!sched && !!due && sched > due

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (incoherent) return
    const anchor = current.anchor as string
    const rule = current.is_recurring
      ? (current.recur_kind === 'daily' ? 'daily'
        : current.recur_kind === 'weekly' ? `weekly:${current.recur_days || '1'}`
          : `monthly:${current.recur_dom || '1'}`)
      : null
    const factor = current.dur_unit === 'jour' ? 1440 : current.dur_unit === 'heure' ? 60 : 1
    const durMin = current.end_date ? null : (current.dur_value ? Number(current.dur_value) * factor : null)
    const values = {
      title: (current.title as string).trim(),
      project_id: anchor.startsWith('p:') ? anchor.slice(2) : null,
      domain_id: anchor.startsWith('d:') ? anchor.slice(2) : null,
      scheduled_date: current.scheduled_date || null,
      due_date: current.due_date || null,
      end_date: current.end_date || null,
      duration_min: durMin,
      is_task: current.is_task,
      importance: current.importance, urgence: current.urgence,
      is_recurring: current.is_recurring, recurrence_rule: rule,
      notable: current.notable,
      notes: (current.notes as string).trim() || null,
    }
    if (task) await s.update('tasks', task.id, values)
    else await s.insert('tasks', { ...values, status: 'a_faire' })
    close()
  }

  const DAYS = [['1', 'L'], ['2', 'M'], ['3', 'M'], ['4', 'J'], ['5', 'V'], ['6', 'S'], ['7', 'D']]
  const selectedDays = String(current.recur_days).split(',').filter(Boolean)

  return (
    <Modal open onClose={close} title={task ? 'Modifier la tâche' : 'Nouvelle tâche'} wide>
      <form onSubmit={save} className="space-y-3">
        <input required value={current.title as string} onChange={(e) => setF('title', e.target.value)}
          placeholder="Action concrète, idéalement courte" className="field" autoFocus />

        <label className="block space-y-1 text-xs text-ink-3">
          Rattachée à
          <select value={current.anchor as string} onChange={(e) => setF('anchor', e.target.value)} className="field">
            <optgroup label="Projets actifs">
              {s.projects.filter((p) => p.status === 'actif').map((p) => (
                <option key={p.id} value={`p:${p.id}`}>{p.title}</option>
              ))}
            </optgroup>
            <optgroup label="Tâche libre d'un domaine">
              {s.domains.map((d) => <option key={d.id} value={`d:${d.id}`}>{d.name}</option>)}
            </optgroup>
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-ink-3">
            Planifiée le
            <input type="date" value={current.scheduled_date as string}
              onChange={(e) => setF('scheduled_date', e.target.value)} className="field" />
          </label>
          <label className="space-y-1 text-xs text-ink-3">
            Échéance
            <input type="date" value={current.due_date as string}
              onChange={(e) => setF('due_date', e.target.value)} className="field" />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 text-xs text-ink-3">
            Durée
            <div className="flex gap-2">
              <input type="number" min={1} step={1} value={current.dur_value as string}
                onChange={(e) => setF('dur_value', e.target.value)} className="field w-20"
                placeholder="—" disabled={!!current.end_date} />
              <select value={current.dur_unit as string} onChange={(e) => setF('dur_unit', e.target.value)}
                className="field flex-1" disabled={!!current.end_date}>
                <option value="min">minutes</option>
                <option value="heure">heures</option>
                <option value="jour">jours</option>
              </select>
            </div>
          </div>
          <label className="space-y-1 text-xs text-ink-3">
            … ou jusqu'à une date
            <input type="date" value={current.end_date as string}
              onChange={(e) => setF('end_date', e.target.value)} className="field" />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={current.is_task as boolean}
            onChange={(e) => setF('is_task', e.target.checked)} className="accent-[#f59e0b]" />
          C'est une tâche (apparaît dans Priorités)
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-xs text-ink-3">Importance</p>
            <Scale3 value={current.importance as number | null} onChange={(v) => setF('importance', v)}
              labels={['Basse', 'Moyenne', 'Haute']} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-ink-3">Urgence</p>
            <Scale3 value={current.urgence as number | null} onChange={(v) => setF('urgence', v)}
              labels={['Basse', 'Moyenne', 'Haute']} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={current.is_recurring as boolean}
            onChange={(e) => setF('is_recurring', e.target.checked)} className="accent-[#f59e0b]" />
          Responsabilité récurrente (poubelles, factures…)
        </label>

        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={current.notable as boolean}
            onChange={(e) => setF('notable', e.target.checked)} className="accent-[#f59e0b]" />
          Notable
        </label>

        {(current.is_recurring as boolean) && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
            <select value={current.recur_kind as string} onChange={(e) => setF('recur_kind', e.target.value)}
              className="field w-auto">
              <option value="daily">Chaque jour</option>
              <option value="weekly">Chaque semaine</option>
              <option value="monthly">Chaque mois</option>
            </select>
            {current.recur_kind === 'weekly' && (
              <div className="flex gap-1">
                {DAYS.map(([v, l]) => (
                  <button key={v} type="button"
                    onClick={() => {
                      const next = selectedDays.includes(v)
                        ? selectedDays.filter((x) => x !== v) : [...selectedDays, v]
                      setF('recur_days', next.sort().join(','))
                    }}
                    className={`h-8 w-8 rounded-full border text-xs transition-colors ${
                      selectedDays.includes(v) ? 'border-sun bg-sun/15 text-sun-soft' : 'border-line-2 text-ink-3'
                    }`}>
                    {l}
                  </button>
                ))}
              </div>
            )}
            {current.recur_kind === 'monthly' && (
              <label className="flex items-center gap-2 text-xs text-ink-3">
                le
                <input type="number" min={1} max={28} value={current.recur_dom as string}
                  onChange={(e) => setF('recur_dom', e.target.value)} className="field w-16" />
                du mois
              </label>
            )}
          </div>
        )}

        {incoherent && (
          <p className="rounded-lg border border-[#ec7f97]/40 bg-[#ec7f97]/10 px-3 py-2 text-xs text-[#ec7f97]">
            Incohérence : la date planifiée est après l'échéance. Corrige l'une des deux pour valider.
          </p>
        )}

        <div className="flex justify-between gap-2 pt-1">
          {task ? (
            <button type="button" onClick={() => { void s.remove('tasks', task.id); close() }}
              className="btn-ghost px-3 py-2 text-sm text-[#ec7f97]">Supprimer</button>
          ) : <span />}
          <button type="submit" disabled={incoherent}
            className="btn-sun px-5 py-2 disabled:cursor-not-allowed disabled:opacity-50">
            {task ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
