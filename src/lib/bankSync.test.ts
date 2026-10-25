import { describe, expect, it } from 'vitest'
import {
  analyse, consentDaysLeft, consentNeedsAlert, extId, finaryLabel, histKey, isSyncSlot, key, last4, parisHour, payload,
  pickBalance, pickCategory, buildHistory, ratio, type EbTransaction, type Snapshot,
} from '../../supabase/functions/_shared/bankSync'

const ACC = 'a2ee064e-de42-42ea-8fcc-4f23bf33a146'
const tx = (o: Partial<EbTransaction> & { amt: number; label: string }): EbTransaction => ({
  transaction_amount: { amount: String(Math.abs(o.amt)), currency: 'EUR' }, credit_debit_indicator: o.amt < 0 ? 'DBIT' : 'CRDT',
  status: 'BOOK', remittance_information: [o.label], ...o,
})
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  accounts: [{ id: ACC, name: 'Compte Joint', source: 'finary', balance_source: 100, balance_manual_at: null }],
  transactions: [], label_cat: [],
  categories: [
    { id: 'c-courses', name: 'Courses', parent: null, n: 50 }, { id: 'c-achats', name: 'Achats', parent: 'Dépenses du mois', n: 10 },
    { id: 'c-vi', name: 'Virement interne', parent: null, n: 5 }, { id: 'c-nc', name: 'Non catégorisé', parent: null, n: 1 },
    { id: 'c-sante', name: 'Santé', parent: null, n: 3 },
  ],
  ...over,
})

describe('libellés (identiques à import_bourso.py)', () => {
  it('forme Finary', () => {
    expect(finaryLabel('CARTE 12/10/26 CARREFOUR MARKET CB*1234')).toBe('CARREFOUR MARKET CB*1234')
    expect(finaryLabel('VIR SEPA ALAN INSURANCE')).toBe('ALAN INSURANCE')
    expect(finaryLabel('VIR INST M LENOBLE JOFFREY')).toBe('INST M LENOBLE JOFFREY')
  })
  it('clés', () => {
    expect(histKey('CARREFOUR MARKET CB*1234 X')).toBe('carrefour market')
    expect(key('PRLV SEPA Électricité Engie')).toBe('electricite engie')
  })
  it('external_id stable, au format bourso', async () => {
    const id = await extId('bourso', '6340', '2026-10-19', -65, 'CARTE 18/10/26 PHARMACIE', 1)
    expect(id).toMatch(/^bourso:6340:2026-10-19:-6500:[0-9a-f]{8}:1$/)
    expect(await extId('bourso', '6340', '2026-10-19', -65, 'CARTE  18/10/26 PHARMACIE', 1)).toBe(id)
  })
  it('ratio = difflib', () => {
    expect(ratio('abcd', 'bcde')).toBeCloseTo(0.75)
    expect(ratio('', '')).toBe(1)
  })
  it('last4 IBAN FR', () => expect(last4('FR7640618804670004094459394')).toBe('4593'))
})

describe('catégorisation', () => {
  it('historique, manuel pèse x3, sinon défaut', () => {
    const h = buildHistory(snap({ transactions: [
      { account_id: ACC, date: '2026-10-01', amount: -5, label: 'PHARMACIE X', category: 'Courses' },
      { account_id: ACC, date: '2026-10-02', amount: -5, label: 'PHARMACIE X', category: 'Courses' },
      { account_id: ACC, date: '2026-10-03', amount: -5, label: 'PHARMACIE X', category: 'Santé', category_manual: true },
    ] }))
    expect(pickCategory('PHARMACIE X', -3, h)[0]).toBe('Santé')
    expect(pickCategory('INCONNU', -3, h)).toEqual(['Dépenses du mois › Achats', 'defaut-achats'])
    expect(pickCategory('INCONNU', 3, h)).toEqual(['Non catégorisé', 'defaut'])
  })
})

describe('analyse', () => {
  const txs = [
    tx({ amt: -42.1, label: 'CARTE 20/10/26 CARREFOUR MARKET', booking_date: '2026-10-21' }),
    tx({ amt: -9.99, label: 'SPOTIFY', booking_date: '2026-10-20' }),
    tx({ amt: -12, label: 'BOULANGERIE', status: 'PDNG', entry_reference: 'R1', transaction_date: '2026-10-24' }),
    tx({ amt: 0, label: 'PREAUTO', status: 'PDNG', entry_reference: 'R0' }),
  ]
  const bal = [{ balance_type: 'CLBD', balance_amount: { amount: '500' } }, { balance_type: 'XPCD', balance_amount: { amount: '488' } }]
  it('déjà présent Finary (±3 j) ignoré, nouveau catégorisé, en attente ajoutée, pré-autorisation 0 € ignorée', async () => {
    const s = snap({
      transactions: [{ account_id: ACC, date: '2026-10-19', amount: -9.99, label: 'Spotify', source: 'finary', category: 'Courses' }],
      label_cat: [['carrefour market', 'Courses', 4, 0]],
    })
    const r = await analyse('bourso', [{ accountId: ACC, l4: '4593', txs, balances: bal }], s, '2026-10-25')
    expect(r.reports[0]).toMatchObject({ booked: 2, already_other_source: 1, new_booked: 1, pending: 1, balance: 488 })
    const [book, pend] = r.transactions
    expect(book).toMatchObject({ label: 'CARREFOUR MARKET', category_id: 'c-courses', pending: false, date: '2026-10-21' })
    expect(pend).toMatchObject({ external_id: 'bourso-pdng:4593:R1', pending: true, date: '2026-10-24', category_id: 'c-achats' })
    const p = payload('bourso', r, [ACC])
    expect(p.pending_sync).toEqual([ACC])
    expect(Object.keys(p.transactions[0]!)).not.toContain('_category')
  })
  it('idempotent : une 2e synchro ne renvoie rien de nouveau', async () => {
    const r1 = await analyse('bourso', [{ accountId: ACC, l4: '4593', txs, balances: bal }], snap(), '2026-10-25')
    const after = snap({ transactions: r1.transactions.map((t) => ({ ...t, source: 'bourso' })) })
    const r2 = await analyse('bourso', [{ accountId: ACC, l4: '4593', txs, balances: bal }], after, '2026-10-25')
    expect(r2.reports[0]).toMatchObject({ new_booked: 0, already_imported: 2, pending_new: 0 })
  })
  it('lignes identiques le même jour : rangs distincts', async () => {
    const two = [tx({ amt: -2, label: 'CAFE', booking_date: '2026-10-21' }), tx({ amt: -2, label: 'CAFE', booking_date: '2026-10-21' })]
    const r = await analyse('bourso', [{ accountId: ACC, l4: '4593', txs: two, balances: [] }], snap(), '2026-10-25')
    expect(r.transactions.map((t) => t.external_id.slice(-2))).toEqual([':1', ':2'])
    expect(r.balances).toEqual([])
  })
  it('virement interne en attente : exclu', async () => {
    const r = await analyse('bourso', [{ accountId: ACC, l4: '4593', balances: [],
      txs: [tx({ amt: 200, label: 'VIR INST M LENOBLE JOFFREY', status: 'PDNG', entry_reference: 'V1' })] }],
      snap({ label_cat: [['inst m lenoble joffrey', 'Virement interne', 9, 0]] }), '2026-10-25')
    expect(r.transactions[0]).toMatchObject({ internal: true, excluded: true, category_id: 'c-vi' })
  })
  it('refuse le compte virtuel', async () => {
    const s = snap({ accounts: [{ id: ACC, name: 'Compte Honorine', source: 'virtuel' }] })
    await expect(analyse('bourso', [{ accountId: ACC, l4: '0', txs: [], balances: [] }], s, '2026-10-25')).rejects.toThrow()
  })
  it('solde : XPCD puis CLBD', () => {
    expect(pickBalance([{ balance_type: 'CLBD', balance_amount: { amount: '5' } }])).toBe(5)
    expect(pickBalance([])).toBeNull()
  })
})

describe('horaires Paris (heure d’été / d’hiver)', () => {
  it('hiver : 7h UTC = 8h Paris', () => {
    expect(parisHour(new Date('2026-12-10T07:00:00Z'))).toBe(8)
    expect(isSyncSlot(new Date('2026-12-10T07:00:00Z'))).toBe(true)
    expect(isSyncSlot(new Date('2026-12-10T06:00:00Z'))).toBe(false)
    expect(isSyncSlot(new Date('2026-12-10T19:00:00Z'))).toBe(true)
  })
  it('été : 6h UTC = 8h Paris', () => {
    expect(isSyncSlot(new Date('2026-07-10T06:00:00Z'))).toBe(true)
    expect(isSyncSlot(new Date('2026-07-10T07:00:00Z'))).toBe(false)
    expect(isSyncSlot(new Date('2026-07-10T12:00:00Z'))).toBe(true)
    expect(isSyncSlot(new Date('2026-07-10T18:00:00Z'))).toBe(true)
  })
})

describe('consentement', () => {
  it('alerte 14 jours avant', () => {
    expect(consentDaysLeft('2027-04-20T17:19:46Z', new Date('2027-04-01T12:00:00Z'))).toBe(19)
    expect(consentNeedsAlert('2027-04-20T17:19:46Z', new Date('2027-04-01T12:00:00Z'))).toBe(false)
    expect(consentNeedsAlert('2027-04-20T17:19:46Z', new Date('2027-04-07T12:00:00Z'))).toBe(true)
    expect(consentNeedsAlert(null, new Date())).toBe(false)
  })
})

import { consentAlerts } from './bankConsent'
describe('alertes de consentement', () => {
  it('liste seulement les connexions ≤ 14 j', () => {
    const base = { source: 'bourso', aspsp_name: 'Boursorama Banque', status: 'active', last_sync_at: null, last_error: null }
    const r = consentAlerts([{ ...base, id: 'a', valid_until: '2027-04-20T17:19:46Z' }, { ...base, id: 'b', valid_until: '2027-04-10T00:00:00Z' }],
      new Date('2027-04-01T12:00:00Z'))
    expect(r.map((c) => [c.id, c.daysLeft])).toEqual([['b', 8]])
  })
})
