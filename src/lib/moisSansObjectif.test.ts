import { describe, expect, it } from 'vitest'
import { estFraisFixe, estMoisSansObjectif, MOIS_SANS_OBJECTIF } from './moisSansObjectif'

describe('mois sans objectif', () => {
  it('août, septembre et octobre 2026', () => {
    expect(MOIS_SANS_OBJECTIF).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(estMoisSansObjectif('2026-10')).toBe(true)
    expect(estMoisSansObjectif('2026-08-01')).toBe(true)
    expect(estMoisSansObjectif('2026-11')).toBe(false)
    expect(estMoisSansObjectif('2026-07')).toBe(false)
    expect(estMoisSansObjectif('2027-01', ['2027-01'])).toBe(true)
  })
  it('reconnaît Frais fixe', () => {
    expect(estFraisFixe('fraisfixe')).toBe(true)
    expect(estFraisFixe('Frais fixes')).toBe(true)
    expect(estFraisFixe('Courses')).toBe(false)
  })
})
