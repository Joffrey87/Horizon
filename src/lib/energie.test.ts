import { describe, expect, it } from 'vitest'
import { resumeConso, siteEnergie } from './energie'
import type { FinEnergieConso } from './types'
const r = (site: 'reims' | 'taissy', debut: string, kwh: number): FinEnergieConso =>
  ({ site, energie: 'elec', periode_debut: debut, periode_fin: debut, kwh, kwh_hp: null, kwh_hc: null, m3: null })
describe('énergie', () => {
  it('reconnaît le contrat', () => {
    expect(siteEnergie('Engie Reims Gaz&Electricité')).toBe('reims')
    expect(siteEnergie(null, 'Engie Taissy Electricité')).toBe('taissy')
    expect(siteEnergie('Carrefour Reims')).toBeNull()
  })
  it('compare à l’an dernier si complet', () => {
    const rs = [r('reims', '2025-01-15', 100), r('reims', '2025-02-15', 50), r('reims', '2026-01-15', 80), r('reims', '2026-02-15', 70)]
    const s = resumeConso(rs, 'reims', 'elec', 2)
    expect(s.total).toBe(150); expect(s.totalPrecedent).toBe(150); expect(s.variation).toBe(0)
  })
  it('sans historique : pas de comparaison', () => {
    const s = resumeConso([r('taissy', '2025-11-05', 600), r('taissy', '2026-11-05', 500)], 'taissy', 'elec', 6)
    expect(s.points[0]!.precedent).toBeNull(); expect(s.totalPrecedent).toBeNull()
  })
})
