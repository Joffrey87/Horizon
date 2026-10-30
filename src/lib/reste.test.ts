import { describe, it, expect } from 'vitest'
import type { FinAccount, FinPlanned, FinResteAjustement, FinTransaction } from './types'
import { indexer } from './finances'
import { calculerReste, detecterRecurrentes, estCompteReste, nomCourtCompte } from './reste'

let seq = 0
const id = () => `r${++seq}`
const compte = (over: Partial<FinAccount> = {}): FinAccount => ({
  id: id(), user_id: 'u', name: 'Compte', institution: 'BoursoBank', kind: 'courant', subtype: null, owner: 'joffrey',
  in_budget: true, balance: 0, balance_source: null, balance_manual_at: null, acquired_on: null, balance_at: null,
  archived: false, sort_order: 0, source: 'test', external_id: null, created_at: '', ...over,
})
const op = (account_id: string, date: string, amount: number, label: string, over: Partial<FinTransaction> = {}): FinTransaction => ({
  id: id(), user_id: 'u', account_id, date, amount, label, label_local: null, category_id: null, category_manual: false,
  owner: null, internal: false, excluded: false, note: null, source: 'test', external_id: null, created_at: '', ...over,
})
const prevu = (title: string, amount: number, due_date: string, over: Partial<FinPlanned> = {}): FinPlanned => ({
  id: id(), user_id: 'u', title, amount, due_date, line_id: null, saved: 0, done: false, note: null, created_at: '', ...over,
})
const adj = (cle: string, over: Partial<FinResteAjustement> = {}): FinResteAjustement => ({
  id: id(), user_id: 'u', cle, nom: null, ignore: false, montant: null, created_at: '', ...over,
})

const joint = compte({ balance: 233.26 })
const carte = compte({ institution: 'Crypto.com', source: 'crypto', subtype: 'carte', balance: 400 })
const sg = compte({ institution: 'Société Générale', balance: 23.7 })
const pea = compte({ kind: 'investissement', in_budget: false, balance: 9000 })
const comptes = [joint, carte, sg, pea]
const idx = indexer(comptes, [], [])

// Netflix (15/mois, 13,49), loyer 5/mois à 800, courses variables
const histo = [
  ...['2026-07', '2026-08', '2026-09'].flatMap((m) => [
    op(joint.id, `${m}-15`, -13.49, 'PRLV SEPA NETFLIX.COM'),
    op(joint.id, `${m}-05`, -800, 'VIR LOYER'),
    op(joint.id, `${m}-03`, -52.1, 'CB CARREFOUR'), ...(m === '2026-09' ? [] : [op(joint.id, `${m}-20`, -31.4, 'CB CARREFOUR')]),
  ]),
  op(joint.id, '2026-10-15', -13.49, 'PRLV SEPA NETFLIX.COM'),
]

describe('estCompteReste', () => {
  it('Boursorama + carte Crypto.com, ni autre banque ni placements', () => {
    expect(comptes.filter(estCompteReste).map((a) => a.id)).toEqual([joint.id, carte.id])
  })
})

describe('synthèse des comptes (noms courts, Honorine)', () => {
  const base = { transactions: [] as FinTransaction[], planned: [] as FinPlanned[], ajustements: [] as FinResteAjustement[], aujourdhui: '2026-10-23' }
  const joffrey = compte({ name: 'Compte Joffrey', balance: 100 })
  const jointN = compte({ name: 'Compte Joint', balance: 233.26 })
  const crypto = compte({ name: 'Carte Crypto', institution: 'Crypto.com', source: 'crypto', subtype: 'carte', balance: 400 })
  const epargnes = ['Epargne', 'Epargne urgence', 'Epargne Avenir'].map((name) => compte({ name, kind: 'epargne', balance: 5000 }))
  it('noms courts dans l’ordre Joffrey, Joint, Crypto, sans l’épargne', () => {
    const accounts = [crypto, ...epargnes, jointN, joffrey]
    const r = calculerReste({ ...base, accounts, idx: indexer(accounts, [], []) })
    expect(r.comptes.map((c) => c.court)).toEqual(['Joffrey', 'Joint', 'Crypto'])
    expect(r.solde).toBeCloseTo(733.26, 2)
  })
  it('Honorine reste absente tant que son compte n’existe pas, puis entre automatiquement dans le RESTE', () => {
    const sans = [joffrey, jointN, crypto]
    expect(calculerReste({ ...base, accounts: sans, idx: indexer(sans, [], []) }).comptes.some((c) => c.court === 'Honorine')).toBe(false)
    const honorine = compte({ name: 'Honorine', institution: 'Crédit Agricole', balance: 50 })
    const avec = [honorine, ...sans]
    const r = calculerReste({ ...base, accounts: avec, idx: indexer(avec, [], []) })
    expect(r.comptes.map((c) => c.court)).toEqual(['Joffrey', 'Joint', 'Crypto', 'Honorine'])
    expect(r.solde).toBeCloseTo(783.26, 2)
    expect(r.reste).toBeCloseTo(783.26, 2)
  })
  it('un compte Honorine archivé ou d’épargne n’est pas compté', () => {
    expect(estCompteReste(compte({ name: 'Honorine', archived: true }))).toBe(false)
    expect(estCompteReste(compte({ name: 'Epargne Honorine', kind: 'epargne' }))).toBe(false)
  })
  it('nomCourtCompte', () => {
    expect([joffrey, jointN, crypto].map(nomCourtCompte)).toEqual(['Joffrey', 'Joint', 'Crypto'])
  })
})

describe('detecterRecurrentes', () => {
  it('repère le loyer (pas encore passé), pas Netflix (déjà passé) ni les courses (plusieurs fois par mois)', () => {
    const { actives } = detecterRecurrentes({ transactions: histo, idx, comptes: new Set([joint.id]), aujourdhui: '2026-10-23' })
    // Le loyer du 5 est attendu depuis 18 jours : trop en retard, rangé dans « ratées ».
    expect(actives).toEqual([])
    const r = detecterRecurrentes({ transactions: histo, idx, comptes: new Set([joint.id]), aujourdhui: '2026-10-04' })
    expect(r.actives.map((x) => [x.nom, x.montant, x.date])).toEqual([['VIR Loyer', 800, '2026-10-05']])
  })
  it('ignore une dépense à montant variable, ou plus vue le mois dernier', () => {
    const tx = [
      op(joint.id, '2026-07-10', -20, 'ABO SALLE'), op(joint.id, '2026-08-10', -60, 'ABO SALLE'), op(joint.id, '2026-09-10', -35, 'ABO SALLE'),
      op(joint.id, '2026-06-12', -9.99, 'APP STORE'), op(joint.id, '2026-07-12', -9.99, 'APP STORE'), op(joint.id, '2026-08-12', -9.99, 'APP STORE'),
    ]
    const { actives } = detecterRecurrentes({ transactions: tx, idx, comptes: new Set([joint.id]), aujourdhui: '2026-10-01' })
    expect(actives).toEqual([])
  })
  it('un abonnement récent : 2 mois consécutifs identiques suffisent', () => {
    const tx = [op(joint.id, '2026-08-27', -9.99, 'SPOTIFY'), op(joint.id, '2026-09-27', -9.99, 'SPOTIFY')]
    const { actives } = detecterRecurrentes({ transactions: tx, idx, comptes: new Set([joint.id]), aujourdhui: '2026-10-23' })
    expect(actives.map((x) => x.montant)).toEqual([9.99])
  })
  it('une opération en attente ce mois-ci compte comme déjà passée', () => {
    const tx = [...histo, op(joint.id, '2026-10-04', -800, 'VIR LOYER', { pending: true })]
    expect(detecterRecurrentes({ transactions: tx, idx, comptes: new Set([joint.id]), aujourdhui: '2026-10-04' }).actives).toEqual([])
  })
  it('exclure / ajuster', () => {
    const base = { transactions: histo, idx, comptes: new Set([joint.id]), aujourdhui: '2026-10-04' }
    const cle = detecterRecurrentes(base).actives[0]!.cle
    expect(detecterRecurrentes({ ...base, ajustements: [adj(cle, { ignore: true })] }).actives[0]!.ignore).toBe(true)
    const a = detecterRecurrentes({ ...base, ajustements: [adj(cle, { montant: 750 })] }).actives[0]!
    expect([a.montant, a.montantDetecte, a.ajuste]).toEqual([750, 800, true])
  })
})

describe('calculerReste', () => {
  const base = { accounts: comptes, transactions: histo, idx, planned: [] as FinPlanned[], ajustements: [] as FinResteAjustement[] }
  it('solde − récurrentes − prévues du mois ; opérations en attente non redoublées', () => {
    const tx = [...histo, op(joint.id, '2026-10-22', -80, 'RESTO', { pending: true })]
    const planned = [prevu('Dentiste', 60, '2026-10-28'), prevu('Voyage', 500, '2026-12-01'), prevu('Déjà payé', 30, '2026-10-25', { done: true })]
    const r = calculerReste({ ...base, transactions: tx, planned, aujourdhui: '2026-10-04' })
    expect(r.solde).toBeCloseTo(633.26)          // joint + carte, rien d'autre
    expect(r.enAttente).toBe(80)                 // informatif seulement
    expect(r.totalRecurrentes).toBe(800)
    expect(r.planifiees.map((p) => p.title)).toEqual(['Dentiste'])
    expect(r.reste).toBeCloseTo(633.26 - 800 - 60)
  })
  it('une récurrente exclue ne compte plus', () => {
    const cle = calculerReste({ ...base, aujourdhui: '2026-10-04' }).recurrentes[0]!.cle
    const r = calculerReste({ ...base, aujourdhui: '2026-10-04', ajustements: [adj(cle, { ignore: true })] })
    expect(r.totalRecurrentes).toBe(0)
    expect(r.reste).toBeCloseTo(633.26)
  })
})

describe('plusieurs prélèvements par mois chez un même fournisseur', () => {
  it('suit chaque rang séparément : le 2e (fin de mois) reste à venir', () => {
    const tx = [
      ...['2026-07', '2026-08', '2026-09'].flatMap((m) => [op(joint.id, `${m}-18`, -163.01, 'ENGIE PRLV'), op(joint.id, `${m}-28`, -152.36, 'ENGIE PRLV')]),
      op(joint.id, '2026-10-19', -218.69, 'ENGIE PRLV'),
    ]
    const { actives } = detecterRecurrentes({ transactions: tx, idx, comptes: new Set([joint.id]), aujourdhui: '2026-10-23' })
    expect(actives.map((x) => [x.montant, x.date])).toEqual([[152.36, '2026-10-28']])
  })
})
