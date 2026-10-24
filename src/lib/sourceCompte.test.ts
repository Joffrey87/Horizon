import { describe, expect, it } from 'vitest'
import { sourceCompte } from './sourceCompte'
import type { FinAccount } from './types'
const c = (name: string, institution: string | null) => ({ name, institution } as FinAccount)
describe('sourceCompte', () => {
  it('Boursorama : calque du titulaire', () => {
    expect(sourceCompte(c('Compte Joint', 'BoursoBank'), 'commun').calque).toBe('partage')
    expect(sourceCompte(c('Compte Joint', 'BoursoBank'), 'joffrey').calque).toBe('joffrey')
    expect(sourceCompte(c('Compte Honorine', null), 'honorine')).toMatchObject({ logo: 'boursorama', calque: 'honorine' })
  })
  it('autres banques', () => {
    expect(sourceCompte(c('Compte Coopératif', 'Crédit Coopératif'), 'joffrey')).toMatchObject({ logo: 'credit-cooperatif', calque: 'partage' })
    expect(sourceCompte(c('Compte Airbnb', 'Crédit Coopératif'), 'joffrey')).toMatchObject({ logo: 'airbnb', calque: null })
    expect(sourceCompte(c('Carte Crypto', 'Crypto.com'), 'joffrey')).toMatchObject({ logo: 'crypto-com', calque: null })
  })
})
