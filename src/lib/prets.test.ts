import { describe, expect, it } from 'vitest'
import { ecartCapital, montantEcheance, motifPrelevement, prelevementsReels, statsPret } from './prets'
import type { FinEcheance, FinTransaction } from './types'

/** Prêt fictif : 1 000 € sur 4 mois, 10 € d'intérêts puis 5 €, assurance 2 €. */
const ech = (date: string, capital: number, interets: number, restant: number, extra: Partial<FinEcheance> = {}): FinEcheance => ({
  id: date, user_id: 'u', account_id: 'a', date, capital, interets, assurance: 2, frais: 0, restant_du: restant, rang: null, source: 'pdf', created_at: '', ...extra,
})
const LIGNES = [
  ech('2026-07-01', 250, 10, 750), ech('2026-08-01', 250, 8, 500),
  ech('2026-09-01', 250, 6, 250), ech('2026-10-01', 250, 4, 0, { frais: 20 }),
]
const tx = (date: string, amount: number, label = 'ECH PRET XYZ DU 01', id = date + amount): FinTransaction => ({
  id, user_id: 'u', account_id: 'c', date, amount, label, label_local: null, category_id: null, category_manual: false,
  owner: null, internal: false, excluded: false, note: null, source: 'coop', external_id: null, created_at: '',
})

describe('statsPret', () => {
  it('compte payé / à venir à une date donnée', () => {
    const s = statsPret(LIGNES, 1000, '2026-08-15')
    expect(s.nbPayees).toBe(2)
    expect(s.restant).toBe(500)
    expect(s.capitalRembourse).toBe(500)
    expect(s.interetsPayes).toBe(18)
    expect(s.interetsRestants).toBe(10)
    expect(s.assurancePayee).toBe(4)
    expect(s.coutTotal).toBe(28 + 8 + 20)
    expect(s.progression).toBe(0.5)
    expect(s.prochaine?.date).toBe('2026-09-01')
    expect(s.moisRestants).toBe(2)
  })
  it('avant la 1re échéance : tout le capital reste dû', () => {
    const s = statsPret(LIGNES, 1000, '2026-01-01')
    expect(s.restant).toBe(1000)
    expect(s.progression).toBe(0)
    expect(s.prochaine?.date).toBe('2026-07-01')
  })
  it('prêt soldé : plus de prochaine échéance', () => {
    const s = statsPret(LIGNES, 1000, '2027-01-01')
    expect(s.restant).toBe(0)
    expect(s.prochaine).toBeNull()
    expect(s.progression).toBe(1)
  })
  it('sans restant_du, le reste se déduit du capital amorti', () => {
    const s = statsPret(LIGNES.map((e) => ({ ...e, restant_du: null })), 1000, '2026-08-15')
    expect(s.restant).toBe(500)
  })
  it('échéance du jour = payée', () => {
    expect(statsPret(LIGNES, 1000, '2026-09-01').nbPayees).toBe(3)
  })
})

describe('prélèvements réels', () => {
  const loan = { debit_match: 'ECH PRET XYZ', debit_account_ids: [] as string[] }
  it('rapproche, additionne les prélèvements en plusieurs fois et signale les écarts', () => {
    const ops = [
      tx('2026-07-02', -262),
      tx('2026-08-01', -100), tx('2026-08-12', -160),   // compte vide : deux fois, 260 au total
      tx('2026-09-02', -250),                           // 8 € de moins
      tx('2026-07-05', -50, 'AUTRE'),
    ]
    const r = prelevementsReels(loan, LIGNES, ops, '2026-10-20')
    expect(r.map((x) => x.etat)).toEqual(['ok', 'ok', 'ecart', 'absent'])
    expect(r[1]!.reel).toBe(260)
    expect(r[2]!.ecart).toBe(-8)
    expect(r[3]!.attendu).toBe(montantEcheance(LIGNES[3]!))
  })
  it("ne juge pas les mois avant le premier prélèvement ni l'échéance toute récente", () => {
    const r = prelevementsReels(loan, LIGNES, [tx('2026-08-02', -260)], '2026-10-02')
    expect(r.map((x) => x.mois)).toEqual(['2026-08', '2026-09'])
  })
  it('filtre par compte et ignore les entrées', () => {
    const ops = [tx('2026-08-02', -260), { ...tx('2026-09-02', -260, 'ECH PRET XYZ', 'z'), account_id: 'autre' }, tx('2026-09-05', 500)]
    const r = prelevementsReels({ ...loan, debit_account_ids: ['c'] }, LIGNES, ops, '2026-10-20')
    expect(r.map((x) => x.etat)).toEqual(['ok', 'absent', 'absent'])
  })
  it('motif vide ou invalide : rien', () => {
    expect(prelevementsReels({ debit_match: null, debit_account_ids: [] }, LIGNES, [tx('2026-08-02', -260)], '2026-10-20')).toEqual([])
    expect(motifPrelevement('(')).toBeNull()
  })
})

describe('écart de capital', () => {
  it('compare le tableau au solde du compte (dette négative)', () => {
    expect(ecartCapital(1000, -900)).toBe(-100)
    expect(ecartCapital(1000, -1100)).toBe(100)
  })
})
