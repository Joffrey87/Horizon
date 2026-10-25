// Soldes des comptes du quotidien (courants + carte Crypto.com), selon le filtre Foyer / Commun / Joffrey / Honorine.
import { correspond, type FiltreTitulaire } from './finances'
import type { FinAccount } from './types'
import { estCompteCSL, estCompteEpargneDepenses } from './regroupement'

const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Comptes courants suivis au budget (hors livret « Epargne », hors épargne / PEA / placements). */
export function estCompteCourant(a: FinAccount): boolean {
  return a.kind === 'courant' && a.in_budget && !a.archived && !norm(a.name).includes('epargne')
}

export interface Soldes { comptes: FinAccount[]; total: number; maj: string | null }

export function soldesComptes(comptes: FinAccount[], filtre: FiltreTitulaire): Soldes {
  const liste = comptes.filter((a) => estCompteCourant(a) && correspond(filtre, a.owner))
    .sort((x, y) => Number(y.balance) - Number(x.balance) || x.name.localeCompare(y.name))
  const maj = liste.map((a) => a.balance_at).filter((d): d is string => !!d).sort().at(-1) ?? null
  return { comptes: liste, total: liste.reduce((s, a) => s + Number(a.balance), 0), maj }
}

/** Une des trois parties « épargne » du panneau Comptes : son compte (null si non suivi). */
export interface PartieEpargne { cle: 'depenses' | 'vacances' | 'securite'; titre: string; detail: string; compte: FinAccount | null }

/**
 * Parties épargne : Epargne Dépenses = le CSL (compte sur livret …2884, absent de Finary : « non suivi » tant qu'il n'a pas de compte),
 * Epargne Vacances = BoursoBank …0665, Epargne Sécurité = Livret A suivi à la main. Seules celles du titulaire choisi s'affichent.
 */
export function partiesEpargne(comptes: FinAccount[], filtre: FiltreTitulaire): PartieEpargne[] {
  const actifs = comptes.filter((a) => !a.archived)
  const livret = actifs.find((a) => a.kind === 'epargne' && a.subtype === 'livret')
  const parties: PartieEpargne[] = [
    { cle: 'depenses', titre: 'Épargne Dépenses', detail: 'CSL …2884', compte: actifs.find(estCompteCSL) ?? null },
    { cle: 'vacances', titre: 'Épargne Vacances', detail: 'BoursoBank …0665', compte: actifs.find(estCompteEpargneDepenses) ?? null },
    { cle: 'securite', titre: 'Épargne Sécurité', detail: 'Livret A', compte: livret ?? null },
  ]
  // Un compte présent suit le filtre ; un compte absent (CSL) n'apparaît que pour le foyer et Joffrey.
  return parties.filter((p) => p.compte ? correspond(filtre, p.compte.owner) : filtre === 'foyer' || filtre === 'joffrey')
}
