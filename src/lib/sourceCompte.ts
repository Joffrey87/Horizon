// Icône de provenance d'une opération : banque du compte et, pour Boursorama, calque du titulaire.
import type { FinAccount, FinOwner } from './types'

export type LogoCompte = 'boursorama' | 'credit-cooperatif' | 'crypto-com' | 'airbnb'
export type CalqueCompte = 'honorine' | 'joffrey' | 'partage' | null
export interface SourceCompte { logo: LogoCompte; calque: CalqueCompte; nom: string }

const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * - Compte Airbnb : logo Airbnb, sans calque ; carte Crypto.com : logo Crypto.com, sans calque.
 * - Crédit Coopératif : calque moitié bleu / moitié rose, quel que soit le titulaire.
 * - Boursorama (et compte sans banque, comme celui d'Honorine) : calque du titulaire de l'opération.
 */
export function sourceCompte(compte: FinAccount | undefined, titulaire: FinOwner): SourceCompte {
  const nom = compte?.name ?? ''
  const inst = norm(compte?.institution)
  if (norm(nom).includes('airbnb')) return { logo: 'airbnb', calque: null, nom }
  if (inst.includes('crypto')) return { logo: 'crypto-com', calque: null, nom }
  if (inst.includes('cooperatif')) return { logo: 'credit-cooperatif', calque: 'partage', nom }
  return { logo: 'boursorama', calque: titulaire === 'honorine' ? 'honorine' : titulaire === 'commun' ? 'partage' : 'joffrey', nom }
}
