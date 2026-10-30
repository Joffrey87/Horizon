import { describe, expect, it } from 'vitest'
import { installerPaies, moisBudget, moisOuvertPar, datesPaies } from './moisPaie'

const P = ['2026-06-26', '2026-07-29', '2026-08-27', '2026-09-28']
describe('moisBudget (de paie à paie)', () => {
  it('la paie de fin de mois ouvre le mois suivant', () => {
    expect(moisOuvertPar('2026-09-28')).toBe('2026-10')
    expect(moisOuvertPar('2026-10-03')).toBe('2026-10')
  })
  it('les opérations après la paie passent au mois suivant', () => {
    expect(moisBudget('2026-09-28', P)).toBe('2026-10')
    expect(moisBudget('2026-09-30', P)).toBe('2026-10')
    expect(moisBudget('2026-09-27', P)).toBe('2026-09')
    expect(moisBudget('2026-08-27', P)).toBe('2026-09')
  })
  it('période en cours : jusqu’à aujourd’hui, paie suivante pas encore arrivée', () => {
    expect(moisBudget('2026-10-24', P)).toBe('2026-10')
    expect(moisBudget('2026-10-31', P)).toBe('2026-10')
  })
  it('sans paie connue : mois civil', () => {
    expect(moisBudget('2026-05-30', P)).toBe('2026-05')
    expect(moisBudget('2026-12-05', P)).toBe('2026-12')
    expect(moisBudget('2026-03-10', [])).toBe('2026-03')
  })
  it('installerPaies retient les crédits DDFIP REMUNERATION', () => {
    installerPaies([
      { date: '2026-09-28', amount: 7810.68, label: 'DDFIP DES YVELINES REMUNERATION DU 09/2026. MINISTERE' },
      { date: '2026-09-29', amount: 1200, label: 'SEPA M MARTIN PAUL' },
      { date: '2026-09-28', amount: -50, label: 'REMUNERATION DU 09/2026' },
    ])
    expect(datesPaies()).toEqual(['2026-09-28'])
    expect(moisBudget('2026-09-29')).toBe('2026-10')
  })
  it('la paie reçue sous le seul libellé « DDFIP DES YVELINES » (≥ 6000) ouvre le mois suivant', () => {
    installerPaies([
      { date: '2026-10-28', amount: 11604.41, label: 'DDFIP DES YVELINES' },
      { date: '2026-10-12', amount: 300, label: 'DDFIP DES YVELINES' },
      { date: '2026-10-13', amount: 8000, label: 'VIREMENT AMI' },
    ])
    expect(datesPaies()).toEqual(['2026-10-28'])
    expect(moisBudget('2026-10-27')).toBe('2026-10')
    expect(moisBudget('2026-10-28')).toBe('2026-11')
  })
})
