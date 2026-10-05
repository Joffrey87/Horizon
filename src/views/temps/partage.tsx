// Éléments communs aux vues du calendrier « Temps » (types, couches, glisser-déposer).
import { createContext, useContext } from 'react'
import { useHorizon } from '../../lib/store'
import { iso } from '../../lib/logic'
import type { CelesteProposal, Step, Task } from '../../lib/types'

export type Kind = 'task' | 'step' | 'objective'

// Couleur de repli pour un évènement multi-jours sans domaine (ex. vacances) : un teal « détente ».
export const EVENT_DEFAULT_COLOR = '#46b3a9'

// ---- Couches du calendrier (affichables/masquables), mémorisées par appareil ----
export type CalLayers = { taches: boolean; fetes: boolean; messes: boolean; anniversaires: boolean; aril: boolean }
export const DEFAULT_LAYERS: CalLayers = { taches: true, fetes: true, messes: true, anniversaires: true, aril: true }
export const LAYER_DEFS: { key: keyof CalLayers; label: string }[] = [
  { key: 'taches', label: 'Tâches' },
  { key: 'fetes', label: 'Fêtes' },
  { key: 'messes', label: 'Messes' },
  { key: 'anniversaires', label: 'Anniversaires' },
  { key: 'aril', label: 'ARIL' },
]
export const LAYERS_KEY = 'horizon.temps.layers'
export function loadLayers(): CalLayers {
  try { return { ...DEFAULT_LAYERS, ...(JSON.parse(localStorage.getItem(LAYERS_KEY) ?? '{}') as Partial<CalLayers>) } }
  catch { return DEFAULT_LAYERS }
}
export const LayersCtx = createContext<{ layers: CalLayers; arilId: string | null }>({ layers: DEFAULT_LAYERS, arilId: null })
// Ouvre le sélecteur de messe : jours de dévotion (1er vendredi/samedi) et grandes fêtes.
export const MassPickCtx = createContext<(dayIso: string, label: string) => void>(() => {})

/** Couches actives + prédicats de visibilité (un élément « ARIL » = rattaché au domaine « ARIL »). */
export function useLayerFilter() {
  const s = useHorizon()
  const { layers, arilId } = useContext(LayersCtx)
  const domainVisible = (domainId: string | null) =>
    arilId != null && domainId === arilId ? layers.aril : layers.taches
  const taskVisible = (t: Task) =>
    domainVisible(t.domain_id ?? s.projects.find((p) => p.id === t.project_id)?.domain_id ?? null)
  const stepVisible = (st: Step) =>
    domainVisible(s.projects.find((p) => p.id === st.project_id)?.domain_id ?? null)
  return { layers, taskVisible, stepVisible, domainVisible }
}

export type MoveFn = (kind: Kind, id: string, dayIso: string) => void

export function stepsForDay(steps: Step[], day: Date): Step[] {
  const d = iso(day)
  return steps.filter((st) => st.scheduled_date === d || st.due_date === d)
}

export const dragData = (kind: Kind, id: string) => (e: React.DragEvent) => {
  e.dataTransfer.setData('application/horizon', JSON.stringify({ kind, id }))
  e.dataTransfer.effectAllowed = 'move'
}

export function readDrag(e: React.DragEvent): { kind: Kind; id: string } | null {
  const raw = e.dataTransfer.getData('application/horizon')
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

/** Rempla Céleste PROPOSÉ (en attente de ta décision) ce jour-là. */
export function remplaProposeOn(proposals: CelesteProposal[], dayIso: string): CelesteProposal | null {
  return proposals.find((p) => p.status === 'proposee' && p.date === dayIso) ?? null
}
