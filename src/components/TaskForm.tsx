import { useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ArrowRightToLine, CalendarDays, Copy, Flag, MapPin, Minus, Plus, Repeat, Siren, SquareCheckBig, Star, Timer, Trash2, X } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { copieDeTache } from '../lib/logic'
import {
  ajusterDuree, decomposerDuree, libelleDuree, niveauSuivant, NOMS_NIVEAU, PRESETS_DUREE,
  projetsEnPastilles, valeursTache, type FormTache,
} from '../lib/tacheForm'
import { Modal, NoteArea, DomainDot } from './ui'
import { IconeProjet } from './IconeProjet'
import type { Task } from '../lib/types'

/** Une tâche est ancrée à un projet OU librement à un domaine (jamais nulle part). */
export function TaskForm({ open, task, defaultDate, defaultIsTask = false, defaultImportance = null, defaultUrgence = null, onClose }: {
  open: boolean; task: Task | null; defaultDate?: string
  defaultIsTask?: boolean; defaultImportance?: number | null; defaultUrgence?: number | null; onClose: () => void
}) {
  const s = useHorizon()
  const [form, setForm] = useState<Record<string, unknown> | null>(null)
  // Copie vers un autre jour (téléphone : pas de Ctrl + glisser). `null` = non demandée.
  const [copieDate, setCopieDate] = useState<string | null>(null)
  // Rangée « Lieu » : ouverte à la demande (ou d'office si un lieu est déjà saisi).
  const [lieuOuvert, setLieuOuvert] = useState<boolean | null>(null)

  if (!open) return null

  const initDur = decomposerDuree(task?.duration_min)

  const current = (form ?? {
    title: task?.title ?? '',
    anchor: task?.project_id ? `p:${task.project_id}` : `d:${task?.domain_id ?? s.domains[0]?.id ?? ''}`,
    scheduled_date: task?.scheduled_date ?? defaultDate ?? '',
    dur_value: initDur.value,
    dur_unit: initDur.unit,
    end_date: task?.end_date ?? '',
    is_task: task?.is_task ?? defaultIsTask,
    importance: task?.importance ?? defaultImportance,
    urgence: task?.urgence ?? defaultUrgence,
    is_recurring: task?.is_recurring ?? false,
    recur_kind: task?.recurrence_rule?.split(':')[0] ?? 'weekly',
    recur_days: task?.recurrence_rule?.startsWith('weekly') ? (task.recurrence_rule.split(':')[1] ?? '') : '1',
    recur_dom: task?.recurrence_rule?.startsWith('monthly') ? (task.recurrence_rule.split(':')[1] ?? '1') : '1',
    notable: task?.notable ?? false,
    location: task?.location ?? '',
    notes: task?.notes ?? '',
  }) as FormTache & Record<string, unknown>
  const setF = (k: string, v: unknown) => setForm({ ...current, [k]: v })
  const close = () => { setForm(null); setCopieDate(null); setLieuOuvert(null); onClose() }

  // Rattachement : `p:<projet>` ou `d:<domaine>`.
  const anchor = current.anchor as string
  const anchorProject = anchor.startsWith('p:') ? s.projects.find((p) => p.id === anchor.slice(2)) : undefined
  // Projets actifs, plus celui auquel la tâche est déjà rattachée même s'il ne l'est plus.
  const projetsProposes = s.projects.filter((p) => p.status === 'actif' || p.id === anchorProject?.id)
  const estTache = current.is_task as boolean
  const lieuVisible = !estTache && (lieuOuvert ?? !!current.location)
  const enPastilles = projetsEnPastilles(projetsProposes.length, !!anchorProject)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const values = valeursTache(current)
    if (task) await s.update('tasks', task.id, values)
    else await s.insert('tasks', { ...values, status: 'a_faire' })
    close()
  }

  const DAYS: [string, string][] = [['1', 'L'], ['2', 'M'], ['3', 'M'], ['4', 'J'], ['5', 'V'], ['6', 'S'], ['7', 'D']]
  const selectedDays = String(current.recur_days).split(',').filter(Boolean)
  const titreFenetre = task
    ? (estTache ? 'Modifier la tâche' : "Modifier l'évènement")
    : (estTache ? 'Nouvelle tâche' : 'Nouvel évènement')

  const puce = 'flex min-w-0 items-center justify-center gap-1.5 rounded-[10px] border px-2.5 text-[13px] transition-colors'
  const on = 'border-sun bg-sun/15 text-sun-soft'
  const off = 'border-line-2 bg-panel-2 text-ink-2 hover:text-ink'
  const pastille = 'flex h-8 min-w-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border text-[12.5px] transition-colors'

  return (
    // D (maquette validée) : tout tient sans défiler sur 390 × 780. Les champs
    // défilent seuls (clavier ouvert) ; Annuler / Créer restent en bas.
    <Modal open onClose={close} title={titreFenetre} pied>
      <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1 space-y-[7px] overflow-y-auto">
          <input required value={current.title as string} onChange={(e) => setF('title', e.target.value)}
            placeholder="Titre (ajoute l'heure : 16h30)" className="field h-[42px] !border-sun/70 text-[15px]" autoFocus />

          {/* Domaine : une ligne, les pastilles se partagent la largeur ; seul le
              domaine choisi (ou celui du projet, en pointillé) affiche son nom. */}
          <div className="flex gap-1.5" role="group" aria-label="Domaine de vie">
            {s.domains.map((d) => {
              const direct = anchor === `d:${d.id}`
              const viaProjet = !direct && anchorProject?.domain_id === d.id
              const nomme = direct || viaProjet
              return (
                <button key={d.id} type="button" onClick={() => setF('anchor', `d:${d.id}`)}
                  aria-pressed={direct} title={d.name} aria-label={d.name}
                  className={`${pastille} ${nomme ? 'flex-[3] px-2.5' : 'flex-1 px-0'} ${
                    direct ? 'border-sun bg-sun/15 text-sun-soft'
                      : viaProjet ? 'border-dashed border-sun/60 bg-panel-2 text-ink-2'
                        : 'border-line-2 bg-panel-2 text-ink-3 hover:text-ink-2'}`}>
                  <DomainDot color={d.color} />
                  {nomme && <span className="min-w-0 truncate">{d.name}</span>}
                </button>
              )
            })}
          </div>

          {/* Projet : une ligne, sans défilement ni retour à la ligne. Trop de
              projets → les non choisis deviennent de courtes pastilles (icône). */}
          {projetsProposes.length > 0 && (
            <div className="flex gap-1.5 overflow-hidden" role="group" aria-label="Projet (facultatif)">
              {projetsProposes.map((p) => {
                const choisi = anchorProject?.id === p.id
                const court = enPastilles && !choisi
                return (
                  <button key={p.id} type="button" aria-pressed={choisi} title={p.title}
                    aria-label={`Projet ${p.title}`}
                    onClick={() => setF('anchor', choisi ? `d:${p.domain_id ?? s.domains[0]?.id ?? ''}` : `p:${p.id}`)}
                    className={`${pastille} px-2 ${court ? 'w-8 flex-none px-0' : choisi ? 'flex-[3]' : 'flex-1'} ${
                      choisi ? 'border-sun bg-sun/15 text-sun-soft' : 'border-line-2 bg-panel-2 text-ink-3 hover:text-ink-2'}`}>
                    <IconeProjet project={p} size={13} />
                    {!court && <span className="min-w-0 truncate">{p.title}</span>}
                  </button>
                )
              })}
            </div>
          )}

          {/* Date · jusqu'au · durée (puces-icônes). La durée s'ouvre dans un popover. */}
          <div className="relative grid grid-cols-[1.3fr_1.3fr_0.8fr] gap-1.5">
            <ChipDate icone={<CalendarDays size={15} />} libelle="Date" value={current.scheduled_date as string}
              onChange={(v) => setF('scheduled_date', v)} className={puce} on={on} off={off} />
            <ChipDate icone={<ArrowRightToLine size={15} />} libelle="Jusqu'au" value={current.end_date as string}
              onChange={(v) => setF('end_date', v)} className={puce} on={on} off={off} min={current.scheduled_date as string} effacable />
            <ChipDuree value={current.dur_value as string} unit={current.dur_unit as string}
              desactive={!!current.end_date} className={puce} on={on} off={off}
              onChange={(v, u) => setForm({ ...current, dur_value: v, dur_unit: u })} />
          </div>

          {/* Importance · urgence : un appui = niveau suivant (Basse → Moyenne → Haute). */}
          <div className="grid grid-cols-2 gap-1.5">
            {([['importance', 'Importance', Flag], ['urgence', 'Urgence', Siren]] as const).map(([k, nom, Ic]) => {
              const v = current[k] as number | null
              return (
                <button key={k} type="button" onClick={() => setF(k, niveauSuivant(v))}
                  aria-label={`${nom} : ${NOMS_NIVEAU[v ?? 0]}`} title={`${nom} : ${NOMS_NIVEAU[v ?? 0]}`}
                  className={`${puce} h-9 !justify-start ${v ? on : off}`}>
                  <Ic size={14} className="shrink-0" />
                  <span className="min-w-0 truncate">{nom}</span>
                  <span className="ml-auto flex shrink-0 gap-0.5" aria-hidden>
                    {[1, 2, 3].map((n) => (
                      <i key={n} className={`h-3 w-[5px] rounded-sm ${(v ?? 0) >= n ? 'bg-sun' : 'bg-line-2'}`} />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Tâche · notable · lieu (évènement seulement) · répétition */}
          <div className="flex gap-1.5">
            <button type="button" aria-pressed={estTache} onClick={() => setF('is_task', !estTache)}
              title="Apparaît dans Priorités" className={`${puce} h-8 flex-1 text-[12px] ${estTache ? on : off}`}>
              <SquareCheckBig size={14} className="shrink-0" /><span className="truncate">Tâche</span>
            </button>
            <button type="button" aria-pressed={current.notable as boolean} onClick={() => setF('notable', !current.notable)}
              className={`${puce} h-8 flex-1 text-[12px] ${current.notable ? on : off}`}>
              <Star size={14} className="shrink-0" /><span className="truncate">Notable</span>
            </button>
            {!estTache && (
              <button type="button" aria-pressed={lieuVisible}
                onClick={() => {
                  if (lieuVisible) { setF('location', ''); setLieuOuvert(false) } else setLieuOuvert(true)
                }}
                title="Lieu du séjour : change où chercher les messes ces jours-là"
                className={`${puce} h-8 flex-1 text-[12px] ${lieuVisible ? on : off}`}>
                <MapPin size={14} className="shrink-0" /><span className="truncate">Lieu</span>
              </button>
            )}
            <button type="button" aria-pressed={current.is_recurring as boolean}
              onClick={() => setF('is_recurring', !current.is_recurring)}
              title="Répétition (poubelles, factures…)" aria-label="Répétition"
              className={`${puce} h-8 w-9 flex-none px-0 ${current.is_recurring ? on : off}`}>
              <Repeat size={15} />
            </button>
          </div>

          {lieuVisible && (
            <div className="relative">
              <MapPin size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input value={current.location as string} onChange={(e) => setF('location', e.target.value)}
                placeholder="Ville du séjour (vide = domicile)" className="field h-9 !pl-9 text-[13px]" autoFocus />
            </div>
          )}

          {(current.is_recurring as boolean) && (
            <div className="flex flex-wrap items-center gap-2">
              <select value={current.recur_kind as string} onChange={(e) => setF('recur_kind', e.target.value)}
                className="field h-9 w-auto !py-0 text-[13px]">
                <option value="daily">Chaque jour</option>
                <option value="weekly">Chaque semaine</option>
                <option value="monthly">Chaque mois</option>
              </select>
              {current.recur_kind === 'weekly' && (
                <div className="flex gap-1">
                  {DAYS.map(([v, l], i) => (
                    <button key={v} type="button" aria-label={`Jour ${i + 1}`}
                      onClick={() => {
                        const next = selectedDays.includes(v)
                          ? selectedDays.filter((x) => x !== v) : [...selectedDays, v]
                        setF('recur_days', next.sort().join(','))
                      }}
                      className={`h-[26px] w-[26px] rounded-full border text-[11px] transition-colors ${
                        selectedDays.includes(v) ? on : 'border-line-2 text-ink-3'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              )}
              {current.recur_kind === 'monthly' && (
                <label className="flex items-center gap-2 text-xs text-ink-3">
                  le
                  <input type="number" min={1} max={28} value={current.recur_dom as string}
                    onChange={(e) => setF('recur_dom', e.target.value)} className="field h-9 w-16 !py-0" />
                  du mois
                </label>
              )}
            </div>
          )}

          <NoteArea value={current.notes as string} onChange={(v) => setF('notes', v)}
            placeholder="Note…" rows={2} compact />

          {/* Copier sur un autre jour : le geste du téléphone (Ctrl + glisser sur PC). */}
          {task && !task.is_recurring && copieDate !== null && (
            <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line px-3 py-2">
              <label className="space-y-0.5 text-xs text-ink-3">
                Copier sur le
                <input type="date" value={copieDate} onChange={(e) => setCopieDate(e.target.value)} className="field" autoFocus />
              </label>
              <button type="button" disabled={!copieDate}
                onClick={async () => { await s.insert('tasks', copieDeTache(task, copieDate)); close() }}
                className="btn-sun px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50">Copier</button>
              <button type="button" onClick={() => setCopieDate(null)} className="btn-ghost px-3 py-2 text-sm">Annuler</button>
            </div>
          )}
        </div>

        <div className="mt-2.5 flex shrink-0 gap-1.5">
          {task ? (
            <>
              <button type="button" aria-label="Supprimer" title="Supprimer" onClick={() => {
                if (!confirm(`Supprimer « ${task.title} » ?`)) return
                void s.remove('tasks', task.id); close()
              }} className="btn-ghost grid h-11 w-11 shrink-0 place-items-center text-[#ec7f97]"><Trash2 size={17} /></button>
              {!task.is_recurring && (
                <button type="button" aria-label="Copier sur un autre jour" title="Copier…"
                  onClick={() => setCopieDate(task.scheduled_date ?? '')}
                  className="btn-ghost grid h-11 w-11 shrink-0 place-items-center"><Copy size={17} /></button>
              )}
            </>
          ) : (
            <button type="button" onClick={close} className="btn-ghost h-11 px-4 text-sm">Annuler</button>
          )}
          <button type="submit" className="btn-sun h-11 flex-1 text-[15px]">{task ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </form>
    </Modal>
  )
}

/** Puce-icône qui ouvre le sélecteur de date natif (champ invisible par-dessus). */
function ChipDate({ icone, libelle, value, onChange, className, on, off, min, effacable = false }: {
  icone: React.ReactNode; libelle: string; value: string; onChange: (v: string) => void
  className: string; on: string; off: string; min?: string; effacable?: boolean
}) {
  return (
    <div className={`relative h-9 ${className} ${value ? `${on} ${effacable ? '!gap-1 !px-2 !text-[12px]' : ''}` : off}`}>
      <span className="shrink-0">{icone}</span>
      <span className={`min-w-0 truncate ${value ? '' : 'text-ink-3'}`}>
        {value ? format(parseISO(value), 'EEE d MMM', { locale: fr }) : libelle}
      </span>
      <input type="date" value={value} min={min || undefined} aria-label={libelle}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => { try { e.currentTarget.showPicker() } catch { /* navigateur sans showPicker */ } }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      {value && effacable && (
        <button type="button" aria-label={`Effacer « ${libelle} »`} onClick={() => onChange('')}
          className="relative z-10 -mr-1 shrink-0 rounded-full p-0.5 text-ink-3 hover:text-ink"><X size={13} /></button>
      )}
    </div>
  )
}

/** Puce de durée + popover (−/+, min/heure/jour, préréglages). Grisée si « jusqu'au » est rempli. */
function ChipDuree({ value, unit, desactive, onChange, className, on, off }: {
  value: string; unit: string; desactive: boolean; onChange: (v: string, u: string) => void
  className: string; on: string; off: string
}) {
  const [ouvert, setOuvert] = useState(false)
  const bouton = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: Event) => {
      const t = e.target as Node
      if (!bouton.current?.contains(t) && !pop.current?.contains(t)) setOuvert(false)
    }
    document.addEventListener('mousedown', dehors); document.addEventListener('touchstart', dehors)
    return () => { document.removeEventListener('mousedown', dehors); document.removeEventListener('touchstart', dehors) }
  }, [ouvert])
  const rempli = !!value && !desactive
  return (
    <>
      <button ref={bouton} type="button" disabled={desactive} onClick={() => setOuvert(!ouvert)}
        aria-label={`Durée : ${libelleDuree(value, unit)}`} aria-expanded={ouvert}
        title={desactive ? "Remplacée par « Jusqu'au »" : 'Durée'}
        className={`${className} h-9 ${desactive ? 'cursor-not-allowed border-line bg-panel-2/50 text-ink-3 opacity-50' : rempli ? on : off}`}>
        <Timer size={15} className="shrink-0" />
        <span className="truncate">{desactive ? '—' : libelleDuree(value, unit)}</span>
      </button>
      {ouvert && !desactive && (
        <div ref={pop} className="absolute inset-x-0 top-full z-20 mt-1 space-y-1.5 rounded-xl border border-sun bg-panel-3 p-2 shadow-2xl">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Moins" onClick={() => onChange(ajusterDuree(value, unit, -1), unit)}
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-2 hover:bg-white/5"><Minus size={16} /></button>
            <input type="number" min={1} step={1} value={value} placeholder="—" inputMode="numeric"
              onChange={(e) => onChange(e.target.value, unit)} aria-label="Valeur de la durée"
              className="w-12 bg-transparent text-center text-[15px] font-semibold outline-none" />
            <button type="button" aria-label="Plus" onClick={() => onChange(ajusterDuree(value, unit, 1), unit)}
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-2 hover:bg-white/5"><Plus size={16} /></button>
            <div className="ml-auto flex overflow-hidden rounded-lg border border-line-2">
              {([['min', 'min'], ['heure', 'heure'], ['jour', 'jour']] as const).map(([u, l]) => (
                <button key={u} type="button" onClick={() => onChange(value, u)}
                  className={`px-2.5 py-1.5 text-xs ${unit === u ? 'bg-sun/20 text-sun-soft' : 'bg-panel-2 text-ink-2'}`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-1.5">
            {PRESETS_DUREE.map((p) => {
              const actif = value === p.value && unit === p.unit
              return (
                <button key={p.label} type="button" onClick={() => { onChange(p.value, p.unit); setOuvert(false) }}
                  className={`h-8 min-w-0 flex-1 rounded-[10px] border text-[12px] ${actif ? on : 'border-line-2 bg-panel-2 text-ink-2'}`}>{p.label}</button>
              )
            })}
            <button type="button" aria-label="Effacer la durée" title="Aucune durée"
              onClick={() => { onChange('', unit); setOuvert(false) }}
              className="grid h-8 w-8 flex-none place-items-center rounded-[10px] border border-line-2 bg-panel-2 text-ink-3"><X size={13} /></button>
          </div>
        </div>
      )}
    </>
  )
}
