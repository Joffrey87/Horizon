import { useMemo, useState } from 'react'
import { format, getISODay, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Plus, Check, ExternalLink, Pencil, Trash2, Church, BellRing, RotateCcw, ShieldCheck, RefreshCw, Undo2,
  ListChecks, ChevronDown, X, CheckCircle2, Circle,
} from 'lucide-react'
import { useHorizon } from '../lib/store'
import { supabase } from '../lib/supabase'
import { checkStatus, workShiftOn, massFitsShift, fmtMinutes, hasMaintainedMasses, massesInfoUrl, citySlug } from '../lib/logic'
import { checklistTemplate, checklistProgress, uid } from '../lib/checklist'
import { Card, Modal, Seg, DomainDot, Badge, EmptyState } from '../components/ui'
import type { Check as CheckRow, CheckKind, MassSlot, ChecklistConfig, ChecklistSection } from '../lib/types'

const MASS_PREVIEW = 4 // nb de jours de messe affichés avant de déplier la liste

const INTERVAL_OPTIONS: { value: number; label: string }[] = [
  { value: 7, label: 'Chaque semaine' },
  { value: 14, label: 'Toutes les 2 semaines' },
  { value: 30, label: 'Chaque mois' },
  { value: 60, label: 'Tous les 2 mois' },
  { value: 90, label: 'Tous les 3 mois' },
]

/** Vérifications = alertes personnelles configurables. Elles remontent quand il
 *  faut s'en occuper — sans jamais culpabiliser, et sans dupliquer de tâches. */
export function VerificationsView() {
  const s = useHorizon()
  const [editing, setEditing] = useState<CheckRow | null>(null)
  const [creating, setCreating] = useState(false)

  const checks = useMemo(
    () => [...s.checks].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [s.checks])
  const lists = checks.filter((c) => c.kind === 'checklist')
  const alerts = checks.filter((c) => c.kind !== 'checklist')

  return (
    <div className="rise space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck size={20} className="text-sun" /> Vérifications</h1>
          <p className="text-sm text-ink-3">Des garde-fous qui te préviennent au bon moment. Rien à retenir : Horizon veille.</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-sun flex items-center gap-2 px-4 py-2 text-sm">
          <Plus size={16} /> Nouvelle vérification
        </button>
      </header>

      {checks.length === 0 ? (
        <EmptyState hint="Ex. « trouver une messe quand je travaille un dimanche », « ma checklist Vacances »…">
          Aucune vérification pour l'instant.
        </EmptyState>
      ) : (
        <>
          {/* ---- Listes de vérification (checklists) ---- */}
          {lists.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-2">
                <ListChecks size={16} className="text-sun" /> Mes listes
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {lists.map((c) => <ChecklistCard key={c.id} check={c} onEdit={() => setEditing(c)} />)}
              </div>
            </section>
          )}

          {/* ---- Alertes (périodiques / messe) ---- */}
          {alerts.length > 0 && (
            <section className="space-y-3">
              {lists.length > 0 && (
                <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-2">
                  <BellRing size={16} className="text-sun" /> Alertes
                </h2>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {alerts.map((c) => <CheckCard key={c.id} check={c} onEdit={() => setEditing(c)} />)}
              </div>
            </section>
          )}
        </>
      )}

      <CheckForm
        open={creating || editing !== null}
        check={editing}
        onClose={() => { setCreating(false); setEditing(null) }} />
    </div>
  )
}

function CheckCard({ check, onEdit }: { check: CheckRow; onEdit: () => void }) {
  const s = useHorizon()
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const domain = s.domains.find((d) => d.id === check.domain_id)
  const status = useMemo(() => checkStatus(check, s.tasks, { homeCity: s.settings?.home_city ?? undefined, feasts: s.settings?.catholic_feasts !== false }), [check, s.tasks, s.settings])

  const cfg = (check.config ?? {}) as {
    masses?: Record<string, MassSlot[]>
    massesByCity?: Record<string, Record<string, MassSlot[]>>  // slug ville -> jour ISO -> messes
    chosen?: Record<string, string>; refreshed_at?: string
  }
  const chosen = cfg.chosen ?? {}
  const homeCity = s.settings?.home_city?.trim() || 'Reims'
  // Messes d'une ville : liste dédiée si renseignée, sinon liste Reims héritée (`masses`).
  const cityMasses = (city: string): Record<string, MassSlot[]> => {
    const byCity = cfg.massesByCity?.[citySlug(city)]
    if (byCity) return byCity
    return hasMaintainedMasses(city) ? (cfg.masses ?? {}) : {}
  }
  const massesForDate = (city: string, date: string): MassSlot[] =>
    cityMasses(city)[String(getISODay(parseISO(date)))] ?? []

  // Marqueur des évènements « messe » posés au calendrier par cette vérification.
  const massTag = `source:check:${check.id}`
  const addMassEvent = async (date: string, time: string, church: string) => {
    await s.insert('tasks', {
      title: `Messe ${time.replace(':', 'h')} — ${church}`,
      is_task: false, scheduled_date: date, domain_id: check.domain_id,
      duration_min: 60, notes: massTag, status: 'a_faire',
    })
  }
  const removeMassEvent = async (date: string) => {
    const ev = s.tasks.find((t) => t.notes === massTag && t.scheduled_date === date)
    if (ev) await s.remove('tasks', ev.id)
  }

  // Choisir une messe : mémorise le choix ET pose l'évènement au calendrier.
  const chooseMass = async (date: string, m: MassSlot) => {
    await s.update('checks', check.id, { config: { ...cfg, chosen: { ...chosen, [date]: `${m.t} ${m.c}` } } })
    await addMassEvent(date, m.t, m.c)
  }
  // Hors Reims (séjour) : pas de liste horaire — on note « j'y vais » à la ville
  // et on pose un évènement sans heure (l'horaire précis se choisit sur messes.info).
  const chooseAway = async (date: string, city: string) => {
    await s.update('checks', check.id, { config: { ...cfg, chosen: { ...chosen, [date]: `Messe à ${city}` } } })
    await s.insert('tasks', {
      title: `Messe — ${city}`, is_task: false, scheduled_date: date,
      domain_id: check.domain_id, notes: massTag, status: 'a_faire',
    })
  }
  // Jour sans messe possible : on l'écarte (aucun évènement posé).
  const markHandled = (date: string) =>
    void s.update('checks', check.id, { resolved: [...(check.resolved ?? []), date] })
  // Revenir en arrière sur une date : retire choix/écart et l'évènement calendaire.
  const undoDate = async (date: string) => {
    const nextChosen = { ...chosen }; delete nextChosen[date]
    await s.update('checks', check.id, {
      resolved: (check.resolved ?? []).filter((d) => d !== date),
      config: { ...cfg, chosen: nextChosen },
    })
    await removeMassEvent(date)
  }
  const markDone = () =>
    void s.update('checks', check.id, { last_done_at: new Date().toISOString() })
  const resetAll = async () => {
    await s.update('checks', check.id, { resolved: [], config: { ...cfg, chosen: {} } })
    for (const ev of s.tasks.filter((t) => t.notes === massTag)) await s.remove('tasks', ev.id)
  }

  // Rafraîchit la liste des messes (fonction Edge qui relit la source publique).
  const refreshMasses = async () => {
    setRefreshing(true)
    try {
      await supabase.functions.invoke('refresh-masses', { body: { check_id: check.id } })
      await s.loadAll()
    } catch { /* la liste déjà connue reste utilisable */ }
    setRefreshing(false)
  }

  const hasSettled = Object.keys(chosen).length > 0 || (check.resolved?.length ?? 0) > 0

  return (
    <Card className={`flex flex-col gap-3 ${!check.active ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          {domain ? <DomainDot color={domain.color} size={9} /> : <span className="mt-1 shrink-0">{check.kind === 'messe_travail' ? <Church size={14} className="text-sun" /> : <BellRing size={14} className="text-sun" />}</span>}
          <div className="min-w-0">
            <p className="text-sm font-medium leading-snug">{check.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge tone={check.kind === 'messe_travail' ? 'info' : 'neutral'}>
                {check.kind === 'messe_travail' ? 'Si je travaille' : 'Périodique'}
              </Badge>
              {check.kind === 'periodique' && check.interval_days && (
                <span className="text-xs text-ink-3">{INTERVAL_OPTIONS.find((o) => o.value === check.interval_days)?.label ?? `Tous les ${check.interval_days} j`}</span>
              )}
              {!check.active && <Badge tone="warn">en pause</Badge>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button onClick={() => void s.update('checks', check.id, { active: !check.active })}
            className="btn-ghost p-1.5 text-ink-3 hover:text-ink" title={check.active ? 'Mettre en pause' : 'Réactiver'}>
            <span className={`block h-3.5 w-3.5 rounded-full border-2 ${check.active ? 'border-good bg-good/40' : 'border-line-2'}`} />
          </button>
          <button onClick={onEdit} className="btn-ghost p-1.5 text-ink-3 hover:text-ink" title="Modifier"><Pencil size={14} /></button>
          <button onClick={() => { if (confirm('Supprimer cette vérification ?')) void s.remove('checks', check.id) }}
            className="btn-ghost p-1.5 text-ink-3 hover:text-[#ec7f97]" title="Supprimer"><Trash2 size={14} /></button>
        </div>
      </div>

      {/* ---- État ---- */}
      {check.kind === 'messe_travail' ? (
        <div className="space-y-2">
          {/* Barre : fraîcheur de la liste + lien unique + rafraîchir */}
          <div className="flex items-center justify-between gap-2 text-[11px] text-ink-3">
            <span>
              {cfg.refreshed_at
                ? `Liste des messes vérifiée le ${format(parseISO(cfg.refreshed_at), 'd MMM', { locale: fr })}`
                : 'Liste des messes non renseignée'}
            </span>
            <div className="flex items-center gap-2">
              {check.link && (
                <a href={check.link} target="_blank" rel="noopener noreferrer"
                  className="btn-ghost flex items-center gap-1 px-2 py-0.5 hover:text-ink" title="Ouvrir messes.info (Reims)">
                  <ExternalLink size={11} /> messes.info
                </a>
              )}
              <button onClick={() => void refreshMasses()} disabled={refreshing}
                className="btn-ghost flex items-center gap-1 px-2 py-0.5 hover:text-ink disabled:opacity-50" title="Rafraîchir depuis la source">
                <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Maj…' : 'Rafraîchir'}
              </button>
            </div>
          </div>

          {status.dates.length === 0 ? (
            <p className="text-xs text-ink-3">
              {check.active ? 'Rien à prévoir : aucun jour d\'obligation travaillé sur la fenêtre.' : 'En pause.'}
            </p>
          ) : (
            <>
              <p className="text-xs font-medium text-sun-soft">
                {status.pending > 0
                  ? `${status.pending} messe${status.pending > 1 ? 's' : ''} à trouver sur ${status.dates.length} jour${status.dates.length > 1 ? 's' : ''}`
                  : `Toutes les messes sont choisies (${status.dates.length})`}
              </p>
              <ul className="space-y-1.5">
                {(expanded ? status.dates : status.dates.slice(0, MASS_PREVIEW)).map(({ date, location, feast }) => {
                  const shift = workShiftOn(s.tasks, date)
                  const hasTimed = Object.keys(cityMasses(location)).length > 0 // liste horaire dispo pour ce lieu ?
                  const all = massesForDate(location, date)
                  // Ne proposer que les messes compatibles avec la garde (30 min de marge avant/après).
                  const options = shift ? all.filter((m) => massFitsShift(m.t, shift)) : all
                  const hidden = all.length - options.length
                  const chosenVal = chosen[date]
                  const isHandled = (check.resolved ?? []).includes(date)
                  const noMass = !chosenVal && !isHandled && hasTimed && options.length === 0
                  return (
                    <li key={date}
                      className={`rounded-lg px-2 py-1.5 ${noMass ? 'border border-[#ef4444]/60 bg-[#ef4444]/12' : 'bg-panel-2/60'}`}>
                      <div className="text-xs">
                        <span className="capitalize text-ink">{format(parseISO(date), 'EEEE d MMMM', { locale: fr })}</span>
                        {feast && <span className="ml-1 rounded bg-sun/20 px-1.5 py-0.5 text-[10px] font-medium text-sun-soft" title={`Grande fête : ${feast}`}>✝ {feast}</span>}
                        {location !== homeCity && <span className="font-medium text-[#a78bfa]"> · à {location}</span>}
                        {shift && (
                          <span className="text-ink-3"> · <span className="font-medium text-ink-2" title={`${fmtMinutes(shift.start)}–${fmtMinutes(shift.end)}`}>{shift.code || `${fmtMinutes(shift.start)}–${fmtMinutes(shift.end)}`}</span></span>
                        )}
                      </div>
                      <div className="mt-1">
                        {chosenVal ? (
                          <div className="flex items-center gap-2">
                            <Church size={12} className="shrink-0 text-[#a78bfa]" />
                            <span className="min-w-0 flex-1 truncate text-[11px] text-ink">{chosenVal}</span>
                            <span className="shrink-0 text-[10px] text-ink-3">au calendrier</span>
                            <button onClick={() => void undoDate(date)} className="btn-ghost shrink-0 p-1 text-ink-3 hover:text-ink" title="Changer / annuler">
                              <Undo2 size={12} />
                            </button>
                          </div>
                        ) : isHandled ? (
                          <div className="flex items-center gap-2">
                            <Check size={12} className="shrink-0 text-[#4cc79a]" />
                            <span className="flex-1 text-[11px] text-ink-3">réglé (sans messe)</span>
                            <button onClick={() => void undoDate(date)} className="btn-ghost shrink-0 p-1 text-ink-3 hover:text-ink" title="Revenir">
                              <Undo2 size={12} />
                            </button>
                          </div>
                        ) : hasTimed ? (
                          options.length > 0 ? (
                            <select defaultValue="" onChange={(e) => { const m = options.find((o) => `${o.t} ${o.c}` === e.target.value); if (m) void chooseMass(date, m) }}
                              className="field w-full py-1 text-xs">
                              <option value="">Choisir une messe…</option>
                              {options.map((m) => (
                                <option key={m.t + m.c} value={`${m.t} ${m.c}`}>{m.t} — {m.c}</option>
                              ))}
                            </select>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 text-[11px] font-medium text-[#ef4444]">
                                {all.length > 0 ? 'Aucune messe compatible avec ton jour de travail' : 'Aucune messe connue ce jour'}
                              </span>
                              <button onClick={() => markHandled(date)}
                                className="btn-ghost shrink-0 px-2 py-0.5 text-[11px] text-ink-3" title="Ne rien planifier ce jour">
                                Ignorer
                              </button>
                            </div>
                          )
                        ) : (
                          // Séjour hors ville renseignée : lien vers la ville (pas de liste horaire ici).
                          <div className="flex flex-wrap items-center gap-2">
                            <a href={massesInfoUrl(location)} target="_blank" rel="noopener noreferrer"
                              className="btn-ghost flex items-center gap-1 px-2 py-0.5 text-[11px]" title={`Chercher une messe à ${location}`}>
                              <ExternalLink size={11} /> messes à {location}
                            </a>
                            <button onClick={() => void chooseAway(date, location)}
                              className="btn-ghost px-2 py-0.5 text-[11px] text-[#4cc79a]" title="Poser la messe au calendrier">
                              J'y vais
                            </button>
                            <button onClick={() => markHandled(date)}
                              className="btn-ghost px-2 py-0.5 text-[11px] text-ink-3" title="Ne rien planifier ce jour">
                              Ignorer
                            </button>
                          </div>
                        )}
                      </div>
                      {hidden > 0 && options.length > 0 && !chosenVal && (
                        <p className="mt-0.5 text-[10px] text-ink-3">{hidden} écartée{hidden > 1 ? 's' : ''} (horaire incompatible avec ton jour de travail)</p>
                      )}
                      {hasTimed && location !== homeCity && !chosenVal && (
                        <a href={massesInfoUrl(location)} target="_blank" rel="noopener noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-ink-3 hover:text-ink">
                          <ExternalLink size={10} /> autres messes autour de {location}
                        </a>
                      )}
                    </li>
                  )
                })}
              </ul>
              {status.dates.length > MASS_PREVIEW && (
                <button onClick={() => setExpanded((v) => !v)}
                  className="flex w-full items-center justify-center gap-1 rounded-lg border border-line-2/60 py-1 text-[11px] text-ink-3 hover:bg-panel-2/40 hover:text-ink">
                  <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  {expanded ? 'Réduire' : `Voir les ${status.dates.length - MASS_PREVIEW} autre${status.dates.length - MASS_PREVIEW > 1 ? 's' : ''} jour${status.dates.length - MASS_PREVIEW > 1 ? 's' : ''}`}
                </button>
              )}
              {hasSettled && (
                <button onClick={() => void resetAll()} className="inline-flex items-center gap-1 text-[10px] text-ink-3 underline hover:text-ink-2">
                  <RotateCcw size={10} /> tout réinitialiser
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          {status.due ? (
            <span className="flex items-center gap-1.5 text-xs text-sun-soft">
              <BellRing size={13} /> À vérifier{status.overdueDays ? ` (échue depuis ${status.overdueDays} j)` : ' maintenant'}
            </span>
          ) : (
            <span className="text-xs text-ink-3">Prochaine vérification dans {status.nextDueInDays} j</span>
          )}
          <div className="flex items-center gap-1.5">
            {check.link && (
              <a href={check.link} target="_blank" rel="noopener noreferrer"
                className="btn-ghost flex items-center gap-1 px-2 py-1 text-[11px]"><ExternalLink size={12} /> Ouvrir</a>
            )}
            <button onClick={markDone} className="btn-ghost flex items-center gap-1 px-2.5 py-1 text-[11px] text-[#4cc79a]">
              <Check size={12} /> Vérifié
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}

// ---- Carte « liste de vérification » (checklist éditable) ------------------

function ChecklistCard({ check, onEdit }: { check: CheckRow; onEdit: () => void }) {
  const s = useHorizon()
  const [open, setOpen] = useState(false) // repliée par défaut : on n'affiche que le titre + la progression
  const domain = s.domains.find((d) => d.id === check.domain_id)
  const cfg = (check.config ?? {}) as unknown as ChecklistConfig
  const sections = cfg.sections ?? []
  const { done, total } = checklistProgress(cfg)
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  const persist = (next: ChecklistSection[]) => void s.update('checks', check.id, { config: { ...cfg, sections: next } })
  const mapSection = (id: string, fn: (sec: ChecklistSection) => ChecklistSection) =>
    persist(sections.map((sec) => (sec.id === id ? fn(sec) : sec)))

  const toggleItem = (secId: string, itemId: string) =>
    mapSection(secId, (sec) => ({ ...sec, items: sec.items.map((it) => (it.id === itemId ? { ...it, done: !it.done } : it)) }))
  const renameItem = (secId: string, itemId: string, label: string) =>
    mapSection(secId, (sec) => ({
      ...sec,
      items: label.trim()
        ? sec.items.map((it) => (it.id === itemId ? { ...it, label: label.trim() } : it))
        : sec.items.filter((it) => it.id !== itemId), // vidé → on retire l'item
    }))
  const addItem = (secId: string, label: string) => {
    if (!label.trim()) return
    mapSection(secId, (sec) => ({ ...sec, items: [...sec.items, { id: uid(), label: label.trim(), done: false }] }))
  }
  const removeItem = (secId: string, itemId: string) =>
    mapSection(secId, (sec) => ({ ...sec, items: sec.items.filter((it) => it.id !== itemId) }))
  const renameSection = (secId: string, title: string) =>
    mapSection(secId, (sec) => ({ ...sec, title: title.trim() || 'Section' }))
  const addSection = () => persist([...sections, { id: uid(), title: 'Nouvelle section', items: [] }])
  const removeSection = (secId: string) => {
    const sec = sections.find((x) => x.id === secId)
    if (sec && sec.items.length > 0 && !confirm(`Supprimer la section « ${sec.title} » et ses ${sec.items.length} tâches ?`)) return
    persist(sections.filter((x) => x.id !== secId))
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => setOpen((v) => !v)} className="flex min-w-0 items-start gap-2 text-left">
          {domain ? <DomainDot color={domain.color} size={9} /> : <ListChecks size={15} className="mt-0.5 shrink-0 text-sun" />}
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium leading-snug">
              <ChevronDown size={14} className={`shrink-0 text-ink-3 transition-transform ${open ? '' : '-rotate-90'}`} />
              {check.title}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {cfg.category && <Badge tone="info">{cfg.category}</Badge>}
              <span className="text-xs text-ink-3">{done}/{total} fait{done > 1 ? 's' : ''}</span>
            </div>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <button onClick={onEdit} className="btn-ghost p-1.5 text-ink-3 hover:text-ink" title="Renommer / catégorie"><Pencil size={14} /></button>
          <button onClick={() => { if (confirm('Supprimer cette liste ?')) void s.remove('checks', check.id) }}
            className="btn-ghost p-1.5 text-ink-3 hover:text-[#ec7f97]" title="Supprimer"><Trash2 size={14} /></button>
        </div>
      </div>

      {/* Barre de progression */}
      <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
        <div className="h-full rounded-full bg-good transition-all" style={{ width: `${pct}%` }} />
      </div>

      {open && (
        <div className="space-y-3">
          {sections.map((sec) => {
            const secDone = sec.items.filter((it) => it.done).length
            return (
              <div key={sec.id} className="rounded-lg bg-panel-2/40 p-2">
                <div className="mb-1 flex items-center gap-1.5">
                  <input defaultValue={sec.title} key={sec.title}
                    onBlur={(e) => { if (e.target.value.trim() !== sec.title) renameSection(sec.id, e.target.value) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                    className="min-w-0 flex-1 bg-transparent text-xs font-semibold uppercase tracking-wide text-ink-2 outline-none focus:text-ink" />
                  <span className="shrink-0 text-[10px] text-ink-3">{secDone}/{sec.items.length}</span>
                  <button onClick={() => removeSection(sec.id)} className="btn-ghost shrink-0 p-1 text-ink-3 hover:text-[#ec7f97]" title="Supprimer la section">
                    <Trash2 size={12} />
                  </button>
                </div>
                <ul className="space-y-0.5">
                  {sec.items.map((it) => (
                    <li key={it.id} className="group flex items-center gap-1.5">
                      <button onClick={() => toggleItem(sec.id, it.id)} className="shrink-0" aria-label={it.done ? 'Décocher' : 'Cocher'}>
                        {it.done ? <CheckCircle2 size={15} className="text-[#4cc79a]" /> : <Circle size={15} className="text-ink-3 hover:text-sun" />}
                      </button>
                      <input defaultValue={it.label} key={it.label}
                        onBlur={(e) => { if (e.target.value.trim() !== it.label) renameItem(sec.id, it.id, e.target.value) }}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                        className={`min-w-0 flex-1 bg-transparent text-[13px] outline-none ${it.done ? 'text-ink-3 line-through' : 'text-ink'}`} />
                      <button onClick={() => removeItem(sec.id, it.id)}
                        className="btn-ghost shrink-0 p-0.5 text-ink-3 opacity-0 transition-opacity hover:text-[#ec7f97] group-hover:opacity-100" title="Supprimer">
                        <X size={13} />
                      </button>
                    </li>
                  ))}
                  <li className="flex items-center gap-1.5">
                    <Plus size={14} className="shrink-0 text-ink-3" />
                    <input placeholder="Ajouter une tâche…"
                      onKeyDown={(e) => { if (e.key === 'Enter') { addItem(sec.id, e.currentTarget.value); e.currentTarget.value = '' } }}
                      className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3" />
                  </li>
                </ul>
              </div>
            )
          })}
          <button onClick={addSection} className="flex items-center gap-1 text-[11px] text-ink-3 hover:text-ink">
            <Plus size={12} /> Ajouter une section
          </button>
        </div>
      )}
    </Card>
  )
}

function CheckForm({ open, check, onClose }: { open: boolean; check: CheckRow | null; onClose: () => void }) {
  const s = useHorizon()
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<CheckKind>('periodique')
  const [domainId, setDomainId] = useState<string>('')
  const [link, setLink] = useState('')
  const [intervalDays, setIntervalDays] = useState(30)
  const [windowMonths, setWindowMonths] = useState(6)
  const [category, setCategory] = useState('Vacances')
  const [initFor, setInitFor] = useState<string | null>(null)

  // (Ré)initialise les champs à chaque ouverture / changement de cible.
  const key = open ? (check?.id ?? 'new') : null
  if (open && initFor !== key) {
    setInitFor(key)
    setTitle(check?.title ?? '')
    setKind(check?.kind ?? 'periodique')
    setDomainId(check?.domain_id ?? '')
    setLink(check?.link ?? '')
    setIntervalDays(check?.interval_days ?? 30)
    setWindowMonths(check?.window_months ?? 6)
    setCategory(((check?.config as unknown as ChecklistConfig | undefined)?.category) ?? 'Vacances')
  }
  if (open && initFor === null) setInitFor(key)
  if (!open && initFor !== null) setInitFor(null)

  if (!open) return null

  const save = async () => {
    if (!title.trim()) return
    if (kind === 'checklist') {
      if (check) {
        // Édition : on garde les sections existantes, on met à jour titre / catégorie / domaine.
        const cfg = (check.config ?? {}) as unknown as ChecklistConfig
        await s.update('checks', check.id, {
          title: title.trim(), kind, domain_id: domainId || null,
          config: { ...cfg, category: category.trim() || undefined },
        })
      } else {
        // Création : liste pré-remplie d'après le modèle de la catégorie.
        await s.insert('checks', {
          title: title.trim(), kind, domain_id: domainId || null, link: null,
          interval_days: null, window_months: 6, active: true, resolved: [],
          config: checklistTemplate(category), sort_order: s.checks.length,
        })
      }
      onClose()
      return
    }
    const values = {
      title: title.trim(),
      kind,
      domain_id: domainId || null,
      link: link.trim() || null,
      interval_days: kind === 'periodique' ? intervalDays : null,
      window_months: windowMonths,
    }
    if (check) await s.update('checks', check.id, values)
    else await s.insert('checks', { ...values, active: true, resolved: [], config: {}, sort_order: s.checks.length })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={check ? 'Modifier la vérification' : 'Nouvelle vérification'}>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-ink-3">Intitulé</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
            placeholder={kind === 'checklist' ? 'Ex. Vacances Août 2026' : 'Ex. Vérifier mes inscriptions aux stages'} className="field w-full" />
        </div>

        <div>
          <label className="mb-1 block text-xs text-ink-3">Type</label>
          <Seg value={kind} onChange={setKind} options={[
            { value: 'periodique', label: 'Périodique' },
            { value: 'messe_travail', label: 'Messe' },
            { value: 'checklist', label: 'Liste' },
          ]} />
          <p className="mt-1 text-xs text-ink-3">
            {kind === 'periodique'
              ? 'Revient à intervalle régulier jusqu\'à ce que tu la marques « vérifiée ».'
              : kind === 'messe_travail'
                ? 'Remonte les jours d\'obligation et les grandes fêtes catholiques (travaillés ou en séjour) où il faut trouver une messe.'
                : 'Une liste de tâches à cocher, groupées par section. La catégorie regroupe les listes d\'une même famille (ex. Vacances).'}
          </p>
        </div>

        {kind === 'checklist' && (
          <div>
            <label className="mb-1 block text-xs text-ink-3">Catégorie</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} list="checklist-categories"
              placeholder="Vacances" className="field w-full" />
            <datalist id="checklist-categories">
              {[...new Set(s.checks.filter((c) => c.kind === 'checklist').map((c) => (c.config as unknown as ChecklistConfig)?.category).filter(Boolean))]
                .map((c) => <option key={c} value={c as string} />)}
              <option value="Vacances" />
            </datalist>
            {!check && (
              <p className="mt-1 text-xs text-ink-3">La catégorie « Vacances » crée une liste pré-remplie (départ, maison, route, retour) — à ajuster ensuite.</p>
            )}
          </div>
        )}

        {kind === 'periodique' && (
          <div>
            <label className="mb-1 block text-xs text-ink-3">Fréquence</label>
            <select value={intervalDays} onChange={(e) => setIntervalDays(Number(e.target.value))} className="field w-full">
              {INTERVAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-ink-3">Domaine (facultatif)</label>
            <select value={domainId} onChange={(e) => setDomainId(e.target.value)} className="field w-full">
              <option value="">—</option>
              {s.domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          {kind !== 'checklist' && (
            <div>
              <label className="mb-1 block text-xs text-ink-3">Fenêtre (mois)</label>
              <input type="number" min={1} max={24} value={windowMonths}
                onChange={(e) => setWindowMonths(Math.max(1, Number(e.target.value) || 1))} className="field w-full" />
            </div>
          )}
        </div>

        {kind !== 'checklist' && (
          <div>
            <label className="mb-1 block text-xs text-ink-3">Lien utile (facultatif)</label>
            <input value={link} onChange={(e) => setLink(e.target.value)} type="url"
              placeholder="https://messes.info/horaires/reims" className="field w-full" />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm">Annuler</button>
          <button onClick={() => void save()} disabled={!title.trim()}
            className="btn-sun px-4 py-2 text-sm disabled:opacity-50">{check ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </div>
    </Modal>
  )
}
