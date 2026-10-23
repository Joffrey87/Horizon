// « RESTE » : ce qu'il reste sur les comptes courants une fois payées les dépenses
// attendues d'ici la fin du mois.
//   RESTE = solde actuel (comptes courants Boursorama + carte Crypto.com, sans crypto ni placements)
//         − dépenses récurrentes détectées dans l'historique et pas encore passées ce mois-ci
//         − dépenses prévues à la main (fin_planned) échues d'ici la fin du mois.
// Les opérations en attente sont déjà retirées du solde temps réel : elles ne sont jamais
// soustraites une seconde fois (et comptent comme « déjà passées » pour les récurrentes).
import type { FinAccount, FinPlanned, FinResteAjustement, FinTransaction } from './types'
import { classer, cleGroupe, decaleMois, moisDe, nomLisible, normaliserLibelle, type IndexFinances } from './finances'

/** Un compte entre dans le RESTE : compte courant Boursorama ou carte Crypto.com. */
export const estCompteReste = (a: FinAccount) =>
  a.kind === 'courant' && !a.archived && a.in_budget
  && (/bours/i.test(a.institution ?? '') || (a.source === 'crypto' && a.subtype === 'carte'))

export interface Recurrente {
  cle: string
  nom: string
  montant: number            // retenu (ajusté si besoin), positif
  montantDetecte: number     // médiane des mois précédents
  ajuste: boolean
  ignore: boolean
  date: string               // jour attendu ce mois-ci, 'yyyy-MM-dd'
  mois: number               // nombre de mois d'historique qui la confirment
}

export interface ResteCalcul {
  comptes: { id: string; nom: string; solde: number }[]
  solde: number
  enAttente: number                     // sorties en attente (déjà dans le solde), positif
  recurrentes: Recurrente[]             // toutes, y compris celles que l'on a exclues
  ratees: Recurrente[]                  // attendues il y a plus de 5 jours et jamais vues : non comptées
  planifiees: FinPlanned[]              // à la main, non réglées, échues d'ici la fin du mois
  totalRecurrentes: number
  totalPlanifiees: number
  aVenir: number
  reste: number
  finMois: string
}

/**
 * Clé de regroupement d'une dépense récurrente : l'enseigne connue, sinon le nom lisible de
 * l'intitulé. Contrairement à `cleGroupe`, elle ne dépend pas de la référence de mandat
 * (RUM) : Finary la fournit, pas la banque en direct, et le même prélèvement doit se
 * reconnaître d'une source à l'autre.
 */
export function cleRecurrente(label: string): string {
  const g = cleGroupe(label)
  return g.cle.startsWith('enseigne:') ? g.cle : `nom:${normaliserLibelle(nomLisible(label))}`
}

const mediane = (v: number[]) => {
  const t = [...v].sort((a, b) => a - b)
  const m = Math.floor(t.length / 2)
  return t.length % 2 ? t[m]! : (t[m - 1]! + t[m]!) / 2
}
const r2 = (n: number) => Math.round(n * 100) / 100
const dernierJour = (mois: string) => {
  const [a, m] = mois.split('-').map(Number)
  return new Date(Date.UTC(a!, m!, 0)).getUTCDate()
}
/** Jours de retard au-delà desquels une récurrente jamais vue est considérée comme ratée. */
const TOLERANCE_JOURS = 5

/**
 * Détecte les dépenses mensuelles : même intitulé (cleGroupe), UNE opération par mois,
 * montant à peu près constant (±20 %, au moins 2 €), jour du mois régulier (±7 j).
 * Il faut le mois dernier et au moins 3 mois sur les 4 derniers ; ou 2 mois consécutifs
 * quasi identiques (montant à 0,50 € près, jour à 3 j près) pour un abonnement récent.
 */
export function detecterRecurrentes(opts: {
  transactions: FinTransaction[]; idx: IndexFinances; comptes: Set<string>; aujourdhui: string
  ajustements?: FinResteAjustement[]
}): { actives: Recurrente[]; ratees: Recurrente[] } {
  const mois = moisDe(opts.aujourdhui)
  const jour = Number(opts.aujourdhui.slice(8, 10))
  const precedents = [1, 2, 3, 4].map((n) => decaleMois(mois, -n))
  // Opérations par intitulé puis par mois (jours triés) : un même fournisseur peut prélever
  // plusieurs fois par mois (deux contrats d'énergie, deux forfaits) ; chaque rang du mois
  // est alors suivi séparément, à condition que le nombre de prélèvements reste le même.
  type Groupe = { nom: string; parMois: Map<string, { montant: number; jour: number }[]>; ceMois: number[] }
  const groupes = new Map<string, Groupe>()
  for (const tx of [...opts.transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!opts.comptes.has(tx.account_id) || Number(tx.amount) >= 0) continue
    const m = moisDe(tx.date)
    if (m !== mois && !precedents.includes(m)) continue
    const c = classer(tx, opts.idx)
    if (c.type === 'ignoree' || c.type === 'revenu') continue
    const cle = cleRecurrente(tx.label)
    const g: Groupe = groupes.get(cle) ?? { nom: nomLisible(tx.label), parMois: new Map(), ceMois: [] }
    if (tx.label_local) g.nom = tx.label_local
    const j = Number(tx.date.slice(8, 10))
    if (m === mois) g.ceMois.push(j)
    else g.parMois.set(m, [...(g.parMois.get(m) ?? []), { montant: -Number(tx.amount), jour: j }])
    groupes.set(cle, g)
  }
  const adj = new Map((opts.ajustements ?? []).map((a) => [a.cle, a]))
  const actives: Recurrente[] = []
  const ratees: Recurrente[] = []
  for (const [cleBase, g] of groupes) {
    if (!g.parMois.has(precedents[0]!)) continue
    const presents = precedents.filter((m) => g.parMois.has(m))
    const n = g.parMois.get(precedents[0]!)!.length
    if (n > 3 || presents.some((m) => g.parMois.get(m)!.length !== n)) continue
    for (let rang = 0; rang < n; rang++) {
      const lignes = presents.map((m) => g.parMois.get(m)![rang]!)
      const med = mediane(lignes.map((l) => l.montant))
      const jourMed = Math.round(mediane(lignes.map((l) => l.jour)))
      const tolMontant = Math.max(2, med * 0.2)
      const serre = lignes.length === 2 && g.parMois.has(precedents[1]!)
      const ok = lignes.length >= 3
        ? lignes.every((l) => Math.abs(l.montant - med) <= tolMontant && Math.abs(l.jour - jourMed) <= 7)
        : serre && lignes.every((l) => Math.abs(l.montant - med) <= 0.5 && Math.abs(l.jour - jourMed) <= 3)
      if (!ok || med < 3) continue
      // Déjà passée ce mois-ci ? Seule, n'importe quelle opération du mois ; à plusieurs
      // par mois, une opération à ± 7 jours du jour habituel de ce rang.
      const passee = n === 1 ? g.ceMois.length > 0 : g.ceMois.some((j) => Math.abs(j - jourMed) <= 7)
      if (passee) continue
      const cle = n === 1 ? cleBase : `${cleBase}#${rang + 1}`
      const a = adj.get(cle)
      const attendu = Math.min(jourMed, dernierJour(mois))
      const r: Recurrente = {
        cle, nom: n === 1 ? g.nom : `${g.nom} (${rang + 1}/${n})`, montantDetecte: r2(med),
        montant: a?.montant != null ? Number(a.montant) : r2(med),
        ajuste: a?.montant != null, ignore: !!a?.ignore, mois: lignes.length,
        date: `${mois}-${String(attendu).padStart(2, '0')}`,
      }
      if (attendu < jour - TOLERANCE_JOURS) ratees.push(r)
      else actives.push(r)
    }
  }
  const tri = (a: Recurrente, b: Recurrente) => a.date.localeCompare(b.date) || b.montant - a.montant
  return { actives: actives.sort(tri), ratees: ratees.sort(tri) }
}

export function calculerReste(opts: {
  accounts: FinAccount[]; transactions: FinTransaction[]; idx: IndexFinances
  planned: FinPlanned[]; ajustements: FinResteAjustement[]; aujourdhui: string
}): ResteCalcul {
  const mois = moisDe(opts.aujourdhui)
  const finMois = `${mois}-${String(dernierJour(mois)).padStart(2, '0')}`
  const concernes = opts.accounts.filter(estCompteReste)
  const ids = new Set(concernes.map((a) => a.id))
  const comptes = concernes.map((a) => ({ id: a.id, nom: a.name, solde: Number(a.balance) }))
  const solde = comptes.reduce((s, c) => s + c.solde, 0)
  const enAttente = opts.transactions
    .filter((t) => t.pending && ids.has(t.account_id) && Number(t.amount) < 0)
    .reduce((s, t) => s - Number(t.amount), 0)
  const { actives, ratees } = detecterRecurrentes({
    transactions: opts.transactions, idx: opts.idx, comptes: ids, aujourdhui: opts.aujourdhui, ajustements: opts.ajustements,
  })
  const planifiees = opts.planned
    .filter((p) => !p.done && Number(p.amount) > 0 && p.due_date <= finMois)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  const totalRecurrentes = actives.filter((r) => !r.ignore).reduce((s, r) => s + r.montant, 0)
  const totalPlanifiees = planifiees.reduce((s, p) => s + Number(p.amount), 0)
  const aVenir = totalRecurrentes + totalPlanifiees
  return {
    comptes, solde, enAttente, recurrentes: actives, ratees, planifiees,
    totalRecurrentes, totalPlanifiees, aVenir, reste: solde - aVenir, finMois,
  }
}
