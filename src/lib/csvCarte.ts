// ================================================================
// Import / vérification d'un relevé CSV de carte (export Crypto.com : « Timestamp (UTC),
// Transaction Description, Currency, Amount, … »). Règles pures, sans réseau.
//
// Le relevé fait foi pour les montants : l'app mobile et les notifications peuvent
// n'avoir que l'autorisation (ex. 120 € à la pompe pour 30 € réellement débités).
// ================================================================
import type { FinTransaction } from './types'

export interface LigneCsv {
  /** Horodatage UTC du relevé, « AAAA-MM-JJ HH:MM:SS ». */
  ts: string
  /** Jour en heure de Paris (le relevé est en UTC : 23 h 11 UTC = minuit passé à Paris). */
  date: string
  label: string
  amount: number
  /** Dépôt d'argent depuis un autre compte à soi : virement interne, hors budget. */
  depot: boolean
  /** Identifiant stable : relancer le même fichier ne crée jamais de doublon. */
  externalId: string
}

/** Découpe une ligne CSV (guillemets et virgules échappées pris en charge). */
function champs(ligne: string): string[] {
  const out: string[] = []
  let cur = ''
  let entre = false
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i]!
    if (entre) {
      if (c === '"' && ligne[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') entre = false
      else cur += c
    } else if (c === '"') entre = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

const parisFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })

/** Jour (heure de Paris) d'un horodatage UTC « AAAA-MM-JJ HH:MM:SS ». */
export function jourParis(tsUtc: string): string {
  return parisFmt.format(new Date(tsUtc.replace(' ', 'T') + 'Z'))
}

/** Lit le CSV. Ne garde que les lignes en euros avec un montant valide ; renvoie aussi le nombre de lignes ignorées. */
export function lireCsvCarte(texte: string): { lignes: LigneCsv[]; ignorees: number } {
  const brut = texte.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  const entete = champs(brut[0] ?? '').map((h) => h.trim().toLowerCase())
  const iTs = entete.findIndex((h) => h.startsWith('timestamp'))
  const iLib = entete.findIndex((h) => h === 'transaction description')
  const iMont = entete.findIndex((h) => h === 'native amount')
  const iDev = entete.findIndex((h) => h === 'native currency')
  if (iTs < 0 || iLib < 0 || iMont < 0) throw new Error('Ce fichier ne ressemble pas à un export de carte Crypto.com (colonnes Timestamp, Transaction Description, Native Amount).')
  const lignes: LigneCsv[] = []
  let ignorees = 0
  for (const l of brut.slice(1)) {
    const c = champs(l)
    const ts = (c[iTs] ?? '').trim()
    const amount = Number((c[iMont] ?? '').trim())
    const devise = iDev >= 0 ? (c[iDev] ?? '').trim() : 'EUR'
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ts) || !Number.isFinite(amount) || (c[iMont] ?? '').trim() === '' || devise !== 'EUR') { ignorees++; continue }
    const label = (c[iLib] ?? '').trim()
    lignes.push({
      ts, date: jourParis(ts), label, amount: Math.round(amount * 100) / 100,
      depot: amount > 0 && /deposit/i.test(label),
      externalId: `csv-${ts.replace(' ', 'T').replace(/:/g, '')}-${amount}`,
    })
  }
  return { lignes, ignorees }
}

const centimes = (n: number) => Math.round(n * 100)
const motCle = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/)[0] ?? ''
const ecartJours = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000

export interface Correction { ligne: LigneCsv; existante: FinTransaction }
export interface Verification {
  /** Déjà en base, même jour et même montant. */
  identiques: number
  /** Même enseigne à ±3 jours mais autre montant : le relevé fait foi. */
  ecarts: Correction[]
  /** Absentes de la base. */
  manquantes: LigneCsv[]
  /** En base, dans la période du relevé, mais absentes du relevé (information seulement). */
  enBaseSeulement: FinTransaction[]
}

/** Rapproche le relevé et les opérations du compte (sans rien modifier). */
export function verifierCsvCarte(lignes: LigneCsv[], existantes: FinTransaction[]): Verification {
  const libres = new Set(existantes.map((t) => t.id))
  const parId = new Map(existantes.map((t) => [t.id, t]))
  const dejaImportees = new Set(existantes.map((t) => t.external_id).filter(Boolean))
  const retirer = (t: FinTransaction) => libres.delete(t.id)

  let identiques = 0
  const restantes: LigneCsv[] = []
  for (const l of lignes) {
    if (dejaImportees.has(l.externalId)) { identiques++; continue }
    const t = existantes.find((e) => libres.has(e.id) && e.date === l.date && centimes(Number(e.amount)) === centimes(l.amount))
    if (t) { retirer(t); identiques++ } else restantes.push(l)
  }

  const ecarts: Correction[] = []
  const manquantes: LigneCsv[] = []
  for (const l of restantes) {
    const t = l.amount < 0 && !l.depot
      ? existantes.find((e) => libres.has(e.id) && Number(e.amount) < 0 && ecartJours(e.date, l.date) <= 3 && motCle(e.label) !== '' && motCle(e.label) === motCle(l.label))
      : undefined
    if (t) { retirer(t); ecarts.push({ ligne: l, existante: parId.get(t.id)! }) } else manquantes.push(l)
  }

  const jours = lignes.map((l) => l.date).sort()
  const [debut, fin] = [jours[0], jours[jours.length - 1]]
  const enBaseSeulement = debut && fin
    ? existantes.filter((e) => libres.has(e.id) && e.date >= debut && e.date <= fin)
    : []
  return { identiques, ecarts, manquantes, enBaseSeulement }
}

/** Valeurs à insérer pour une ligne manquante (les dépôts sont des virements internes, hors budget). */
export function operationDepuisLigne(l: LigneCsv, accountId: string, source: string): Record<string, unknown> {
  return {
    account_id: accountId, source, external_id: l.externalId, date: l.date, amount: l.amount, label: l.label,
    internal: l.depot, excluded: l.depot,
    note: l.depot ? 'dépôt (relevé CSV) — à rapprocher du virement sortant de l’autre compte' : null,
  }
}
