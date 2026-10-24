import { describe, expect, it } from 'vitest'
import { soldesComptes } from './soldes'
import type { FinAccount } from './types'

const c = (name: string, kind: FinAccount['kind'], owner: FinAccount['owner'], balance: number, extra: Partial<FinAccount> = {}) =>
  ({ id: name, name, kind, owner, balance, in_budget: true, archived: false, balance_at: null, ...extra }) as FinAccount

const comptes = [
  c('Compte Joint', 'courant', 'commun', 233.26, { balance_at: '2026-10-23T19:03:05Z' }),
  c('Compte Joffrey', 'courant', 'joffrey', 63.49),
  c('Compte Honorine', 'courant', 'honorine', 0),
  c('Compte Coopératif', 'courant', 'joffrey', 378.44),
  c('Carte Crypto', 'courant', 'joffrey', 552.79, { balance_at: '2026-10-24T08:32:20Z' }),
  c('Epargne', 'courant', 'joffrey', 10),
  c('Compte Bancaire', 'courant', 'joffrey', 23.7, { in_budget: false }),
  c('Epargne urgence', 'epargne', 'joffrey', 3200),
  c('Binance', 'crypto', 'joffrey', 24259),
]

describe('soldesComptes', () => {
  it('foyer : courants + carte crypto, sans épargne ni comptes hors budget', () => {
    const s = soldesComptes(comptes, 'foyer')
    expect(s.comptes.map((a) => a.name)).toEqual(['Carte Crypto', 'Compte Coopératif', 'Compte Joint', 'Compte Joffrey', 'Compte Honorine'])
    expect(s.total).toBeCloseTo(1227.98)
    expect(s.maj).toBe('2026-10-24T08:32:20Z')
  })
  it('suit le filtre', () => {
    expect(soldesComptes(comptes, 'commun').total).toBeCloseTo(233.26)
    expect(soldesComptes(comptes, 'honorine').comptes.map((a) => a.name)).toEqual(['Compte Honorine'])
    expect(soldesComptes(comptes, 'joffrey').comptes).toHaveLength(3)
  })
})
