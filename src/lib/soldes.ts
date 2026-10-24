// Soldes des comptes du quotidien (courants + carte Crypto.com), selon le filtre Foyer / Commun / Joffrey / Honorine.
import { correspond, type FiltreTitulaire } from './finances'
import type { FinAccount } from './types'

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
