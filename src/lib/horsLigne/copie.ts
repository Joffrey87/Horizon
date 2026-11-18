// ================================================================
// Hors ligne — copies gardées sur l'appareil (IndexedDB), par compte.
//  - `<uid>:copie`      : la dernière copie des données (tout sauf les Finances), en clair ;
//  - `<uid>:fin-cles`   : les clés de la copie des Finances (privée chiffrée par le mot de passe) ;
//  - `<uid>:fin-copie`  : la dernière copie des Finances, chiffrée (voir chiffrement.ts) ;
//  - `<uid>:entrainement` : l'historique des séances.
// La déconnexion efface tout ce qui concerne le compte.
// ================================================================

import type { Session } from '@supabase/supabase-js'
import { ecrireLocal, effacerLocal, effacerPrefixe, lireLocal } from './base'
import { chiffrer, creerCles, dechiffrer, type ClesFinances, type CopieChiffree } from './chiffrement'

/** Session Supabase gardée sur l'appareil, lue sans réseau. Hors ligne, Supabase
 *  ne la rend pas (il veut d'abord rafraîchir le jeton) mais la conserve. */
export function sessionStockee(): Session | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const cle = localStorage.key(i)
      if (!cle || !/^sb-.+-auth-token$/.test(cle)) continue
      const s = JSON.parse(localStorage.getItem(cle) ?? 'null') as Session | null
      if (s?.access_token && s.refresh_token && s.user?.id) return s
    }
  } catch { /* stockage indisponible */ }
  return null
}

export interface CopieDonnees {
  at: string
  donnees: Record<string, unknown>
}

export const lireCopie = (uid: string) => lireLocal<CopieDonnees>(`${uid}:copie`)
export const ecrireCopie = (uid: string, donnees: Record<string, unknown>) =>
  ecrireLocal(`${uid}:copie`, { at: new Date().toISOString(), donnees } satisfies CopieDonnees)

// ---- Finances ----

export const clesFinances = (uid: string) => lireLocal<ClesFinances>(`${uid}:fin-cles`)
export const copieFinances = (uid: string) => lireLocal<CopieChiffree>(`${uid}:fin-copie`)

/** Active la copie chiffrée sur cet appareil (le mot de passe a déjà été vérifié). */
export async function activerCopieFinances(uid: string, motDePasse: string): Promise<boolean> {
  const cles = await creerCles(motDePasse)
  await effacerLocal(`${uid}:fin-copie`)
  return ecrireLocal(`${uid}:fin-cles`, cles)
}

export async function desactiverCopieFinances(uid: string): Promise<void> {
  await effacerLocal(`${uid}:fin-copie`)
  await effacerLocal(`${uid}:fin-cles`)
}

/** Rafraîchit la copie chiffrée — sans mot de passe. Sans effet si la copie n'est pas activée. */
export async function enregistrerCopieFinances(uid: string, donnees: Record<string, unknown>): Promise<boolean> {
  const cles = await clesFinances(uid)
  if (!cles) return false
  return ecrireLocal(`${uid}:fin-copie`, await chiffrer(donnees, cles))
}

/** Ouvre la copie avec le mot de passe (lève MotDePasseIncorrect s'il ne convient pas). */
export async function ouvrirCopieFinances(uid: string, motDePasse: string): Promise<{ at: string; donnees: Record<string, unknown> } | null> {
  const [cles, copie] = await Promise.all([clesFinances(uid), copieFinances(uid)])
  if (!cles || !copie) return null
  return { at: copie.at, donnees: await dechiffrer<Record<string, unknown>>(copie, cles, motDePasse) }
}

// ---- Entraînement ----

export const lireSeances = <T>(uid: string) => lireLocal<T[]>(`${uid}:entrainement`)
export const ecrireSeances = (uid: string, lignes: unknown[]) => ecrireLocal(`${uid}:entrainement`, lignes)

/** Déconnexion : plus rien du compte ne reste sur l'appareil. */
export const oublierAppareil = (uid: string) => effacerPrefixe(`${uid}:`)
