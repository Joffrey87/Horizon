import { describe, expect, it } from 'vitest'
import { epargneUtilisee } from './epargneUtilisee'
import type { FinAccount, FinTransaction } from './types'
const a = (id: string, name: string, kind = 'courant') => ({ id, name, kind } as FinAccount)
const comptes = [a('J', 'Compte Joint'), a('E', 'Epargne'), a('C', 'Carte Crypto'), a('JO', 'Compte Joffrey'), a('U', 'Epargne urgence', 'epargne')]
let n = 0
const t = (account_id: string, date: string, amount: number, label: string, internal = true) =>
  ({ id: 'x' + n++, account_id, date, amount, label, label_local: null, internal } as FinTransaction)
const tx = [
  t('J', '2026-10-12', 400, 'Virement interne telephone'),
  t('J', '2026-10-15', 500, 'virement interne'),
  t('J', '2026-10-15', 200, 'Virement depuis BoursoBank'),
  t('J', '2026-10-19', 200, 'Virement interne'),
  t('J', '2026-10-19', 300, 'Virement interne depuis COMPTE S'),
  t('J', '2026-10-19', -200, 'INST LENOBLE JOFFREY'),
  t('C', '2026-10-19', 200, 'EUR Deposit'),
  t('J', '2026-10-21', 300, 'Virement interne'),
  t('E', '2026-10-21', -300, 'Virement interne'),
  t('J', '2026-09-21', 300, 'Virement interne telephone'),
  t('J', '2026-10-22', 50, 'Virement interne telephone', false),
]
describe('epargneUtilisee', () => {
  const r = epargneUtilisee({ transactions: tx, comptes, mois: '2026-10' })
  it('octobre : 3 virements, 1 000 €', () => {
    expect(r.total).toBe(1000)
    expect(r.virements.map((v) => [v.date, v.origine, v.montant])).toEqual([
      ['2026-10-21', 'Epargne', 300], ['2026-10-19', 'Livret (Compte S)', 300], ['2026-10-12', 'Épargne urgence', 400]])
  })
  it('groupé par origine', () => {
    expect(r.parOrigine[0]).toMatchObject({ origine: 'Épargne urgence', total: 400 })
  })
  it('règle par id', () => {
    const r2 = epargneUtilisee({ transactions: tx, comptes, mois: '2026-10', regles: [{ id: tx[1]!.id, origine: 'PEL' }] })
    expect(r2.virements.map((v) => v.origine).sort()).toEqual(['Epargne', 'PEL'])
  })
})
