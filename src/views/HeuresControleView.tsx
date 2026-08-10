import { useEffect, useState } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Check, RotateCcw, Trash2, Wand2 } from 'lucide-react'
import { useHorizon } from '../lib/store'
import {
  buildControlHoursLines, daysSinceLastControlHours, enteredControlDates, forgottenControlDays,
  isLineValid, iso, lastControlHoursPeriodEnd, lineTotal, todayIso,
} from '../lib/logic'
import type { OlafatcoJob, OlafatcoLine } from '../lib/types'
import { Badge, Card } from '../components/ui'

type Tone = 'neutral' | 'sun' | 'good' | 'warn' | 'bad' | 'info'
const STATUS: Record<OlafatcoJob['status'], { label: string; tone: Tone }> = {
  a_valider: { label: 'À valider', tone: 'warn' },
  valide: { label: 'Validé — en attente de l’agent', tone: 'info' },
  en_cours: { label: 'Saisie en cours…', tone: 'sun' },
  termine: { label: 'Terminé', tone: 'good' },
  erreur: { label: 'Erreur', tone: 'bad' },
}

const round2 = (n: number) => Math.round(n * 100) / 100
const fmtLineDay = (di: string) => format(parseISO(di), 'EEE d MMM', { locale: fr })

export function HeuresControleView() {
  const jobs = useHorizon((s) => s.olafatcoJobs)
  const openJob = jobs.find((j) => j.status !== 'termine') ?? null
  const lastDone = jobs.find((j) => j.status === 'termine') ?? null
  const sinceLast = daysSinceLastControlHours(jobs)

  return (
    <div className="rise mx-auto max-w-3xl space-y-4 pt-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Heures de contrôle</h1>
        <p className="text-sm text-ink-3">
          Horizon propose tes heures d’après tes règles. Tu vérifies, tu ajustes, tu valides —
          la saisie sur OLAFATCO se fait ensuite (par l’agent, à venir). Rien ne part d’ici sans toi.
        </p>
      </header>

      {!openJob && (
        sinceLast === null
          ? <p className="text-sm text-ink-2">Aucune saisie enregistrée pour l’instant.</p>
          : (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-ink-2">Dernière saisie validée il y a {sinceLast} j.</span>
              {sinceLast >= 15 && <Badge tone="sun">C’est le moment</Badge>}
            </div>
          )
      )}

      {openJob ? <JobCard key={openJob.id} job={openJob} /> : <PrepareCard />}
      {!openJob && lastDone && <JobCard key={lastDone.id} job={lastDone} readOnly />}
    </div>
  )
}

/** Préparer un nouveau job : période + calcul des lignes proposées. */
function PrepareCard() {
  const s = useHorizon()
  const lastEnd = lastControlHoursPeriodEnd(s.olafatcoJobs)
  const [start, setStart] = useState(lastEnd ? iso(addDays(parseISO(lastEnd), 1)) : iso(addDays(new Date(), -14)))
  const [end, setEnd] = useState(todayIso())
  const [msg, setMsg] = useState<string | null>(null)

  const done = enteredControlDates(s.olafatcoJobs)
  const preview = (start <= end ? buildControlHoursLines(s.tasks, parseISO(start), parseISO(end)) : [])
    .filter((l) => !done.has(l.date))
  const forgotten = forgottenControlDays(s.tasks, s.olafatcoJobs)

  const prepare = async () => {
    if (start > end) { setMsg('La date de début est après la date de fin.'); return }
    if (preview.length === 0) { setMsg('Aucun jour travaillé (CAPS) sur cette période.'); return }
    setMsg(null)
    await s.insert('olafatco_jobs', { period_start: start, period_end: end, status: 'a_valider', lines: preview })
  }

  const prepareForgotten = async () => {
    const dates = forgotten.map((l) => l.date).sort()
    const first = dates[0], last = dates[dates.length - 1]
    if (!first || !last) return
    setMsg(null)
    await s.insert('olafatco_jobs', { period_start: first, period_end: last, status: 'a_valider', lines: forgotten })
  }

  return (
    <Card title="Préparer une saisie">
      {forgotten.length > 0 && (
        <div className="mb-3 rounded-xl border border-[#e0b15a]/40 bg-[#e0b15a]/10 p-3">
          <p className="text-sm text-ink-2">
            <span className="font-medium text-ink">{forgotten.length} jour(s) travaillé(s) oublié(s)</span>
            {' '}— {forgotten.map((l) => fmtLineDay(l.date)).join(', ')}.
            {' '}Jamais saisis, sur une période déjà traitée.
          </p>
          <button onClick={() => void prepareForgotten()}
            className="btn-sun mt-2 flex items-center gap-2 px-3 py-1.5 text-sm">
            <Wand2 size={14} /> Préparer ces oublis ({forgotten.length})
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-ink-3">Du
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="field" />
        </label>
        <label className="space-y-1 text-xs text-ink-3">au
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="field" />
        </label>
        <button onClick={() => void prepare()} className="btn-sun flex items-center gap-2 px-4 py-2 text-sm">
          <Wand2 size={15} /> Préparer ({preview.length})
        </button>
      </div>
      {msg && <p className="mt-2 text-xs text-ink-2">{msg}</p>}
      <p className="mt-2 text-xs text-ink-3">
        {preview.length} jour(s) travaillé(s) détecté(s) sur la période (congés exclus).
      </p>
    </Card>
  )
}

/** Un job : tableau des heures proposées, ajustables, puis validation. */
function JobCard({ job, readOnly = false }: { job: OlafatcoJob; readOnly?: boolean }) {
  const s = useHorizon()
  const editable = !readOnly && job.status === 'a_valider'
  const [lines, setLines] = useState<OlafatcoLine[]>(job.lines)

  useEffect(() => { setLines(job.lines) }, [job.id, job.lines])

  const patch = (i: number, field: 'standard' | 'instructeur' | 'urmn' | 'urme', value: number) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))
  }
  const persist = (next: OlafatcoLine[]) => { void s.update('olafatco_jobs', job.id, { lines: next }) }
  const setLine = (i: number, changes: Partial<OlafatcoLine>) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...changes } : l)))
  }
  const removeLine = (i: number) => {
    const next = lines.filter((_, idx) => idx !== i)
    setLines(next); persist(next)
  }

  const allValid = lines.length > 0 && lines.every((l) => isLineValid(l))
  const sumStd = round2(lines.reduce((n, l) => n + l.standard, 0))
  const sumInst = round2(lines.reduce((n, l) => n + l.instructeur, 0))

  const validate = () => {
    if (!allValid) return
    void s.update('olafatco_jobs', job.id, { lines, status: 'valide', validated_at: new Date().toISOString() })
  }
  const regenerate = () => {
    const fresh = buildControlHoursLines(s.tasks, parseISO(job.period_start), parseISO(job.period_end))
    setLines(fresh); persist(fresh)
  }
  const backToDraft = () => { void s.update('olafatco_jobs', job.id, { status: 'a_valider', validated_at: null }) }
  const del = () => { void s.remove('olafatco_jobs', job.id) }

  const st = STATUS[job.status]

  return (
    <Card
      title={`Du ${fmtLineDay(job.period_start)} au ${fmtLineDay(job.period_end)}`}
      action={<Badge tone={st.tone}>{st.label}</Badge>}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3">
              <th className="py-1 pr-2 font-medium">Jour</th>
              <th className="px-2 font-medium">Vac.</th>
              <th className="px-2 font-medium">Standard</th>
              <th className="px-2 font-medium">Instructeur</th>
              <th className="px-2 font-medium">Total</th>
              <th className="px-2 font-medium">URMN</th>
              <th className="px-2 font-medium">URME</th>
              {editable && <th className="px-2" />}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const valid = isLineValid(l)
              return (
                <tr key={i} className="border-t border-line">
                  <td className="py-1.5 pr-2 text-ink-2">
                    {editable
                      ? <input type="date" value={l.date} onChange={(e) => setLine(i, { date: e.target.value })}
                          onBlur={() => persist(lines)} className="field py-1" />
                      : fmtLineDay(l.date)}
                  </td>
                  <td className="px-2 text-ink-3">
                    {editable
                      ? <input type="text" value={l.shift_code} placeholder="M1"
                          onChange={(e) => setLine(i, { shift_code: e.target.value })}
                          onBlur={() => persist(lines)} className="field w-16 py-1" />
                      : (l.shift_code || '—')}
                  </td>
                  <td className="px-2">
                    <NumCell value={l.standard} editable={editable} step={0.25}
                      onChange={(v) => patch(i, 'standard', v)} onCommit={() => persist(lines)} />
                  </td>
                  <td className="px-2">
                    <NumCell value={l.instructeur} editable={editable} step={0.25}
                      onChange={(v) => patch(i, 'instructeur', v)} onCommit={() => persist(lines)} />
                  </td>
                  <td className={`px-2 font-medium ${valid ? 'text-ink' : 'text-[#ec7f97]'}`}
                    title={valid ? undefined : 'Hors règles (4–5 h, ≥ 1,5 de chaque côté, pas de 0,25)'}>
                    {lineTotal(l)}
                  </td>
                  <td className="px-2">
                    <NumCell value={l.urmn} editable={editable} step={1}
                      onChange={(v) => patch(i, 'urmn', v)} onCommit={() => persist(lines)} />
                  </td>
                  <td className="px-2">
                    <NumCell value={l.urme} editable={editable} step={1}
                      onChange={(v) => patch(i, 'urme', v)} onCommit={() => persist(lines)} />
                  </td>
                  {editable && (
                    <td className="px-2 text-right">
                      <button onClick={() => removeLine(i)} className="btn-ghost p-1 text-ink-3"
                        aria-label="Supprimer la ligne" title="Supprimer la ligne">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-line text-xs text-ink-3">
              <td className="py-1.5 pr-2" colSpan={2}>{lines.length} jour(s)</td>
              <td className="px-2 font-medium text-ink-2">{sumStd}</td>
              <td className="px-2 font-medium text-ink-2">{sumInst}</td>
              <td className="px-2 font-medium text-ink-2">{round2(sumStd + sumInst)}</td>
              <td className="px-2" colSpan={editable ? 3 : 2} />
            </tr>
          </tfoot>
        </table>
      </div>

      {job.report && (
        <div className="mt-3 rounded-xl border border-line bg-panel-2 p-3 text-sm">
          <p className={job.report.ok ? 'text-[#4cc79a]' : 'text-[#ec7f97]'}>
            {job.report.ok ? '✓' : '✕'} {job.report.entered}/{job.report.total} jour(s) saisi(s).
            {job.report.message ? ` ${job.report.message}` : ''}
          </p>
          {job.report.anomalies && job.report.anomalies.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs text-ink-2">
              {job.report.anomalies.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          )}
        </div>
      )}

      {editable && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={validate} disabled={!allValid}
            className="btn-sun flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-40">
            <Check size={15} /> Valider pour envoi
          </button>
          <button onClick={regenerate} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm">
            <Wand2 size={14} /> Régénérer
          </button>
          <button onClick={del} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm text-ink-3">
            <Trash2 size={14} /> Supprimer
          </button>
          {!allValid && <span className="text-xs text-[#ec7f97]">Une ligne ne respecte pas les règles.</span>}
        </div>
      )}

      {!readOnly && job.status === 'valide' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="text-xs text-ink-3">
            Validé. L’agent saisira ces heures sur OLAFATCO puis renverra un rapport ici.
          </p>
          <button onClick={backToDraft} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm text-ink-3">
            <RotateCcw size={14} /> Repasser en brouillon
          </button>
        </div>
      )}
    </Card>
  )
}

/** Cellule numérique : éditable (input) ou lecture seule. */
function NumCell({ value, editable, step, onChange, onCommit }: {
  value: number; editable: boolean; step: number; onChange: (v: number) => void; onCommit: () => void
}) {
  if (!editable) return <span className="text-ink-2">{value}</span>
  return (
    <input
      type="number" step={step} min={0} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      onBlur={onCommit}
      className="field w-20 py-1 text-right"
    />
  )
}
