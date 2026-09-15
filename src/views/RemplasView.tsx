// ================================================================
// Remplas — l'agent Céleste vu depuis Horizon.
// Les propositions en attente (mode confirmation), l'historique de ce que
// l'agent a fait, et les règles de disponibilité. Le travail auprès de
// Céleste est fait par la fonction Edge « celeste » (cron 5 min) ; cette page
// en est la projection et le poste de commande.
// ================================================================
import { useState, type ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Check, RotateCw, Undo2, X } from 'lucide-react'
import { useHorizon } from '../lib/store'
import type { CelesteMode, CelesteProposal, CelesteRules, CelesteStatus } from '../lib/types'
import { Badge, Card, Seg } from '../components/ui'

type Tone = 'neutral' | 'sun' | 'good' | 'warn' | 'bad' | 'info'
const STATUS: Record<CelesteStatus, { label: string; tone: Tone }> = {
  proposee: { label: 'À valider', tone: 'sun' },
  acceptee: { label: 'Acceptée', tone: 'good' },
  ignoree: { label: 'Ignorée', tone: 'neutral' },
  refusee: { label: 'Écartée (règle)', tone: 'neutral' },
  expiree: { label: 'Plus disponible', tone: 'neutral' },
  annulee: { label: 'Annulée', tone: 'warn' },
  erreur: { label: 'Erreur', tone: 'bad' },
}

const MODES: { value: CelesteMode; label: string }[] = [
  { value: 'confirmation', label: 'Me demander' },
  { value: 'auto_premiere', label: 'Auto (1 fois)' },
  { value: 'auto', label: 'Auto' },
]

const JOURS = [
  { iso: 1, label: 'lun' }, { iso: 2, label: 'mar' }, { iso: 3, label: 'mer' }, { iso: 4, label: 'jeu' },
  { iso: 5, label: 'ven' }, { iso: 6, label: 'sam' }, { iso: 7, label: 'dim' },
]

/** « 15:00 » → « 15h », « 18:30 » → « 18h30 ». */
const heure = (hm: string) => {
  const [h, m] = hm.split(':')
  return m && m !== '00' ? `${Number(h)}h${m}` : `${Number(h)}h`
}
const fmtDate = (iso: string) => format(parseISO(iso), 'EEEE d MMMM', { locale: fr })
const fmtQuand = (iso: string) => format(parseISO(iso), 'd MMM HH:mm', { locale: fr })

export function RemplasView() {
  const s = useHorizon()
  const props = s.celesteProposals
  const enAttente = props.filter((p) => p.status === 'proposee')
  const acceptees = props.filter((p) => p.status === 'acceptee').sort((a, b) => a.date.localeCompare(b.date))
  const historique = props.filter((p) => p.status !== 'proposee' && p.status !== 'acceptee')
    .sort((a, b) => (b.decided_at ?? b.created_at).localeCompare(a.decided_at ?? a.created_at))
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const agir = async (action: 'accept' | 'unaccept', id: string) => {
    setBusy(id); setMsg(null)
    const r = await s.celesteAction(action, id)
    if (!r.ok) setMsg(r.error ?? 'Échec')
    setBusy(null)
  }
  const ignorer = async (p: CelesteProposal) => {
    setBusy(p.id)
    await s.update('celeste_proposals', p.id, { status: 'ignoree', decided_at: new Date().toISOString() })
    setBusy(null)
  }
  const scanner = async () => {
    setBusy('scan'); setMsg(null)
    const r = await s.celesteAction('scan')
    if (!r.ok) setMsg(r.error ?? 'Échec du scan')
    else {
      const c = r.result ?? {}
      setMsg(`Scan terminé : ${c.nouvelles ?? 0} nouvelle(s), ${c.acceptees ?? 0} acceptée(s), ${c.proposees ?? 0} à valider, ${c.refusees ?? 0} écartée(s).`)
    }
    setBusy(null)
  }

  return (
    <div className="rise mx-auto max-w-3xl space-y-4 pt-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Remplas</h1>
        <p className="text-sm text-ink-3">
          L’agent lit Céleste toutes les 2 minutes. Une demande compatible avec tes règles et ton agenda
          est acceptée seule ou te sera proposée ici — selon le mode choisi plus bas.
        </p>
      </header>

      <EtatAgent regles={s.celesteRules} busy={busy === 'scan'} onScan={scanner} />
      {msg && <p className="text-sm text-ink-2">{msg}</p>}

      <Card title={`À valider${enAttente.length ? ` (${enAttente.length})` : ''}`}>
        {enAttente.length === 0
          ? <p className="text-sm text-ink-3">Rien en attente.</p>
          : (
            <ul className="space-y-1.5">
              {enAttente.map((p) => (
                <Ligne key={p.id} p={p}>
                  <button onClick={() => void agir('accept', p.id)} disabled={busy !== null} title="Accepter sur Céleste"
                    className="btn-sun flex items-center gap-1 px-3 py-1.5 text-sm disabled:opacity-50">
                    <Check size={14} /> Accepter
                  </button>
                  <button onClick={() => void ignorer(p)} disabled={busy !== null} title="Ignorer"
                    className="btn-ghost p-1.5 text-ink-3 hover:text-[#ec7f97] disabled:opacity-40">
                    <X size={15} />
                  </button>
                </Ligne>
              ))}
            </ul>
          )}
      </Card>

      {acceptees.length > 0 && (
        <Card title="Acceptées">
          <ul className="space-y-1.5">
            {acceptees.map((p) => (
              <Ligne key={p.id} p={p}>
                <button onClick={() => void agir('unaccept', p.id)} disabled={busy !== null}
                  title="Retirer mon acceptation sur Céleste"
                  className="btn-ghost flex items-center gap-1 px-3 py-1.5 text-xs text-ink-3 disabled:opacity-40">
                  <Undo2 size={13} /> Annuler
                </button>
              </Ligne>
            ))}
          </ul>
        </Card>
      )}

      <Regles regles={s.celesteRules} onSave={s.saveCelesteRules} />

      {historique.length > 0 && (
        <Card title="Historique">
          <ul className="space-y-1.5">
            {historique.slice(0, 40).map((p) => <Ligne key={p.id} p={p} />)}
          </ul>
        </Card>
      )}
    </div>
  )
}

function EtatAgent({ regles, busy, onScan }: { regles: CelesteRules | null; busy: boolean; onScan: () => void }) {
  if (!regles) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <p className="text-sm text-ink-2">L’agent n’a pas encore tourné.</p>
        <p className="text-xs text-ink-3">Il crée ses règles par défaut à son premier passage (toutes les 2 min) — ou lance-le maintenant.</p>
        <button onClick={onScan} disabled={busy} className="btn-ghost flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-50">
          <RotateCw size={14} className={busy ? 'animate-spin' : ''} /> Lancer un scan
        </button>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {!regles.enabled
        ? <Badge tone="neutral">En pause</Badge>
        : regles.last_error
          ? <Badge tone="bad">Erreur</Badge>
          : <Badge tone="good">Actif</Badge>}
      <span className="text-ink-3">
        {regles.last_scan_at ? `Dernier passage ${fmtQuand(regles.last_scan_at)}` : 'Jamais passé'}
        {' · '}mode {MODES.find((m) => m.value === regles.mode)?.label.toLowerCase()}
      </span>
      <button onClick={onScan} disabled={busy} className="btn-ghost flex items-center gap-1.5 px-3 py-1 text-xs disabled:opacity-50">
        <RotateCw size={12} className={busy ? 'animate-spin' : ''} /> Scanner maintenant
      </button>
      {regles.last_error && <p className="w-full text-xs text-[#ec7f97]">{regles.last_error}</p>}
    </div>
  )
}

function Ligne({ p, children }: { p: CelesteProposal; children?: ReactNode }) {
  const st = STATUS[p.status]
  return (
    <li className="flex items-start gap-2 rounded-lg bg-panel-2/60 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink">
          <span className="capitalize">{fmtDate(p.date)}</span>
          {' · '}<span className="font-medium">{p.shift_code}</span> {heure(p.start_time)}–{heure(p.end_time)}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-ink-3">
          {p.poster && <span>{p.poster}</span>}
          {p.team && <span>équipe {p.team}</span>}
          {p.points != null && <span>{p.points} pts</span>}
          {p.auto && p.status === 'acceptee' && <span>acceptée par l’agent</span>}
          {p.reason && <span className="text-ink-2">— {p.reason}</span>}
        </p>
        {p.comment && <p className="mt-0.5 text-xs italic text-ink-2">« {p.comment} »</p>}
      </div>
      {children ?? <Badge tone={st.tone}>{st.label}</Badge>}
    </li>
  )
}

/** Édition des règles. Sauvegarde champ par champ, sans bouton : chaque
 *  changement part tout de suite (l'agent le lit à son prochain passage). */
function Regles({ regles, onSave }: { regles: CelesteRules | null; onSave: (v: Partial<CelesteRules>) => Promise<void> }) {
  const r: CelesteRules = regles ?? {
    user_id: '', enabled: true, mode: 'auto_premiere', delay_seconds: 10, no_weekdays: [4, 7],
    weekday_exceptions: { '4': ['N'] }, no_shifts: [], no_teams: ['10'], refuse_reserved: true, no_keywords: [],
    min_notice_days: 0, max_per_week: null,
    ntfy_topic: null, last_scan_at: null, last_error: null, updated_at: '',
  }
  // Champs texte : édités localement, envoyés à la sortie du champ.
  const [shifts, setShifts] = useState(r.no_shifts.join(', '))
  const [teams, setTeams] = useState(r.no_teams.join(', '))
  const [mots, setMots] = useState(r.no_keywords.join(', '))
  const [topic, setTopic] = useState(r.ntfy_topic ?? '')
  const liste = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean)

  const toggleJour = (iso: number) => {
    const set = new Set(r.no_weekdays)
    if (set.has(iso)) set.delete(iso); else set.add(iso)
    void onSave({ no_weekdays: [...set].sort() })
  }
  // « Sauf N » : vacations qui restent acceptables un jour refusé.
  const [sauf, setSauf] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(r.weekday_exceptions ?? {}).map(([k, v]) => [k, v.join(', ')])),
  )
  const saveSauf = (iso: number) => {
    const codes = liste(sauf[String(iso)] ?? '')
    const next = { ...(r.weekday_exceptions ?? {}) }
    if (codes.length) next[String(iso)] = codes; else delete next[String(iso)]
    void onSave({ weekday_exceptions: next })
  }

  return (
    <Card title="Règles" action={
      <label className="flex items-center gap-2 text-xs text-ink-2">
        <input type="checkbox" checked={r.enabled} onChange={(e) => void onSave({ enabled: e.target.checked })} />
        Agent actif
      </label>
    }>
      <div className="space-y-4 text-sm">
        <div className="space-y-1">
          <p className="text-xs text-ink-3">Mode</p>
          <Seg options={MODES} value={r.mode} onChange={(mode) => void onSave({ mode })} />
          <p className="text-xs text-ink-3">
            {r.mode === 'confirmation' && 'Chaque demande compatible t’est proposée ici (et sur ton téléphone) ; rien n’est accepté sans toi.'}
            {r.mode === 'auto_premiere' && 'La première demande compatible est acceptée seule (test), puis l’agent repasse en « Me demander ».'}
            {r.mode === 'auto' && 'Toute demande compatible est acceptée seule. Tu es prévenu après coup et peux annuler.'}
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-ink-3">Jamais ces jours</p>
          <div className="flex flex-wrap gap-1">
            {JOURS.map((j) => (
              <button key={j.iso} onClick={() => toggleJour(j.iso)}
                className={`rounded-full px-2.5 py-1 text-xs ${r.no_weekdays.includes(j.iso) ? 'bg-bad/20 text-[#ec7f97]' : 'bg-panel-3 text-ink-2'}`}>
                {j.label}
              </button>
            ))}
          </div>
          {r.no_weekdays.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {r.no_weekdays.map((iso) => (
                <label key={iso} className="flex items-center gap-1.5 text-xs text-ink-3">
                  <span className="capitalize">{JOURS.find((j) => j.iso === iso)?.label}</span> sauf
                  <input value={sauf[String(iso)] ?? ''} placeholder="N" title="Codes de vacation acceptés malgré tout ce jour-là"
                    onChange={(e) => setSauf({ ...sauf, [String(iso)]: e.target.value })} onBlur={() => saveSauf(iso)}
                    className="field w-20 !py-0.5 text-xs" />
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-ink-3">Vacations refusées (codes, séparés par des virgules)</span>
            <input value={shifts} onChange={(e) => setShifts(e.target.value)} onBlur={() => void onSave({ no_shifts: liste(shifts) })}
              placeholder="ex. N, S2" className="field w-full" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-ink-3">Équipes refusées</span>
            <input value={teams} onChange={(e) => setTeams(e.target.value)} onBlur={() => void onSave({ no_teams: liste(teams) })}
              placeholder="ex. 10" className="field w-full" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-ink-3">Mots du commentaire qui font écarter</span>
            <input value={mots} onChange={(e) => setMots(e.target.value)} onBlur={() => void onSave({ no_keywords: liste(mots) })}
              placeholder="ex. Cds" className="field w-full" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-ink-3">Délai minimum (jours avant la vacation)</span>
            <input type="number" min={0} value={r.min_notice_days}
              onChange={(e) => void onSave({ min_notice_days: Math.max(0, Number(e.target.value) || 0) })} className="field w-full" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-ink-3">Maximum par semaine (vide = sans limite)</span>
            <input type="number" min={0} value={r.max_per_week ?? ''}
              onChange={(e) => void onSave({ max_per_week: e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0) })}
              className="field w-full" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-ink-3">Pause avant une acceptation automatique (s)</span>
            <input type="number" min={0} max={60} value={r.delay_seconds}
              onChange={(e) => void onSave({ delay_seconds: Math.min(60, Math.max(0, Number(e.target.value) || 0)) })} className="field w-full" />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={r.refuse_reserved} onChange={(e) => void onSave({ refuse_reserved: e.target.checked })} />
          <span>Écarter les demandes fléchées vers quelqu’un (« Pour Marie », réservée)</span>
        </label>
        <p className="text-xs text-ink-3">
          Toujours écartées, sans réglage : les jours où tu es en congé (V/Vf) ou déjà en vacation dans « Temps »,
          les jours en déplacement (évènement avec un lieu), et les demandes que Céleste juge incompatibles (repos…).
        </p>

        <label className="space-y-1">
          <span className="text-xs text-ink-3">Notification téléphone — topic ntfy.sh (privé, difficile à deviner)</span>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} onBlur={() => void onSave({ ntfy_topic: topic.trim() || null })}
            placeholder="ex. horizon-rempla-7k3q9z" className="field w-full" autoComplete="off" />
        </label>
      </div>
    </Card>
  )
}
