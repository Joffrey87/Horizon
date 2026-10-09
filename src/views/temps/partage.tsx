// Éléments communs aux vues du calendrier « Temps » (types, glisser-déposer).
import { createContext } from 'react'
import { iso } from '../../lib/logic'
import type { CelesteProposal, Step } from '../../lib/types'

export type Kind = 'task' | 'step' | 'objective'

// Couleur de repli pour un évènement multi-jours sans domaine (ex. vacances) : un teal « détente ».
export const EVENT_DEFAULT_COLOR = '#46b3a9'

// Ouvre le sélecteur de messe : jours de dévotion (1er vendredi/samedi) et grandes fêtes.
export const MassPickCtx = createContext<(dayIso: string, label: string) => void>(() => {})

/** `copier` : Ctrl (ou Option sur Mac) tenu au dépôt — on COPIE au lieu de déplacer. */
export type MoveFn = (kind: Kind, id: string, dayIso: string, copier?: boolean) => void

/** Ctrl (PC) ou Option/Alt (Mac) tenu pendant le glisser-déposer. */
export const veutCopier = (e: React.DragEvent) => e.ctrlKey || e.altKey

/** Survol d'une zone de dépôt : le curseur montre « + » quand Ctrl est tenu. */
export const survol = (e: React.DragEvent) => {
  e.preventDefault()
  e.dataTransfer.dropEffect = veutCopier(e) ? 'copy' : 'move'
}

export function stepsForDay(steps: Step[], day: Date): Step[] {
  const d = iso(day)
  return steps.filter((st) => st.scheduled_date === d || st.due_date === d)
}

export const dragData = (kind: Kind, id: string) => (e: React.DragEvent) => {
  e.dataTransfer.setData('application/horizon', JSON.stringify({ kind, id }))
  e.dataTransfer.effectAllowed = 'copyMove'
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
