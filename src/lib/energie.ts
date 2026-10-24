// Consommation Engie d'un contrat (Reims : élec + gaz ; Taissy : élec), d'après les relevés réels.
import type { FinEnergieConso } from './types'

export type SiteEnergie = FinEnergieConso['site']
export type Energie = FinEnergieConso['energie']

/** Contrat Engie d'une opération, d'après son intitulé affiché (ou bancaire). */
export function siteEnergie(...libelles: (string | null | undefined)[]): SiteEnergie | null {
  const t = libelles.filter(Boolean).join(' ').toLowerCase()
  if (!t.includes('engie')) return null
  if (t.includes('taissy')) return 'taissy'
  if (t.includes('reims')) return 'reims'
  return null
}

export const ENERGIES: Record<SiteEnergie, Energie[]> = { reims: ['elec', 'gaz'], taissy: ['elec'] }
export const NOM_SITE: Record<SiteEnergie, string> = { reims: 'Reims', taissy: 'Taissy' }

export interface PointConso { mois: string; kwh: number; precedent: number | null }
export interface ResumeConso { energie: Energie; points: PointConso[]; total: number; totalPrecedent: number | null; variation: number | null }

const moisDe = (r: FinEnergieConso) => r.periode_debut.slice(0, 7)
const anMoins = (mois: string) => `${Number(mois.slice(0, 4)) - 1}${mois.slice(4)}`

/** Les `n` derniers relevés, chacun comparé au relevé du même mois un an plus tôt (null s'il n'existe pas). */
export function resumeConso(releves: FinEnergieConso[], site: SiteEnergie, energie: Energie, n: number): ResumeConso {
  const rs = releves.filter((r) => r.site === site && r.energie === energie && r.kwh != null)
    .sort((a, b) => a.periode_debut.localeCompare(b.periode_debut))
  const parMois = new Map(rs.map((r) => [moisDe(r), Number(r.kwh)]))
  const points = rs.slice(-n).map((r) => ({ mois: moisDe(r), kwh: Number(r.kwh), precedent: parMois.get(anMoins(moisDe(r))) ?? null }))
  const total = points.reduce((s, p) => s + p.kwh, 0)
  // Comparaison seulement si l'année précédente couvre toute la période (sinon rien, plutôt qu'un chiffre trompeur).
  const complet = points.length > 0 && points.every((p) => p.precedent != null)
  const totalPrecedent = complet ? points.reduce((s, p) => s + p.precedent!, 0) : null
  const variation = totalPrecedent ? (total - totalPrecedent) / totalPrecedent : null
  return { energie, points, total, totalPrecedent, variation }
}
