// ================================================================
// Tests des règles pures de l'onglet Finances (finances.ts). Aucun réseau.
// ================================================================
import { describe, it, expect } from 'vitest'
import type { FinAccount, FinBudget, FinCategory, FinHolding, FinLine, FinPlanned, FinTarget, FinTransaction } from './types'
import {
  NON_CLASSE, agreger, allocation, bilan, aplatirGroupes, cleGroupe, compositionPatrimoine, detailPeriode, grouperParIntitule, nomLisible, creerReconnaissance, normaliserLibelle, operationsSemblables, rechercherOperations, budgetDe, classer, decaleMois, detailLigne, ecartMois, euros, indexer,
  libelleMois, moisEcoules, patrimoine, previsionDe, provision, syntheseMois,
} from './finances'

let seq = 0
const id = () => `x${++seq}`

const compte = (over: Partial<FinAccount> = {}): FinAccount => ({
  id: id(), user_id: 'u', name: 'Compte', institution: null, kind: 'courant', subtype: null, owner: 'joffrey',
  in_budget: true, balance: 0, balance_source: null, balance_manual_at: null, acquired_on: null, balance_at: null, archived: false, sort_order: 0, source: 'test', external_id: null,
  created_at: '', ...over,
})
const ligne = (name: string, over: Partial<FinLine> = {}): FinLine => ({
  id: id(), user_id: 'u', name, kind: 'depense', sort_order: 0, color: null, created_at: '', ...over,
})
const categorie = (name: string, over: Partial<FinCategory> = {}): FinCategory => ({
  id: id(), user_id: 'u', name, parent_id: null, line_id: null, role: 'depense', hidden: false, merged_into: null, manual: false, source: 'test', external_id: null,
  created_at: '', ...over,
})
const op = (account_id: string, date: string, amount: number, over: Partial<FinTransaction> = {}): FinTransaction => ({
  id: id(), user_id: 'u', account_id, date, amount, label: 'op', category_id: null, category_manual: false,
  owner: null, internal: false, excluded: false, note: null, source: 'test', external_id: null, created_at: '',
  label_local: null, ...over,
})
const budget = (line_id: string, month: string, amount: number, kind: FinBudget['kind'] = 'budget'): FinBudget => ({
  id: id(), user_id: 'u', line_id, kind, month, amount, created_at: '',
})

// Un petit foyer : compte joint (commun) + compte perso, et un PEA hors budget.
const joint = compte({ owner: 'commun' })
const perso = compte()
const pea = compte({ kind: 'investissement', in_budget: false })
const courses = ligne('Courses', { sort_order: 2 })
const fixes = ligne('Frais fixe', { sort_order: 1 })
const epargne = ligne('Épargne avenir', { kind: 'epargne', sort_order: 3 })
const lines = [courses, epargne, fixes]
const alim = categorie('Alimentation', { line_id: courses.id })
const boulangerie = categorie('Boulangerie', { parent_id: alim.id })          // hérite de Courses
const loyer = categorie('Loyer', { line_id: fixes.id })
const invest = categorie('Investissements', { line_id: epargne.id })
const salaire = categorie('Salaire', { role: 'revenu' })
const virement = categorie('Virements', { role: 'hors_budget' })
const divers = categorie('Divers')                                            // sans ligne
const categories = [alim, boulangerie, loyer, invest, salaire, virement, divers]
const idx = indexer([joint, perso, pea], categories, lines)

describe('mois', () => {
  it('décale et compte les mois, années comprises', () => {
    expect(decaleMois('2026-01', -1)).toBe('2025-12')
    expect(decaleMois('2026-11', 3)).toBe('2027-02')
    expect(ecartMois('2026-10', '2027-01')).toBe(3)
    expect(moisEcoules('2026-02', 3)).toEqual(['2025-11', '2025-12', '2026-01'])
  })
  it('nomme les mois en français', () => {
    expect(libelleMois('2026-08')).toBe('août 2026')
    expect(libelleMois('2026-02', true)).toBe('févr. 26')
  })
  it('formate les euros sans « -0 »', () => {
    expect(euros(-0.2)).toBe(euros(0))
    expect(euros(1234.5, true).replace(/\s/g, ' ')).toBe('1 234,50 €')
  })
})

describe('classer', () => {
  it('range une sous-catégorie sans ligne dans la ligne de son parent', () => {
    expect(classer(op(joint.id, '2026-10-02', -5, { category_id: boulangerie.id }), idx)).toEqual({ type: 'ligne', ligne: courses.id })
  })
  it('écarte les comptes hors budget, les opérations exclues et les virements', () => {
    expect(classer(op(pea.id, '2026-10-02', -5, { category_id: alim.id }), idx).type).toBe('ignoree')
    expect(classer(op(joint.id, '2026-10-02', -5, { category_id: alim.id, excluded: true }), idx).type).toBe('ignoree')
    expect(classer(op(joint.id, '2026-10-02', -5, { category_id: virement.id }), idx).type).toBe('ignoree')
  })
  it("ne compte un virement interne que s'il alimente une ligne d'épargne", () => {
    expect(classer(op(perso.id, '2026-10-02', -300, { category_id: invest.id, internal: true }), idx)).toEqual({ type: 'ligne', ligne: epargne.id })
    expect(classer(op(perso.id, '2026-10-02', -300, { category_id: alim.id, internal: true }), idx).type).toBe('ignoree')
  })
  it('suit les fusions : une catégorie fusionnée compte dans sa cible', () => {
    const ancienne = categorie('Courses alimentaires', { merged_into: boulangerie.id, hidden: true })
    const i2 = indexer([joint], [...categories, ancienne], lines)
    expect(classer(op(joint.id, '2026-10-02', -9, { category_id: ancienne.id }), i2)).toEqual({ type: 'ligne', ligne: courses.id })
    const d = detailLigne({ cle: courses.id, mois: '2026-10', transactions: [op(joint.id, '2026-10-02', -9, { category_id: ancienne.id })], idx: i2, filtre: 'foyer' })
    expect(d.map((g) => g.court)).toEqual(['Boulangerie'])
  })
  it('une sous-catégorie suit le rôle de sa catégorie principale', () => {
    const prime = categorie('Prime', { parent_id: salaire.id, role: 'depense' })
    const i2 = indexer([joint], [...categories, prime], lines)
    expect(classer(op(joint.id, '2026-10-02', 500, { category_id: prime.id }), i2).type).toBe('revenu')
  })
  it('signale ce qui n’a pas de ligne au lieu de le perdre', () => {
    expect(classer(op(joint.id, '2026-10-02', -5, { category_id: divers.id }), idx).type).toBe('non_classe')
    expect(classer(op(joint.id, '2026-10-02', -5), idx).type).toBe('non_classe')
    expect(classer(op(joint.id, '2026-10-02', 3000, { category_id: salaire.id }), idx).type).toBe('revenu')
  })
})

describe('budgets', () => {
  const budgets = [budget(courses.id, '2025-01-01', 600), budget(courses.id, '2026-09-01', 750), budget(courses.id, '2026-11-01', 800, 'prevision')]
  it('prend le dernier budget fixé à ce mois ou avant', () => {
    expect(budgetDe(courses.id, '2026-08', budgets)).toBe(600)
    expect(budgetDe(courses.id, '2026-10', budgets)).toBe(750)
    expect(budgetDe(courses.id, '2024-12', budgets)).toBeNull()
  })
  it('le prévisionnel vaut pour son seul mois, sinon le budget', () => {
    expect(previsionDe(courses.id, '2026-11', budgets)).toEqual({ montant: 800, saisi: true })
    expect(previsionDe(courses.id, '2026-12', budgets)).toEqual({ montant: 750, saisi: false })
  })
})

describe('synthèse du mois', () => {
  const tx = [
    op(joint.id, '2026-10-03', -120, { category_id: alim.id }),
    op(joint.id, '2026-10-05', -30, { category_id: boulangerie.id }),
    op(joint.id, '2026-10-06', 20, { category_id: alim.id }),                  // remboursement : se déduit
    op(perso.id, '2026-10-07', -80, { category_id: alim.id }),
    op(perso.id, '2026-10-08', -40, { category_id: alim.id, owner: 'honorine' }),
    op(joint.id, '2026-10-01', -1100, { category_id: loyer.id }),
    op(joint.id, '2026-10-09', -15, { category_id: divers.id }),
    op(joint.id, '2026-10-25', 4000, { category_id: salaire.id }),
    op(joint.id, '2026-09-04', -600, { category_id: alim.id }),
    op(joint.id, '2026-04-04', -60, { category_id: alim.id }),
    op(joint.id, '2026-03-04', -999, { category_id: alim.id }),                // hors des 3 mois
  ]
  const budgets = [budget(courses.id, '2025-01-01', 750), budget(fixes.id, '2025-01-01', 1100)]

  it('reproduit le tableau de bord : réel, budget, M-1, moyenne 3 mois, prévisionnel', () => {
    const s = syntheseMois({ mois: '2026-10', lines, budgets, agregat: agreger(tx, idx, 'foyer'), filtre: 'foyer' })
    expect(s.lignes.map((l) => l.ligne?.name ?? l.cle)).toEqual(['Frais fixe', 'Courses', 'Épargne avenir', NON_CLASSE])
    const c = s.lignes.find((l) => l.cle === courses.id)!
    expect(c.reel).toBe(250)               // 120 + 30 − 20 + 80 + 40
    expect(c.budget).toBe(750)
    expect(c.precedent).toBe(600)
    expect(c.moyenne3).toBe(200)           // 600 / 3 : avril est hors des 3 mois
    expect(c.prevision).toBe(750)
    expect(s.entrees).toBe(4000)
    expect(s.total.reel).toBe(250 + 1100 + 15)
    expect(s.total.budget).toBe(1850)
  })

  it('ne montre « Non classé » que s’il reste des opérations à classer ce mois-ci', () => {
    const sept = syntheseMois({ mois: '2026-09', lines, budgets, agregat: agreger(tx, idx, 'foyer'), filtre: 'foyer' })
    expect(sept.lignes.some((l) => l.cle === NON_CLASSE)).toBe(false)
  })

  it('filtre par titulaire (compte, ou correction sur l’opération) sans budget', () => {
    const commun = syntheseMois({ mois: '2026-10', lines, budgets, agregat: agreger(tx, idx, 'commun'), filtre: 'commun' })
    expect(commun.lignes.find((l) => l.cle === courses.id)!.reel).toBe(130)
    expect(commun.total.budget).toBeNull()
    const honorine = syntheseMois({ mois: '2026-10', lines, budgets, agregat: agreger(tx, idx, 'honorine'), filtre: 'honorine' })
    expect(honorine.lignes.find((l) => l.cle === courses.id)!.reel).toBe(40)
  })

  it('détaille une ligne par catégorie, la plus lourde d’abord', () => {
    const d = detailLigne({ cle: courses.id, mois: '2026-10', transactions: tx, idx, filtre: 'foyer' })
    expect(d.map((g) => [g.nom, g.total])).toEqual([['Alimentation', 220], ['Alimentation › Boulangerie', 30]])
    expect(d.map((g) => g.court)).toEqual(['Alimentation', 'Boulangerie'])
  })

  it('fait le bilan de plusieurs mois avec les dépassements', () => {
    const b = bilan({ mois: ['2026-09', '2026-10'], lines, budgets, agregat: agreger(tx, idx, 'foyer'), filtre: 'foyer' })
    const c = b.lignes.find((l) => l.cle === courses.id)!
    expect(c.reel).toBe(850)
    expect(c.budget).toBe(1500)
    expect(c.depassements).toBe(0)
    const f = b.lignes.find((l) => l.cle === fixes.id)!
    expect(f.cellules.map((x) => x.reel)).toEqual([0, 1100])
    expect(b.total.entrees).toBe(4000)
  })
})

describe('patrimoine et allocation', () => {
  it('sépare actifs et dettes, ignore les comptes archivés', () => {
    const p = patrimoine([compte({ balance: 1000 }), compte({ kind: 'pret', balance: -400 }), compte({ balance: 50, archived: true })])
    expect([p.brut, p.dettes, p.net]).toEqual([1000, 400, 600])
  })

  it('compare au portefeuille suivi (classes avec cible) et met le reste à part', () => {
    const a = compte({ kind: 'investissement' })
    const pos = (asset_class: FinHolding['asset_class'], value: number): FinHolding => ({
      id: id(), user_id: 'u', account_id: a.id, name: asset_class, code: null, quantity: null, value, buy_value: null,
      asset_class, class_manual: false, source: 'test', external_id: null, updated_at: '',
    })
    const cible = (asset_class: FinTarget['asset_class'], pct: number): FinTarget => ({ id: id(), user_id: 'u', asset_class, pct })
    const r = allocation([pos('or', 300), pos('actions', 700), pos('crypto', 5000)], [cible('or', 50), cible('actions', 50)], [a])
    expect(r.suivi).toBe(1000)
    const or = r.suivies.find((l) => l.classe === 'or')!
    expect(or.pct).toBe(30)
    expect(or.ecart).toBe(-20)
    expect(or.aAjuster).toBe(200)
    expect(r.horsCible).toEqual([{ classe: 'crypto', valeur: 5000 }])
  })
})

describe('intitulés locaux', () => {
  const regle = (pattern: string, label: string) => ({ id: id(), user_id: 'u', pattern, label, created_at: '' })
  it('nettoie l’intitulé bancaire : casse, accents, numéro de carte', () => {
    expect(normaliserLibelle('LA BOULANGERIE 2 CB*1111')).toBe('la boulangerie 2')
    expect(normaliserLibelle('Pharmacie ÉTÉ  CB*2222')).toBe('pharmacie ete')
    expect(normaliserLibelle('PRLV SEPA EDF CLIENTS')).toBe('edf clients')
  })
  it('affiche l’intitulé propre, sinon la règle au même intitulé (carte ignorée), sinon l’original', () => {
    const r = creerReconnaissance([regle('carrefour', 'Carrefour'), regle('carrefour city 2', 'Carrefour City (rue)')])
    expect(r.libelle(op('a', '2026-10-01', -5, { label: 'CARREFOUR CITY 2 CB*3333' }))).toBe('Carrefour City (rue)')
    expect(r.libelle(op('a', '2026-10-01', -5, { label: 'CARREFOUR CB*1111' }))).toBe('Carrefour')
    expect(r.libelle(op('a', '2026-10-01', -5, { label: 'LIDL CB*1111' }))).toBe('LIDL CB*1111')
    expect(r.libelle(op('a', '2026-10-01', -5, { label: 'CARREFOUR CB*1', label_local: 'Pique-nique' }))).toBe('Pique-nique')
    expect(r.estLocal(op('a', '2026-10-01', -5, { label: 'LIDL' }))).toBe(false)
  })
  it('une règle ne rebaptise jamais un intitulé qui ne fait que la contenir', () => {
    const r = creerReconnaissance([regle('ville', 'Retrait')])
    expect(r.libelle(op('a', '2026-10-01', -5, { label: 'VILLE CB*1111' }))).toBe('Retrait')
    expect(r.libelle(op('a', '2026-10-01', -5, { label: 'CRF VILLE - CENTRE CB*1111' }))).toBe('CRF VILLE - CENTRE CB*1111')
  })
})

describe('recherche d’opérations', () => {
  const tx = [
    op(joint.id, '2026-09-03', -42.5, { category_id: alim.id, label: 'EPICERIE ÉTÉ 2 CB*1111' }),
    op(joint.id, '2026-10-03', -42.9, { category_id: boulangerie.id, label: 'FOURNIL CB*1111', label_local: 'Pain du coin' }),
    op(perso.id, '2026-10-05', -8, { category_id: loyer.id, label: 'ASSURANCE HABITATION', owner: 'honorine' }),
  ]
  const r = (requete: string, filtre: 'foyer' | 'honorine' = 'foyer') =>
    rechercherOperations({ transactions: tx, requete, idx, filtre }).map((t) => t.label)
  it('cherche dans l’intitulé bancaire, l’intitulé local, la catégorie et la ligne, sans casse ni accents', () => {
    expect(r('epicerie ete')).toEqual(['EPICERIE ÉTÉ 2 CB*1111'])
    expect(r('pain coin')).toEqual(['FOURNIL CB*1111'])
    expect(r('courses')).toEqual(['FOURNIL CB*1111', 'EPICERIE ÉTÉ 2 CB*1111'])  // la ligne ; récentes d'abord
    expect(r('frais fixe')).toEqual(['ASSURANCE HABITATION'])
  })
  it('un nombre cherche le montant : à l’euro près sans centimes, au centime sinon', () => {
    expect(r('42')).toEqual(['FOURNIL CB*1111', 'EPICERIE ÉTÉ 2 CB*1111'])
    expect(r('42,50')).toEqual(['EPICERIE ÉTÉ 2 CB*1111'])
    expect(r('8 €')).toEqual(['ASSURANCE HABITATION'])
  })
  it('suit le filtre de titulaire ; rien pour une recherche vide', () => {
    expect(r('assurance', 'honorine')).toEqual(['ASSURANCE HABITATION'])
    expect(r('epicerie', 'honorine')).toEqual([])
    expect(r('  ')).toEqual([])
  })
})

describe('regroupements d’intitulés', () => {
  it('prélèvement : regroupe par mandat (RUM), quels que soient les numéros', () => {
    const a = cleGroupe('FOURNISSEUR SA Mandat 00X1 REF20261001ABC RUM MANDAT-42')
    const b = cleGroupe('FOURNISSEUR S.A. 99999 REF20261101XYZ RUM MANDAT-42')
    expect(a.cle).toBe('rum:mandat-42')
    expect(b.cle).toBe(a.cle)
    expect(a.nom).toBe('Fournisseur SA Mandat')
  })
  it('enseigne connue : Carrefour City, Carrefour Market et CRF → Carrefour ; « interne » n’est pas Intermarché', () => {
    expect(cleGroupe('CARREFOUR CITY 2 CB*1111')).toEqual({ cle: 'enseigne:carrefour', nom: 'Carrefour' })
    expect(cleGroupe('CARREFOUR MARKET CB*2222').cle).toBe('enseigne:carrefour')
    expect(cleGroupe('CRF VILLE - CENTRE CB*1111').cle).toBe('enseigne:carrefour')
    expect(cleGroupe('INTER QUARTIER 9 CB*1111').nom).toBe('Intermarché')
    expect(cleGroupe('Interne depenses annualisees Réf : SCT123').cle).toBe('interne depenses annualisees')
  })
  it('fournisseur connu : passe avant le mandat (fibre et mobile → un seul groupe)', () => {
    expect(cleGroupe('ORANGE SA Votre abonnement fibre (facture: X1) 123 RUM MANDAT-A').cle).toBe('enseigne:orange')
    expect(cleGroupe('ORANGE SA-ORANGE Votre abonnement mobile 456 RUM MANDAT-B').cle).toBe('enseigne:orange')
    expect(cleGroupe('Spotify P4206A2E5 CB*1111').nom).toBe('Spotify')
  })
  it('sinon : l’intitulé sans mots chiffrés (numéro de magasin, référence, date)', () => {
    expect(cleGroupe('LA BOULANGERIE 2 CB*1111').cle).toBe(cleGroupe('LA BOULANGERIE CB*2222').cle)
    expect(cleGroupe('Musique P44336255 CB*1111').cle).toBe(cleGroupe('Musique P453AFB22 CB*1111').cle)
    expect(cleGroupe('ECH PRET 1234X DU 01/07/26').cle).toBe(cleGroupe('ECH PRET 1234X DU 01/08/26').cle)
    expect(nomLisible('LA BOULANGERIE 2 CB*1111')).toBe('La Boulangerie')
    expect(nomLisible('EPICERIE DE QUARTIER CB*1111')).toBe('Epicerie de Quartier')
    expect(nomLisible('OPERATEUR SA fibre (facture: X01) RUM M-1')).toBe('Operateur SA fibre')
    expect(nomLisible('FOURNISSEUR S.A. Mandat 00X01')).toBe('Fournisseur S.A. Mandat')
  })
  it('regroupe les opérations d’une catégorie par intitulé semblable, les plus grosses d’abord', () => {
    const ops = [
      op(joint.id, '2026-10-03', -30, { label: 'CARREFOUR CITY 2 CB*1111' }),
      op(joint.id, '2026-10-09', -60, { label: 'CRF VILLE CB*2222' }),
      op(joint.id, '2026-10-12', -20, { label: 'CARREFOUR MARKET CB*1111' }),
      op(joint.id, '2026-10-05', -15, { label: 'LA BOULANGERIE 2 CB*1111' }),
      op(joint.id, '2026-10-06', 5, { label: 'CARREFOUR CITY CB*1111' }),           // remboursement : se déduit
    ]
    const g = grouperParIntitule(ops, [])
    expect(g.map((x) => [x.nom, x.operations.length, x.total])).toEqual([['Carrefour', 4, 105], ['La Boulangerie', 1, 15]])
    expect(g[0]!.operations[0]!.date).toBe('2026-10-12')
  })
  it('réunit les opérations au même intitulé local, même si les intitulés bancaires diffèrent', () => {
    const ops = [
      op(joint.id, '2026-07-01', -900, { label: 'Bailleur EXEMPLE Virement de Moi Réf : SCT111', label_local: 'Loyer' }),
      op(joint.id, '2026-06-01', -900, { label: 'Bailleur EXEMPLE', label_local: 'Loyer' }),
      op(joint.id, '2026-05-04', -900, { label: 'Bailleur EXEMPLE Virement de Moi Réf : SCT222', label_local: 'Loyer' }),
    ]
    const g = grouperParIntitule(ops, [], (t) => t.label_local)
    expect(g.map((x) => [x.nom, x.operations.length, x.cles])).toEqual([['Loyer', 3, ['local:loyer']]])
  })
  it('un regroupement manuel posé sur le mandat ou l’intitulé reste reconnu après l’ajout d’une enseigne', () => {
    const ops = [
      op(joint.id, '2026-09-10', -40, { label: 'ORANGE SA fibre 1 RUM MANDAT-A' }),
      op(joint.id, '2026-09-12', -20, { label: 'ORANGE SA-ORANGE mobile 2 RUM MANDAT-B' }),
      op(joint.id, '2026-09-15', -9, { label: 'SYNDICAT EXEMPLE cotisation RUM ADH-1' }),
    ]
    const groupes = [
      { id: 'g1', user_id: 'u', pattern: 'rum:mandat-a', name: 'Abonnements', created_at: '' },
      { id: 'g2', user_id: 'u', pattern: 'rum:adh-1', name: 'Abonnements', created_at: '' },
    ]
    const g = grouperParIntitule(ops, groupes)
    expect(g.map((x) => [x.nom, x.operations.length])).toEqual([['Abonnements', 2], ['Orange', 1]])
  })
  it('dans un groupe manuel, les opérations semblables sont regroupées à leur tour', () => {
    const ops = [
      op(joint.id, '2026-09-10', -40, { label: 'ORANGE SA fibre 1 RUM MANDAT-A' }),
      op(joint.id, '2026-09-12', -20, { label: 'ORANGE SA-ORANGE mobile 2 RUM MANDAT-B' }),
      op(joint.id, '2026-09-15', -9, { label: 'SYNDICAT EXEMPLE cotisation RUM ADH-1' }),
    ]
    const groupes = ['rum:mandat-a', 'rum:mandat-b', 'rum:adh-1']
      .map((pattern, i) => ({ id: `g${i}`, user_id: 'u', pattern, name: 'Abonnements', created_at: '' }))
    const [abo] = grouperParIntitule(ops, groupes)
    expect(abo!.nom).toBe('Abonnements')
    expect(abo!.sousGroupes!.map((x) => [x.nom, x.operations.length, x.total])).toEqual([['Orange', 2, 60], ['Syndicat Exemple cotisation', 1, 9]])
    // Sur plusieurs mois : les sous-groupes ont aussi leurs montants par mois.
    const [p] = detailPeriode({ cle: NON_CLASSE, mois: ['2026-09'], transactions: ops, idx, filtre: 'foyer', groupes })
    expect(p!.sousGroupes!.map((x) => x.parMois)).toEqual([[60], [9]])
  })
  it('dans une catégorie, un groupe manuel du même nom (ou seul) laisse place à ses intitulés', () => {
    const ops = [
      op(joint.id, '2026-09-10', -40, { label: 'ORANGE SA fibre 1 RUM MANDAT-A' }),
      op(joint.id, '2026-09-12', -20, { label: 'ORANGE SA-ORANGE mobile 2 RUM MANDAT-B' }),
      op(joint.id, '2026-09-15', -9, { label: 'SYNDICAT EXEMPLE cotisation RUM ADH-1' }),
      op(joint.id, '2026-09-16', -70, { label: 'AUTRE CHOSE' }),
    ]
    const regles = ['rum:mandat-a', 'rum:mandat-b', 'rum:adh-1']
      .map((pattern, i) => ({ id: `g${i}`, user_id: 'u', pattern, name: 'Abonnements', created_at: '' }))
    const g = grouperParIntitule(ops, regles)
    expect(aplatirGroupes(g, 'Abonnement').map((x) => x.nom)).toEqual(['Autre Chose', 'Orange', 'Syndicat Exemple cotisation'])
    expect(aplatirGroupes(g, 'Téléphone').map((x) => x.nom)).toEqual(['Autre Chose', 'Abonnements'])
    expect(aplatirGroupes(grouperParIntitule(ops.slice(0, 3), regles)).map((x) => x.nom)).toEqual(['Orange', 'Syndicat Exemple cotisation'])
  })
  it('compacte une ligne sur 3 mois : une ligne par groupe, montant par mois et moyenne', () => {
    const mois = ['2026-07', '2026-08', '2026-09']
    const tx = [
      op(joint.id, '2026-07-03', -30, { category_id: alim.id, label: 'CARREFOUR CITY 2 CB*1111' }),
      op(joint.id, '2026-08-03', -60, { category_id: alim.id, label: 'CRF VILLE CB*1111' }),
      op(joint.id, '2026-09-03', -15, { category_id: boulangerie.id, label: 'LA BOULANGERIE 2 CB*1111' }),
      op(joint.id, '2026-09-04', -9, { category_id: boulangerie.id, label: 'LE FOURNIL CB*1111', label_local: 'Fournil du coin' }),
      op(joint.id, '2026-09-05', -500, { category_id: loyer.id, label: 'LOYER' }),               // autre ligne
      op(joint.id, '2026-06-05', -99, { category_id: alim.id, label: 'CARREFOUR CB*1111' }),     // hors période
    ]
    const g = detailPeriode({ cle: courses.id, mois, transactions: tx, idx, filtre: 'foyer', groupes: [],
      libelleLocal: (t) => t.label_local })
    expect(g.map((x) => x.nom)).toEqual(['Carrefour', 'La Boulangerie', 'Fournil du coin'])
    expect(g[0]!.parMois).toEqual([30, 60, 0])
    expect(g[0]!.moyenne).toBe(30)
    // Regroupement manuel : la boulangerie et le fournil sous un même nom.
    const groupes = [{ id: 'g1', user_id: 'u', pattern: 'la boulangerie', name: 'Pain', created_at: '' },
      { id: 'g2', user_id: 'u', pattern: 'le fournil', name: 'Pain', created_at: '' }]
    const r = detailPeriode({ cle: courses.id, mois, transactions: tx, idx, filtre: 'foyer', groupes })
    const pain = r.find((x) => x.nom === 'Pain')!
    expect(pain.manuel).toBe(true)
    expect(pain.parMois).toEqual([0, 0, 24])
    expect(pain.cles.sort()).toEqual(['la boulangerie', 'le fournil'])
  })
})

describe('opérations semblables', () => {
  it('retrouve le même intitulé (carte comprise) sur les autres mois, hors celles déjà bien rangées', () => {
    const reco = creerReconnaissance([])
    const a = op(joint.id, '2026-10-02', -5, { label: 'LA BOULANGERIE 2 CB*1111', category_id: divers.id })
    const b = op(joint.id, '2026-08-02', -4, { label: 'LA BOULANGERIE 2 CB*2222', category_id: divers.id })
    const c = op(joint.id, '2026-07-02', -4, { label: 'LA BOULANGERIE 2 CB*3333', category_id: boulangerie.id })
    const d = op(joint.id, '2026-09-02', -9, { label: 'CARREFOUR CB*1111', category_id: divers.id })
    expect(operationsSemblables(a, [a, b, c, d], reco, idx, boulangerie.id).map((t) => t.id)).toEqual([b.id])
  })
  it('suit aussi une règle d’intitulé local commune', () => {
    const reco = creerReconnaissance([{ id: 'r', user_id: 'u', pattern: 'carrefour city 2', label: 'Carrefour', created_at: '' }])
    const a = op(joint.id, '2026-10-02', -5, { label: 'CARREFOUR CITY 2 CB*1111' })
    const b = op(joint.id, '2026-09-02', -5, { label: 'CARREFOUR CITY 2 CB*3333' })
    expect(operationsSemblables(a, [a, b], reco, idx, alim.id).map((t) => t.id)).toEqual([b.id])
  })
})

describe('composition du patrimoine', () => {
  // Montants fictifs (dépôt public).
  const point = { date: '2026-10-08', net: 150000, immobilier: 300000, prets: 200000, investissements: 30000, metaux: 10000, liquidites: 2000, crypto: 8000 }
  it('compte l’immobilier net des prêts et retrouve le net Finary avec la crypto', () => {
    const [p] = compositionPatrimoine([point], true)
    expect(p!.parts!.immobilier).toBe(100000)
    expect(p!.total).toBe(150000)
  })
  it('sans crypto, le total l’exclut aussi', () => {
    expect(compositionPatrimoine([point], false)[0]!.total).toBe(150000 - 8000)
  })
  it('un point sans composition garde son total', () => {
    const [p] = compositionPatrimoine([{ ...point, immobilier: null, investissements: null }], false)
    expect(p).toEqual({ date: '2026-10-08', parts: null, total: 150000 })
  })
  it('réécrit l’immobilier : la valeur retenue de chaque bien vaut depuis sa date d’achat', () => {
    const biens = [
      compte({ kind: 'immobilier', balance: 120000, acquired_on: '2018-01-01' }),
      compte({ kind: 'immobilier', balance: 250000, acquired_on: '2023-01-01' }),
    ]
    const avant = { ...point, date: '2020-06-01', immobilier: 90000 }    // ancienne estimation Finary
    const [a, b] = compositionPatrimoine([avant, point], true, biens)
    expect(a!.parts!.immobilier).toBe(120000 - 200000)
    expect(b!.parts!.immobilier).toBe(370000 - 200000)
  })
  it('un prêt saisi corrige le capital restant dû à partir du jour de la saisie', () => {
    const pret = compte({ kind: 'pret', balance: -150000, balance_source: -200000, balance_manual_at: '2026-10-01T10:00:00Z' })
    const [a, b] = compositionPatrimoine([{ ...point, date: '2026-09-30' }, point], true, [pret])
    expect(a!.parts!.immobilier).toBe(300000 - 200000)
    expect(b!.parts!.immobilier).toBe(300000 - 150000)
  })
  it('le patrimoine des comptes peut écarter la crypto', () => {
    const p = patrimoine([compte({ balance: 1000 }), compte({ kind: 'crypto', balance: 500 })], false)
    expect(p.net).toBe(1000)
  })
})

describe('dépenses à venir', () => {
  const prevue = (over: Partial<FinPlanned>): FinPlanned => ({
    id: id(), user_id: 'u', title: 'Pneus', amount: 600, due_date: '2027-01-15', line_id: null, saved: 0, done: false,
    note: null, created_at: '', ...over,
  })
  it('répartit le reste à mettre de côté sur les mois d’ici l’échéance', () => {
    expect(provision(prevue({ saved: 150 }), '2026-10-08')).toEqual({ restant: 450, mois: 3, parMois: 150 })
  })
  it('demande tout de suite ce qui échoit ce mois-ci ou est passé, rien si c’est réglé', () => {
    expect(provision(prevue({ due_date: '2026-10-30' }), '2026-10-08').parMois).toBe(600)
    expect(provision(prevue({ due_date: '2026-08-01' }), '2026-10-08').parMois).toBe(600)
    expect(provision(prevue({ done: true }), '2026-10-08').parMois).toBe(0)
  })
})
