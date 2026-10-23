// Données FICTIVES pour tester / photographier le Résumé Finances en mode démo
// (ouvrir /seed-resume.html après `npm run dev`). Aucune donnée réelle, aucun réseau.
import './route-finances'
import './demo-main'
import { useHorizon } from '../lib/store'
import { todayIso } from '../lib/logic'

const U = 'demo-user'
const mois = todayIso().slice(0, 7)
const jour = (n: number) => `${mois}-${String(n).padStart(2, '0')}`
const ac = (id: string, name: string, balance: number, over: Record<string, unknown> = {}) => ({
  id, user_id: U, name, institution: 'BoursoBank', kind: 'courant', subtype: null, owner: 'joffrey', in_budget: true, balance,
  balance_source: null, balance_manual_at: null, acquired_on: null, balance_at: null, archived: false, sort_order: 0, source: 'test', external_id: null, created_at: '2026-01-01', ...over,
})
const ligne = (id: string, name: string, order: number, kind = 'depense') => ({ id, user_id: U, name, kind, color: null, sort_order: order, created_at: '2026-01-01' })
const cat = (id: string, name: string, line_id: string | null) => ({
  id, user_id: U, name, parent_id: null, line_id, role: 'depense', hidden: false, merged_into: null, manual: false, source: 'test', external_id: null, created_at: '2026-01-01',
})
const bud = (line_id: string, amount: number) => ({ id: `b-${line_id}`, user_id: U, line_id, kind: 'budget', month: `${mois}-01`, amount, created_at: '2026-01-01' })
let n = 0
const tx = (account_id: string, category_id: string, amount: number, day: number, label: string, over: Record<string, unknown> = {}) => ({
  id: `t${n++}`, user_id: U, account_id, date: jour(day), amount, label, label_local: null, category_id, category_manual: false, owner: null,
  internal: false, excluded: false, note: null, source: 'test', external_id: null, created_at: '2026-01-01', ...over,
})
const noms: [string, string, number, number, number][] = [
  // id, nom, budget, dépensé, jour
  ['courses', 'Courses', 400, 373, 3], ['amenagement', 'Aménagement', 200, 0, 4], ['vacances', 'Vacances', 350, 383, 5],
  ['dons', 'Dons', 300, 30, 6], ['courantes', 'Dépenses courantes', 600, 392, 7], ['exceptionnelles', 'Dépenses exceptionnelles', 300, 0, 8],
]
useHorizon.setState({
  finAccounts: [
    ac('a1', 'Compte Joffrey', 420), ac('a2', 'Compte Joint', 300, { owner: 'commun' }),
    ac('a3', 'Carte Crypto', 144, { institution: 'Crypto.com', source: 'crypto', subtype: 'carte', external_id: 'card-visa' }),
    ac('e1', 'Épargne', 8000, { kind: 'epargne', in_budget: false }),
  ],
  finLines: [ligne('fixe', 'Frais fixe', 0), ...noms.map(([id, nom], i) => ligne(id, nom, i + 1)), ligne('epargne', 'Épargne', 9, 'epargne')],
  finCategories: [cat('c-fixe', 'Frais fixe', 'fixe'), ...noms.map(([id, nom]) => cat(`c-${id}`, nom, id)), cat('c-epargne', 'Épargne', 'epargne')],
  finBudgets: [bud('fixe', 900), ...noms.map(([id, , b]) => bud(id, b)), bud('epargne', 600)],
  finTransactions: [
    ...noms.filter(([, , , d]) => d > 0).map(([id, nom, , d, j]) => tx('a2', `c-${id}`, -d, j, `${nom} test`)),
    tx('a1', 'c-epargne', -300, 9, 'Virement épargne', { internal: true }),
  ],
  finEcheances: [{ id: 'ech1', user_id: U, account_id: 'e1', date: jour(15), capital: 1568, interets: 400, assurance: 30, created_at: '2026-01-01' }],
  finPlanned: [
    { id: 'p1', user_id: U, title: 'Dentiste', amount: 100, due_date: jour(27), line_id: null, saved: 0, done: false, note: null, created_at: '2026-01-01' },
    { id: 'p2', user_id: U, title: 'Cadeau', amount: 52, due_date: jour(30), line_id: null, saved: 0, done: false, note: null, created_at: '2026-01-01' },
  ],
  finLoaded: true,
} as never)
