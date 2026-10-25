// ================================================================
// Tests des règles pures de l'onglet Finances (finances.ts). Aucun réseau.
// ================================================================
import { describe, it, expect } from 'vitest'
import type { FinAccount, FinBudget, FinEcheance, FinLoan, FinCategory, FinHolding, FinLine, FinPlanned, FinTarget, FinTransaction } from './types'
import {
  estEnAttente, NON_CLASSE, agreger, allocation, bilan, aplatirGroupes, capitalRembourse, cleGroupe, compositionPatrimoine, depensesAVenir, detailPeriode, entreesPrevues, grouperParIntitule, nomLisible, creerReconnaissance, normaliserLibelle, operationsSemblables, rechercherOperations, operationsRecentes, segmentsSurlignes, categoriesParLigne, ligneDeCategorie, budgetDe, budgetAjuste, ecrituresBudgetMois, estEpargneComptee, fondLigne, classer, decaleMois, detailLigne, ecartMois, euros, indexer,
  libelleMois, moisEcoules, patrimoine, previsionDe, provision, syntheseMois,
  agregerHorsCapital, appliquerRemboursements, remboursementsRecus, hierarchieDetail, nomPropres, detailHorsCapital, NOM_PRET_REIMS, capitalDuMois, epargnesPrevues, listeEpargnes,
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

describe('capital remboursé', () => {
  const ech = (date: string, capital: number) => ({ id: id(), user_id: 'u', account_id: 'p', date, capital, interets: 10, assurance: 0, frais: 0, restant_du: null, rang: null, source: 'pdf', created_at: '' })
  it('somme la part de capital des échéances du mois (différé : 0)', () => {
    const e = [ech('2026-09-01', 850), ech('2026-09-05', 207), ech('2026-10-01', 852), ech('2026-04-01', 0)]
    expect(capitalRembourse(e, '2026-09')).toBe(1057)
    expect(capitalRembourse(e, '2026-04')).toBe(0)
    expect(capitalRembourse(e, '2026-11')).toBe(0)
  })
})

describe('dépenses à venir dans le mois', () => {
  it('frais fixes réguliers pas encore passés + courses au-delà de ce qui est dépensé', () => {
    const fixe = (date: string, montant: number, label: string) => op(joint.id, date, -montant, { category_id: loyer.id, label })
    const tx = [
      ...['07', '08', '09'].map((m) => fixe(`2026-${m}-02`, 800, 'BAILLEUR EXEMPLE RUM B-1')),
      ...['07', '08', '09'].map((m) => fixe(`2026-${m}-10`, 30, 'BOX INTERNET EXEMPLE RUM I-1')),
      fixe('2026-10-02', 800, 'BAILLEUR EXEMPLE RUM B-1'),                                           // déjà passé ce mois-ci
      fixe('2026-08-15', 99, 'DEPENSE PONCTUELLE'),                                                   // pas régulière
      ...['07', '08', '09'].map((m, i) => op(joint.id, `2026-${m}-05`, -(300 + i * 30), { category_id: alim.id })), // moyenne 330
      op(joint.id, '2026-10-05', -100, { category_id: alim.id }),
    ]
    const r = depensesAVenir({ mois: '2026-10', moisCourant: '2026-10', transactions: tx, idx, filtre: 'foyer', lines })
    expect(r.details.map((d) => [d.nom, Math.round(d.montant)])).toEqual([['BOX Internet Exemple', 30], ['Courses (moyenne 3 mois)', 230]])
    expect(Math.round(r.total)).toBe(260)
    expect(depensesAVenir({ mois: '2026-09', moisCourant: '2026-10', transactions: tx, idx, filtre: 'foyer', lines }).total).toBe(0)
  })
})

describe('entrées prévues', () => {
  it('retient les entrées présentes chacun des 3 mois précédents, au plus petit montant', () => {
    const paie = (date: string, montant: number) =>
      op(joint.id, date, montant, { category_id: salaire.id, label: `EMPLOYEUR EXEMPLE PAIE ${date} REF X${montant}` })
    const tx = [
      paie('2026-07-28', 3000), paie('2026-08-28', 3400), paie('2026-09-28', 3100),
      op(joint.id, '2026-09-10', 250, { category_id: salaire.id, label: 'PRIME UNIQUE' }),     // une seule fois : ignorée
      paie('2026-10-28', 9999),                                                                   // mois en cours : hors calcul
    ]
    const p = entreesPrevues({ mois: '2026-10', transactions: tx, idx, filtre: 'foyer' })
    expect(p!.montant).toBe(3000)
    expect(p!.moyenne).toBeCloseTo(3166.67, 2)          // (3000 + 3400 + 3100) / 3
    expect(p!.sources.map((x) => x.nom)).toEqual(['Employeur Exemple Paie'])
    expect(entreesPrevues({ mois: '2026-10', transactions: tx.slice(3), idx, filtre: 'foyer' })).toBeNull()
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
  it('un groupe manuel forme un seul groupe à plat, sans sous-groupes, partout', () => {
    const ops = [
      op(joint.id, '2026-09-10', -40, { label: 'ORANGE SA fibre 1 RUM MANDAT-A' }),
      op(joint.id, '2026-09-12', -20, { label: 'ORANGE SA-ORANGE mobile 2 RUM MANDAT-B' }),
      op(joint.id, '2026-09-15', -9, { label: 'SYNDICAT EXEMPLE cotisation RUM ADH-1' }),
      op(joint.id, '2026-09-16', -70, { label: 'AUTRE CHOSE' }),
    ]
    const groupes = ['rum:mandat-a', 'rum:mandat-b', 'rum:adh-1']
      .map((pattern, i) => ({ id: `g${i}`, user_id: 'u', pattern, name: 'Abonnements', created_at: '' }))
    const g = grouperParIntitule(ops, groupes)
    expect(g.map((x) => [x.nom, x.operations.length, x.total, !!x.sousGroupes])).toEqual([['Abonnements', 3, 69, false], ['Autre Chose', 1, 70, false]].sort((a, b) => (b[2] as number) - (a[2] as number)))
    expect(aplatirGroupes(g, 'Abonnement').map((x) => x.nom)).toEqual(['Autre Chose', 'Abonnements'])
    const [p] = detailPeriode({ cle: NON_CLASSE, mois: ['2026-09'], transactions: ops.slice(0, 3), idx, filtre: 'foyer', groupes })
    expect([p!.nom, p!.parMois, p!.sousGroupes]).toEqual(['Abonnements', [69], undefined])
  })
  it('un commerçant renommé (fin_merchant_alias) vaut pour toutes ses opérations, après l’intitulé propre', () => {
    const alias = [{ pattern: 'enseigne:carrefour', label: 'Courses Carrefour' }]
    const r = creerReconnaissance([{ id: 'l1', user_id: 'u', pattern: 'carrefour market', label: 'Market', created_at: '' }], alias)
    const a = op(joint.id, '2026-09-03', -40, { label: 'CARREFOUR CITY CB*1111' })
    const b = op(joint.id, '2026-09-04', -60, { label: 'CARREFOUR MARKET' })
    const c = op(joint.id, '2026-09-05', -5, { label: 'CRF REIMS', label_local: 'Pique-nique' })
    expect([r.libelle(a), r.libelle(b), r.libelle(c)]).toEqual(['Courses Carrefour', 'Courses Carrefour', 'Pique-nique'])
    const g = grouperParIntitule([a, b], [], (t) => (r.estLocal(t) ? r.libelle(t) : null))
    expect(g.map((x) => [x.nom, x.operations.length])).toEqual([['Courses Carrefour', 2]])
  })
  it('une opération sans intitulé local rejoint celles qui en ont un au même intitulé bancaire', () => {
    const ops = [
      op(joint.id, '2026-07-01', -900, { label: 'BAILLEUR EXEMPLE Virement de Moi Réf : SCT1', label_local: 'Loyer' }),
      op(joint.id, '2026-08-01', -900, { label: 'BAILLEUR EXEMPLE Virement de Moi Réf : SCT2' }),
      op(joint.id, '2026-09-01', -900, { label: 'BAILLEUR EXEMPLE Virement de Moi Réf : SCT3' }),
      op(joint.id, '2026-09-03', -40, { label: 'CARREFOUR CITY CB*1111', label_local: 'Pique-nique' }),
      op(joint.id, '2026-09-04', -60, { label: 'CARREFOUR MARKET CB*1111' }),        // l'enseigne ne suit pas l'intitulé local
    ]
    const g = grouperParIntitule(ops, [], (t) => t.label_local)
    expect(g.map((x) => [x.nom, x.operations.length])).toEqual([['Loyer', 3], ['Carrefour', 1], ['Pique-nique', 1]])
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

describe('opération en attente', () => {
  const base = { note: null, pending: false } as unknown as FinTransaction
  it('reconnaît le drapeau pending ou la note « en attente »', () => {
    expect(estEnAttente({ ...base, pending: true })).toBe(true)
    expect(estEnAttente({ ...base, note: 'En attente de validation' })).toBe(true)
    expect(estEnAttente(base)).toBe(false)
    expect(estEnAttente({ ...base, note: 'Resto en attente' })).toBe(false)
  })
})

// ---------- Capital de prêt : retiré de la ligne emprunt, compté en épargne ----------

describe('capital de prêt extrait de la ligne emprunt', () => {
  const pretCompte = compte({ kind: 'pret', in_budget: false, name: 'PRET IMMOBILIER 111A' })
  const pretAirbnb = compte({ kind: 'pret', in_budget: false, name: 'PRET IMMOBILIER 222B' })
  const airbnb = compte({ kind: 'investissement', in_budget: false })
  const idxP = indexer([joint, perso, pea, pretCompte, pretAirbnb, airbnb], categories, lines)
  const pret = (account_id: string, debit_match: string): FinLoan => ({ id: id(), account_id, debit_match, debit_account_ids: [] } as unknown as FinLoan)
  const ech = (account_id: string, date: string, capital: number, interets = 300): FinEcheance =>
    ({ id: id(), user_id: 'u', account_id, date, capital, interets, assurance: 0, frais: 0, restant_du: null } as unknown as FinEcheance)
  const prets = [pret(pretCompte.id, 'ECH PRET 111A'), pret(pretAirbnb.id, 'ECH PRET 222B')]
  const echeances = [
    ech(pretCompte.id, '2026-09-01', 850), ech(pretCompte.id, '2026-10-01', 852), ech(pretCompte.id, '2026-11-01', 854),
    ech(pretAirbnb.id, '2026-10-01', 500), ech(pretAirbnb.id, '2026-11-01', 501),
  ]
  const debit = (date: string, montant: number, label: string, compteId = perso.id) => op(compteId, date, -montant, { category_id: loyer.id, label })
  const tx = [
    debit('2026-09-01', 1150, 'ECH PRET 111A DU 01/09/26'),
    debit('2026-10-01', 1152, 'ECH PRET 111A DU 01/10/26'),
    debit('2026-10-01', 600, 'ECH PRET 222B DU 01/10/26', airbnb.id),           // compte hors budget
    op(joint.id, '2026-10-03', -40, { category_id: loyer.id, label: 'ASSURANCE' }),
  ]
  const base = { prets, echeances, transactions: tx, idx: idxP, filtre: 'foyer' as const, moisCourant: '2026-10', aujourdhui: '2026-10-20' }

  it('prêts de Reims (164522C + BFM) : une ligne « Prêt appart Reims » avec opérations réelles et intérêts/assurance', () => {
    const r1 = compte({ kind: 'pret', in_budget: false, name: 'PRET IMMOBILIER 164522C' })
    const bfm = compte({ kind: 'pret', in_budget: false, name: 'Prêt BFM' })
    const ix = indexer([joint, perso, r1, bfm], categories, lines)
    const o = { prets: [pret(r1.id, 'ECH PRET 164522C'), pret(bfm.id, '00019999BOBOCRE001')],
      echeances: [ech(r1.id, '2026-10-01', 853.67, 329.49), ech(bfm.id, '2026-10-05', 207.08, 4.54)],
      transactions: [debit('2026-10-01', 1183.16, 'ECH PRET 164522C DU 01/10/26'), debit('2026-10-05', 211.62, 'BANQUE FRANCAISE MUTUALISTE 00019999BOBOCRE001 Echeance')],
      idx: ix, filtre: 'foyer' as const, moisCourant: '2026-10', aujourdhui: '2026-10-20' }
    const c = capitalDuMois({ ...o, mois: '2026-10' })
    const l = listeEpargnes({ mois: '2026-10', moisCourant: '2026-10', lignes: [], capital: c })
    expect(l.lignes).toHaveLength(1)
    expect(l.lignes[0]!.nom).toBe(NOM_PRET_REIMS)
    expect(l.lignes[0]!.montant).toBeCloseTo(1060.75)
    expect(l.lignes[0]!.pastilles!.map((p) => [p.type, p.montant])).toEqual([
      ['operation', 1183.16], ['operation', 211.62], ['interets', 329.49], ['assurance', 4.54]])
    const g = detailHorsCapital([{ nom: 'Frais › Emprunt', court: 'Emprunt', total: 1394.78, operations: o.transactions }], fixes.id, c)
    expect(g.groupes[0]!.total).toBeCloseTo(334.03)
    expect(g.touches.get('Frais › Emprunt')).toEqual({ reims: true })
  })

  it('retire le capital de la ligne qui porte le prélèvement, borné au montant débité', () => {
    const c = capitalDuMois({ ...base, mois: '2026-10' })
    expect(c.fait).toBe(852 + 500)   // + capital du prêt payé hors budget
    expect(c.extraitParLigne.get(fixes.id)).toBe(852)
    expect(c.prets.find((p) => p.etat === 'fait')?.debite).toBe(1152)
    // Débit plus petit que le capital de l'échéance : on ne retire que ce qui a été débité.
    const partiel = capitalDuMois({ ...base, transactions: [debit('2026-10-01', 400, 'ECH PRET 111A DU 01/10/26')], mois: '2026-10' })
    expect(partiel.fait).toBe(400)
  })
  it('un prêt déclaré hors budget compte même quand ses opérations ne sont pas visibles (vue partagée)', () => {
    const sansHorsBudget = tx.filter((t) => t.account_id !== airbnb.id)
    const declare = prets.map((p) => (p.debit_match === 'ECH PRET 222B' ? { ...p, debit_hors_budget: true } : p))
    // Sans la déclaration, le prélèvement invisible laisse le prêt hors du calcul.
    expect(capitalDuMois({ ...base, transactions: sansHorsBudget, mois: '2026-10' }).prets.some((p) => p.nom.includes('222B'))).toBe(false)
    // Déclaré : échéance passée = fait, échéance à venir = prévu ; aucune ligne n'est touchée.
    const fait = capitalDuMois({ ...base, prets: declare, transactions: sansHorsBudget, mois: '2026-10' })
    const p = fait.prets.find((x) => x.nom.includes('222B'))!
    expect([p.etat, p.horsBudget, p.extrait]).toEqual(['fait', true, 500])
    expect(fait.horsBudget).toBe(500)
    const avant = capitalDuMois({ ...base, prets: declare, transactions: sansHorsBudget, mois: '2026-10', aujourdhui: '2026-09-25' })
    expect(avant.prets.find((x) => x.nom.includes('222B'))?.etat).toBe('prevu')
  })
  it('un prêt payé depuis un compte hors budget compte en épargne sans toucher à aucune ligne', () => {
    // Prélèvement vu ce mois-ci sur le compte hors budget : fait.
    const c = capitalDuMois({ ...base, aujourdhui: '2026-10-20', mois: '2026-10' })
    const p = c.prets.find((x) => x.nom.includes('222B'))!
    expect(p.etat).toBe('fait')
    expect(p.horsBudget).toBe(true)
    expect(c.horsBudget).toBe(500)
    expect(c.fait).toBe(852 + 500)
    expect(c.extraitParLigne.size).toBe(1)   // seule la ligne du prêt du budget est allégée
    const { agregat } = agregerHorsCapital({ ...base, aujourdhui: '2026-10-20' })
    expect(agregat.get('2026-10')?.lignes.get(fixes.id)).toBeCloseTo(1152 - 852 + 40, 2)
  })
  it('hors budget : fait si l’échéance est passée, prévu sinon', () => {
    const sansDebit = tx.filter((t) => t.account_id !== airbnb.id)
    const apres = capitalDuMois({ ...base, transactions: [...sansDebit, debit('2026-10-02', 1, 'ECH PRET 222B DU 02/10', airbnb.id)], aujourdhui: '2026-10-20', mois: '2026-10' })
    expect(apres.prets.find((x) => x.nom.includes('222B'))?.etat).toBe('fait')
    const avantEcheance = capitalDuMois({ ...base, transactions: [debit('2026-09-01', 600, 'ECH PRET 222B DU 01/09/26', airbnb.id)], aujourdhui: '2026-09-20', moisCourant: '2026-09', mois: '2026-10' })
    const p = avantEcheance.prets.find((x) => x.nom.includes('222B'))!
    expect(p.etat).toBe('prevu')
    expect(avantEcheance.prevu).toBe(500)
    // Prévu hors budget : listé en « prévu » dans l'Épargné, mais pas retiré du Reste.
    const ep = (nom: string) => ({ cle: nom, ligne: ligne(nom, { kind: 'epargne' }), budget: 0, reel: 0, precedent: 0, moyenne3: 0, prevision: null, previsionSaisie: false })
    const l = listeEpargnes({ mois: '2026-10', moisCourant: '2026-09', lignes: [ep('Matelas')], capital: avantEcheance })
    expect(l.lignes.map((x) => [x.nom, x.montant, x.etat])).toContainEqual([expect.stringContaining('222B'), 500, 'prevu'])
    expect(epargnesPrevues({ mois: '2026-10', moisCourant: '2026-09', lignes: [ep('Matelas')], capital: avantEcheance }).total).toBe(0)
  })
  it('le capital pas encore débité est prévu (mois courant ou futur), pas dans un mois passé', () => {
    const futur = capitalDuMois({ ...base, mois: '2026-11' })
    expect(futur.prevu).toBe(854 + 501)
    expect(futur.fait).toBe(0)
    const sansDebitOct = capitalDuMois({ ...base, transactions: tx.filter((t) => t.date !== '2026-10-01' || t.account_id === airbnb.id), mois: '2026-10' })
    expect(sansDebitOct.prevu).toBe(852)
    expect(sansDebitOct.fait).toBe(500)
    const passe = capitalDuMois({ ...base, moisCourant: '2026-11', transactions: tx.filter((t) => t.date !== '2026-10-01' || t.account_id === airbnb.id), mois: '2026-10' })
    expect(passe.prevu).toBe(0)
  })
  it('aucun double compte, aucun trou : dépenses + capital = dépenses d’avant', () => {
    const avant = agreger(tx, idxP, 'foyer')
    const { agregat, capital } = agregerHorsCapital(base)
    for (const mois of ['2026-09', '2026-10']) {
      const total = (a: typeof avant) => [...(a.get(mois)?.lignes.values() ?? [])].reduce((s, v) => s + v, 0)
      expect(total(agregat) + (capital.get(mois)?.fait ?? 0) - (capital.get(mois)?.horsBudget ?? 0)).toBeCloseTo(total(avant), 2)
    }
    expect(agregat.get('2026-10')?.lignes.get(fixes.id)).toBeCloseTo(1152 - 852 + 40, 2)   // intérêts + assurance restent
    expect(agregat.get('2026-09')?.lignes.get(fixes.id)).toBeCloseTo(1150 - 850, 2)
    // L'agrégat d'origine n'est pas touché pour les autres vues.
    expect(avant.get('2026-10')?.lignes.get(fixes.id)).toBeCloseTo(1152 + 40, 2)
  })
  it('respecte le filtre de titulaire : le prêt d’un compte de Joffrey n’apparaît pas chez Honorine', () => {
    const c = capitalDuMois({ ...base, filtre: 'honorine', mois: '2026-10' })
    expect(c.fait).toBe(0)
    expect(c.extraitParLigne.size).toBe(0)
  })
  it('l’échéance de prêt à venir ne compte pas son capital dans les dépenses à venir', () => {
    const histo = ['07', '08', '09'].map((m) => debit(`2026-${m}-01`, 1150, `ECH PRET 111A DU 01/${m}/26`))
    const sansOct = [...histo]
    const capital = capitalDuMois({ ...base, transactions: sansOct, mois: '2026-10' })
    expect(capital.prevu).toBe(852)
    const avec = depensesAVenir({ mois: '2026-10', moisCourant: '2026-10', transactions: sansOct, idx: idxP, filtre: 'foyer', lines, capital })
    const sans = depensesAVenir({ mois: '2026-10', moisCourant: '2026-10', transactions: sansOct, idx: idxP, filtre: 'foyer', lines })
    expect(Math.round(sans.total)).toBe(1150)
    expect(Math.round(avec.total)).toBe(1150 - 852)
  })
})

describe('épargnes prévues et liste des épargnes', () => {
  const capital = (prets: Partial<ReturnType<typeof capitalDuMois>['prets'][number]>[]) => ({
    mois: '2026-10', extraitParLigne: new Map(), fait: 0, prevu: 0, horsBudget: 0,
    prets: prets.map((p) => ({ pretId: 'p', nom: 'Prêt X', mois: '2026-10', capital: 0, debite: 0, extrait: 0, prevu: 0, ligneId: null, motif: null, etat: 'fait', ...p })),
  }) as ReturnType<typeof capitalDuMois>
  const ep = (nom: string, budget: number | null, reel: number) =>
    ({ cle: nom, ligne: ligne(nom, { kind: 'epargne' }), budget, reel, precedent: 0, moyenne3: 0, prevision: null, previsionSaisie: false })
  const lignesB = [ep('Épargne avenir', 300, 300), ep('Épargne vacances', 700, 250), ep('Matelas', 0, 0)]

  it('budget d’épargne restant + capital à venir ; rien pour un mois passé', () => {
    const c = capital([{ etat: 'prevu', prevu: 850, nom: 'Prêt A' }, { etat: 'fait', extrait: 200 }])
    const r = epargnesPrevues({ mois: '2026-10', moisCourant: '2026-10', lignes: lignesB, capital: c })
    expect(r.details.map((d) => [d.nom, d.montant])).toEqual([['Capital Prêt A', 850]])
    expect(r.total).toBe(850)
    expect(epargnesPrevues({ mois: '2026-09', moisCourant: '2026-10', lignes: lignesB, capital: c }).total).toBe(0)
  })
  it('liste : une ligne par épargne, faite / prévue ; « Épargne vacances » n’en est pas une', () => {
    const c = capital([{ etat: 'fait', extrait: 850, nom: 'Prêt A' }, { etat: 'prevu', prevu: 200, nom: 'Prêt B' }, { etat: 'fait', horsBudget: true, extrait: 500, capital: 500, nom: 'Prêt Airbnb' }])
    const l = listeEpargnes({ mois: '2026-10', moisCourant: '2026-10', lignes: lignesB, capital: c })
    expect(l.lignes.map((x) => [x.nom, x.montant, x.etat])).toEqual([
      ['Épargne avenir', 300, 'fait'], ['Capital Prêt A', 850, 'fait'], ['Capital Prêt Airbnb', 500, 'fait'],
      ['Capital Prêt B', 200, 'prevu'],
    ])
    expect(l.fait).toBe(1650)
    expect(l.prevu).toBe(200)
  })
  it('Reste = budget dépenses − dépensé − à venir − épargnes prévues, sans double compte du capital', () => {
    const budgetDep = 6000, reelDep = 5000, aVenir = 100
    const c = capital([{ etat: 'prevu', prevu: 850, nom: 'Prêt A' }])
    const prevues = epargnesPrevues({ mois: '2026-10', moisCourant: '2026-10', lignes: lignesB, capital: c })
    expect(budgetDep - reelDep - aVenir - prevues.total).toBe(6000 - 5000 - 100 - 850)
  })
})

describe('budget d’un seul mois', () => {
  const c = ligne('Courses')
  const bud = (month: string, amount: number, kind: 'budget' | 'prevision' = 'budget') => ({ id: month + amount, user_id: 'u', line_id: c.id, kind, month: `${month}-01`, amount } as unknown as FinBudget)
  const appliquer = (budgets: FinBudget[], mois: string, montant: number | null) => {
    let b = budgets
    for (const e of ecrituresBudgetMois({ ligneId: c.id, mois, montant, budgets })) {
      b = b.filter((x) => !(x.kind === 'budget' && x.month === `${e.mois}-01`))
      if (e.montant !== null) b = [...b, bud(e.mois, e.montant)]
    }
    return b
  }
  const valeurs = (b: FinBudget[]) => ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12'].map((m) => budgetDe(c.id, m, b))
  it('ne change que ce mois : les suivants gardent leur budget, les précédents aussi', () => {
    const b = appliquer([bud('2026-01', 700), bud('2026-11', 750)], '2026-10', 900)
    expect(valeurs(b)).toEqual([700, 700, 900, 750, 750])
  })
  it('sans budget ultérieur, fige le mois suivant à l’ancienne valeur', () => {
    const b = appliquer([bud('2026-01', 700)], '2026-10', 900)
    expect(valeurs(b)).toEqual([700, 700, 900, 700, 700])
  })
  it('sans aucun budget avant : le mois suivant reste « sans budget » (0)', () => {
    const b = appliquer([], '2026-10', 300)
    expect(valeurs(b)).toEqual([null, null, 300, 0, 0])
  })
  it('vider la surcharge rend le mois au budget par défaut sans bouger les autres', () => {
    const avant = appliquer([bud('2026-01', 700)], '2026-10', 900)
    expect(valeurs(appliquer(avant, '2026-10', null))).toEqual([700, 700, 700, 700, 700])
  })
  it('ne touche pas au prévisionnel', () => {
    expect(ecrituresBudgetMois({ ligneId: c.id, mois: '2026-10', montant: 1, budgets: [bud('2026-11', 5, 'prevision')] }).map((e) => e.mois)).toEqual(['2026-11', '2026-10'])
  })
})

describe('budget ajusté pour ce mois', () => {
  const c = ligne('Courses')
  const bud = (month: string, amount: number) => ({ id: month + amount, user_id: 'u', line_id: c.id, kind: 'budget', month: `${month}-01`, amount } as unknown as FinBudget)
  const appliquer = (budgets: FinBudget[], mois: string, montant: number | null) => {
    let b = budgets
    for (const e of ecrituresBudgetMois({ ligneId: c.id, mois, montant, budgets })) {
      b = b.filter((x) => !(x.kind === 'budget' && x.month === `${e.mois}-01`))
      if (e.montant !== null) b = [...b, bud(e.mois, e.montant)]
    }
    return b
  }
  it('un budget changé pour ce mois seulement est ajusté, avec le budget habituel en base', () => {
    const b = appliquer([bud('2026-01', 700)], '2026-10', 900)
    expect(budgetAjuste(c.id, '2026-10', b)).toEqual({ ajuste: true, base: 700 })
    // le mois suivant, figé à l'ancienne valeur, et les précédents ne le sont pas
    expect(budgetAjuste(c.id, '2026-11', b).ajuste).toBe(false)
    expect(budgetAjuste(c.id, '2026-09', b).ajuste).toBe(false)
  })
  it('un changement durable (budget « à partir de ») n’est pas un ajustement', () => {
    const b = [bud('2026-01', 700), bud('2026-10', 900)]
    expect(budgetAjuste(c.id, '2026-10', b).ajuste).toBe(false)
    expect(budgetAjuste(c.id, '2026-11', b).ajuste).toBe(false)
  })
  it('rétablir le budget habituel efface l’ajustement', () => {
    const b = appliquer(appliquer([bud('2026-01', 700)], '2026-10', 900), '2026-10', null)
    expect(budgetAjuste(c.id, '2026-10', b).ajuste).toBe(false)
  })
  it('sans budget habituel : ajusté, base null', () => {
    expect(budgetAjuste(c.id, '2026-10', appliquer([], '2026-10', 300))).toEqual({ ajuste: true, base: null })
  })
})

describe('Épargne vacances n’est pas de l’épargne', () => {
  it('reconnue par son nom, sans casser les autres épargnes', () => {
    const l = (name: string, kind: 'depense' | 'epargne' = 'epargne') => ({ name, kind })
    expect(estEpargneComptee(l('Épargne vacances'))).toBe(false)
    expect(estEpargneComptee(l('EPARGNE VACANCES'))).toBe(false)
    expect(estEpargneComptee(l('Épargne avenir'))).toBe(true)
    expect(estEpargneComptee(l('Matelas sécurité'))).toBe(true)
    expect(estEpargneComptee(l('Vacances', 'depense'))).toBe(false)
    expect(estEpargneComptee(null)).toBe(false)
  })
})

describe('couleurs des lignes de budget', () => {
  it('Aménagement vert, Dépenses courantes sable, exceptionnelles taupe ; plus de bleu', () => {
    const l = (name: string, color: string | null = null) => ({ name, color })
    expect(fondLigne(l('Aménagement'))).toContain('22, 163, 74')
    expect(fondLigne(l('Dépenses courantes', 'rgba(1,2,3,.2)'))).toContain('190, 170, 140')
    expect(fondLigne(l('Dépenses exceptionnelles'))).toContain('150, 125, 105')
    expect(fondLigne(l('Courses', 'rgba(65, 105, 225, 0.26)'))).toContain('22, 163, 74')
    expect(fondLigne(l('Courses', 'rgba(245, 158, 11, 0.18)'))).toBe('rgba(245, 158, 11, 0.18)')
    expect(fondLigne(l('Dons'))).toBeNull()
  })
})

describe('hierarchieDetail (détail en lecture seule du Résumé)', () => {
  const g = (nom: string, total: number) => ({ nom, court: nom.split(' › ').pop()!, total, operations: [] })
  it('range les sous-catégories sous leur parent, sommes triées', () => {
    const r = hierarchieDetail([g('Alimentation › Boulangerie', 31), g('Alimentation › Courses', 373), g('Dons', 20)])
    expect(r.map((n) => [n.nom, n.total])).toEqual([['Alimentation', 404], ['Dons', 20]])
    expect(r[0]!.enfants).toEqual([{ nom: 'Courses', total: 373 }, { nom: 'Boulangerie', total: 31 }])
    expect(r[1]!.enfants).toEqual([])
  })
  it('les opérations du parent seul deviennent « Autres » quand il a des sous-catégories', () => {
    const r = hierarchieDetail([g('Maison', 50), g('Maison › Travaux', 100)])
    expect(r[0]!.total).toBe(150)
    expect(r[0]!.enfants).toEqual([{ nom: 'Travaux', total: 100 }, { nom: 'Autres', total: 50 }])
    expect(nomPropres('Courses')).toBe('Supermarché')
    expect(nomPropres('Logement')).toBe('Autres')
  })
  it('une catégorie seule reste une ligne simple', () => {
    expect(hierarchieDetail([g('Vacances', 383)])).toEqual([{ nom: 'Vacances', total: 383, enfants: [] }])
  })
})

describe('libellé Engie par jour', () => {
  const op = (date: string, amount: string, label = 'ENGIE S.A. Mandat 00S011613352 RUM 00S011613352', label_local: string | null = null) =>
    ({ id: date + amount, label, amount, date, label_local }) as unknown as FinTransaction
  const reco = creerReconnaissance([])
  it('18 → Taissy, 28 → Reims, ENGIE nu inclus', () => {
    expect(reco.libelle(op('2026-09-18', '-163.01'))).toBe('Engie Taissy Electricité')
    expect(reco.libelle(op('2026-09-28', '-152.36'))).toBe('Engie Reims Gaz&Electricité')
    expect(reco.libelle(op('2026-10-19', '-218.69', 'ENGIE'))).toBe('Engie Taissy Electricité')
  })
  it('crédit inchangé, label_local prioritaire', () => {
    expect(reco.libelle(op('2025-12-19', '124.04', 'ENGIE S.A. D000'))).toBe('ENGIE S.A. D000')
    expect(reco.libelle(op('2026-09-28', '-152.36', 'ENGIE', 'Autre'))).toBe('Autre')
  })
  it('deux groupes distincts', () => {
    const g = grouperParIntitule([op('2026-09-18', '-163.01'), op('2026-09-28', '-152.36')], [], (tx) => (reco.estLocal(tx) ? reco.libelle(tx) : null))
    expect(g.length).toBe(2)
  })
})

describe('dernières opérations (panneau du Résumé)', () => {
  const tx = [
    op(joint.id, '2026-09-03', -42.5, { category_id: alim.id, label: 'EPICERIE ÉTÉ 2 CB*1111' }),
    op(joint.id, '2026-10-03', 1200, { label: 'SALAIRE OCTOBRE' }),
    op(joint.id, '2026-10-04', -300, { label: 'VIR INTERNE', internal: true }),
    op(perso.id, '2026-10-05', -8, { category_id: loyer.id, label: 'ASSURANCE HABITATION', owner: 'honorine' }),
  ]
  const r = (requete: string, filtre: 'foyer' | 'commun' | 'honorine' = 'foyer') =>
    operationsRecentes({ transactions: tx, requete, idx, filtre }).map((t) => t.label)
  it('sans recherche : dépenses et entrées, récentes d’abord, sans virement interne', () => {
    expect(r('')).toEqual(['ASSURANCE HABITATION', 'SALAIRE OCTOBRE', 'EPICERIE ÉTÉ 2 CB*1111'])
  })
  it('suit le filtre Commun / Honorine', () => {
    expect(r('', 'honorine')).toEqual(['ASSURANCE HABITATION'])
    expect(r('', 'commun')).toEqual(['SALAIRE OCTOBRE', 'EPICERIE ÉTÉ 2 CB*1111'])
  })
  it('avec recherche : intitulé, montant, catégorie ; jamais un virement interne', () => {
    expect(r('salaire')).toEqual(['SALAIRE OCTOBRE'])
    expect(r('1200')).toEqual(['SALAIRE OCTOBRE'])
    expect(r('courses')).toEqual(['EPICERIE ÉTÉ 2 CB*1111'])
    expect(r('300')).toEqual([])
  })
  it('surligne les mots cherchés sans casse ni accents', () => {
    expect(segmentsSurlignes('Épicerie été', 'ete')).toEqual([{ t: 'Épicerie ', vu: false }, { t: 'été', vu: true }])
    expect(segmentsSurlignes('Carrefour City', 'CARRE')).toEqual([{ t: 'Carre', vu: true }, { t: 'four City', vu: false }])
    expect(segmentsSurlignes('Carrefour', '42')).toEqual([{ t: 'Carrefour', vu: false }])
  })
})

describe('choix de catégorie par ligne', () => {
  it('groupe les catégories visibles par ligne, sans les masquées ni les fusionnées', () => {
    const groupes = categoriesParLigne(idx)
    const ids = groupes.flatMap((g) => g.categories.map((c) => c.id))
    for (const c of categories) if (c.hidden || c.merged_into) expect(ids).not.toContain(c.id)
    for (const g of groupes) for (const c of g.categories) {
      const l = ligneDeCategorie(idx.categories.get(c.id), idx)
      expect(g.ligne ? l : null).toBe(g.ligne ? g.ligne.id : null)
    }
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('remboursements rattachés', () => {
  const remb = categorie('Remboursements', { role: 'revenu' })
  const idxR = indexer([joint, perso, pea], [...categories, remb], lines)
  const achat = op(joint.id, '2026-09-10', -100, { category_id: alim.id })
  const retour = op(joint.id, '2026-10-22', 40, { category_id: remb.id, rembourse_de: achat.id })

  it('compte le remboursement dans le mois et la catégorie de la dépense, pas dans les entrées', () => {
    const agg = agreger(appliquerRemboursements([achat, retour]), idxR, 'foyer')
    expect(agg.get('2026-09')?.lignes.get(courses.id)).toBe(60)
    expect(agg.get('2026-10')?.entrees ?? 0).toBe(0)
  })
  it('laisse tel quel un remboursement sans lien (ou dont la dépense est introuvable)', () => {
    const seul = op(joint.id, '2026-10-22', 40, { category_id: remb.id, rembourse_de: 'absent' })
    expect(appliquerRemboursements([seul])).toEqual([seul])
  })
  it("liste ce qui est REÇU dans le mois de la date bancaire, sans y mettre les dépenses", () => {
    const mutuelle = op(joint.id, '2026-10-05', 9, { category_id: alim.id })
    const r = remboursementsRecus({ mois: '2026-10', transactions: [achat, retour, mutuelle], idx: idxR, filtre: 'foyer' })
    expect(r.total).toBe(49)
    expect(r.operations.map((t) => t.id).sort()).toEqual([retour.id, mutuelle.id].sort())
    expect(remboursementsRecus({ mois: '2026-09', transactions: [achat, retour], idx: idxR, filtre: 'foyer' }).total).toBe(0)
  })
})
