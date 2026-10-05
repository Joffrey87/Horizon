import { useState } from 'react'
import { format, getISODay, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ExternalLink, Check, X } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { massesInfoUrl, tripLocationOn, citySlug, hasMaintainedMasses, workShiftOn, massFitsShift, fmtMinutes } from '../../lib/logic'
import { Modal } from '../../components/ui'
import type { MassConfig, MassSlot } from '../../lib/types'
import { MassPickCtx } from './partage'

// ---- Sélecteur de messe (jours de dévotion, grandes fêtes, case du jour) ---

/** Rend le sélecteur de messe utilisable hors de « Temps » (accueil).
 *  Enveloppe des `DayCell` : leurs croix ✝ ouvrent alors le même modal. */
export function MassPickProvider({ children }: { children: React.ReactNode }) {
  const [pick, setPick] = useState<{ date: string; label: string } | null>(null)
  return (
    <MassPickCtx.Provider value={(date, label) => setPick({ date, label })}>
      {children}
      {pick && <MassPicker pick={pick} onClose={() => setPick(null)} />}
    </MassPickCtx.Provider>
  )
}


export function MassPicker({ pick, onClose }: { pick: { date: string; label: string }; onClose: () => void }) {
  const s = useHorizon()
  const check = s.checks.find((c) => c.kind === 'messe_travail')
  const cfg = (check?.config ?? {}) as MassConfig
  const chosen = cfg.chosen ?? {}
  const homeCity = s.settings?.home_city?.trim() || 'Reims'
  // Même logique que Vérifications : la ville du jour (séjour éventuel), sa liste
  // horaire si on en maintient une, et la garde CAPS pour signaler les créneaux impossibles.
  const city = tripLocationOn(s.tasks, pick.date) ?? homeCity
  const wd = String(getISODay(parseISO(pick.date)))
  const cityMasses = cfg.massesByCity?.[citySlug(city)] ?? (hasMaintainedMasses(city) ? cfg.masses : undefined)
  const masses: MassSlot[] = cityMasses?.[wd] ?? []
  const shift = workShiftOn(s.tasks, pick.date)
  const current = chosen[pick.date]
  const tag = check ? `source:check:${check.id}` : ''

  // Pose l'évènement calendaire pour ce jour (en remplaçant l'ancien s'il existe).
  const setEvent = async (title: string) => {
    const prev = s.tasks.find((t) => t.notes === tag && t.scheduled_date === pick.date)
    if (prev) await s.remove('tasks', prev.id)
    if (title) await s.insert('tasks', {
      title, is_task: false, scheduled_date: pick.date,
      domain_id: check?.domain_id ?? null, duration_min: 60, notes: tag, status: 'a_faire',
    })
  }
  const choose = async (m: MassSlot) => {
    if (!check) return
    await setEvent(`Messe ${m.t.replace(':', 'h')} — ${m.c}`)
    await s.update('checks', check.id, { config: { ...cfg, chosen: { ...chosen, [pick.date]: `${m.t} ${m.c}` } } })
    onClose()
  }
  // Ville sans liste horaire (séjour) : on note « j'y vais », l'horaire se choisit sur messes.info.
  const chooseAway = async () => {
    if (!check) return
    await setEvent(`Messe — ${city}`)
    await s.update('checks', check.id, { config: { ...cfg, chosen: { ...chosen, [pick.date]: `Messe à ${city}` } } })
    onClose()
  }
  const clear = async () => {
    if (!check) return
    await setEvent('')
    const next = { ...chosen }; delete next[pick.date]
    await s.update('checks', check.id, { config: { ...cfg, chosen: next } })
    onClose()
  }

  const dayLabel = format(parseISO(pick.date), 'EEEE d MMMM', { locale: fr })

  return (
    <Modal open onClose={onClose} title={pick.label ? `Messe — ${pick.label}` : 'Messe'}>
      <p className="mb-1 text-sm capitalize text-ink-2">{dayLabel}</p>
      {!check ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-3">
            Configure une vérification « messe » (onglet Vérifications) pour mémoriser tes choix de messe.
            En attendant, voici où chercher un horaire :
          </p>
          <a href={massesInfoUrl(city)} target="_blank" rel="noopener noreferrer"
            className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
            <ExternalLink size={13} /> Voir les messes sur messes.info ({city})
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          {current && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-good/40 bg-good/10 px-3 py-2">
              <span className="text-sm text-ink">Choisie : {current}</span>
              <button onClick={() => void clear()} className="btn-ghost flex items-center gap-1 px-2 py-1 text-xs" title="Retirer le choix">
                <X size={13} /> Retirer
              </button>
            </div>
          )}
          {(city !== homeCity || shift) && (
            <p className="text-xs text-ink-3">
              {city !== homeCity && <>En séjour à <span className="font-medium text-[#a78bfa]">{city}</span>. </>}
              {shift && <>Tu travailles ce jour-là ({shift.code || `${fmtMinutes(shift.start)}–${fmtMinutes(shift.end)}`}).</>}
            </p>
          )}
          {masses.length > 0 ? (
            <ul className="space-y-1">
              {masses.map((m) => {
                const val = `${m.t} ${m.c}`
                const active = current === val
                const clash = shift ? !massFitsShift(m.t, shift) : false
                return (
                  <li key={val}>
                    <button onClick={() => void choose(m)}
                      title={clash ? 'Horaire incompatible avec ta garde ce jour-là' : undefined}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-sm transition-colors ${
                        active ? 'border-good/60 bg-good/10' : 'border-line hover:bg-panel-2'
                      } ${clash && !active ? 'opacity-50' : ''}`}>
                      <span className="w-14 shrink-0 tabular-nums text-ink-2">{m.t}</span>
                      <span className="min-w-0 flex-1 truncate text-ink">{m.c}</span>
                      {clash && !active && <span className="shrink-0 text-[10px] text-ink-3">pendant la garde</span>}
                      {active && <Check size={14} className="text-good" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">
              {city === homeCity
                ? 'Aucun horaire connu pour ce jour dans ta liste. Utilise le lien ci-dessous.'
                : `Pas de liste horaire pour ${city} : cherche l'horaire sur messes.info, puis note que tu y vas.`}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <a href={massesInfoUrl(city)} target="_blank" rel="noopener noreferrer"
              className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
              <ExternalLink size={13} /> Voir les messes sur messes.info ({city})
            </a>
            {masses.length === 0 && current !== `Messe à ${city}` && (
              <button onClick={() => void chooseAway()} className="btn-ghost px-3 py-1.5 text-xs text-[#4cc79a]"
                title="Poser la messe au calendrier (sans horaire)">
                J'y vais
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
