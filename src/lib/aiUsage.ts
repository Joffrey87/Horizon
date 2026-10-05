// ================================================================
// Consommation de l'API Anthropic : coût estimé et agrégats.
// Règles pures, sans réseau (les lignes viennent de la table `ai_usage`).
// ================================================================

import { format } from 'date-fns'
import type { AiUsage } from './types'

/** Tarifs en USD par million de tokens (entrée / sortie).
 *  ⚠️ À vérifier sur la page de tarification d'Anthropic : une estimation, pas une facture. */
const PRIX: Record<string, { in: number; out: number }> = {
  'claude-sonnet-4-5': { in: 3, out: 15 },
}
/** Modèle inconnu : on retombe sur le tarif Sonnet plutôt que d'afficher 0. */
const PRIX_DEFAUT = { in: 3, out: 15 }
/** Recherche web : 10 USD les 1 000 recherches. */
export const RECHERCHE_WEB_USD = 0.01

type Ligne = Pick<AiUsage, 'model' | 'input_tokens' | 'output_tokens' | 'web_searches'>

/** Coût estimé d'un appel, en USD. */
export function coutUsd(r: Ligne): number {
  const p = PRIX[r.model] ?? PRIX_DEFAUT
  return (r.input_tokens * p.in + r.output_tokens * p.out) / 1e6 + r.web_searches * RECHERCHE_WEB_USD
}

export interface Cumul { appels: number; tokens: number; usd: number }

const vide = (): Cumul => ({ appels: 0, tokens: 0, usd: 0 })
function ajouter(c: Cumul, r: AiUsage): void {
  c.appels += 1
  c.tokens += r.input_tokens + r.output_tokens
  c.usd += coutUsd(r)
}

export interface BilanUsage {
  total: Cumul
  /** Par fonction (gospel, news, assistant). */
  parFonction: Record<string, Cumul>
  /** Par jour (date locale), du plus récent au plus ancien. */
  parJour: { jour: string; cumul: Cumul }[]
  /** Premier jour consigné, ou null s'il n'y a rien. */
  depuis: string | null
  /** Moyenne par jour calendaire, du premier appel à aujourd'hui (jours sans appel inclus). */
  moyenneJourUsd: number
}

/** Jour local (yyyy-MM-dd) d'un horodatage ISO. */
const jourLocal = (iso: string) => format(new Date(iso), 'yyyy-MM-dd')

/** Agrège les lignes. `aujourdhui` (yyyy-MM-dd) borne la moyenne quotidienne. */
export function bilanUsage(lignes: AiUsage[], aujourdhui: string): BilanUsage {
  const total = vide()
  const parFonction: Record<string, Cumul> = {}
  const jours = new Map<string, Cumul>()
  for (const r of lignes) {
    ajouter(total, r)
    ajouter(parFonction[r.fn] ??= vide(), r)
    const jour = jourLocal(r.created_at)
    let cumulJour = jours.get(jour)
    if (!cumulJour) { cumulJour = vide(); jours.set(jour, cumulJour) }
    ajouter(cumulJour, r)
  }
  const parJour = [...jours.entries()]
    .map(([jour, cumul]) => ({ jour, cumul }))
    .sort((a, b) => (a.jour < b.jour ? 1 : -1))
  const depuis = parJour.length ? (parJour[parJour.length - 1]?.jour ?? null) : null
  let moyenneJourUsd = 0
  if (depuis) {
    const ecart = (Date.parse(`${aujourdhui}T12:00:00Z`) - Date.parse(`${depuis}T12:00:00Z`)) / 86400e3
    moyenneJourUsd = total.usd / Math.max(1, Math.round(ecart) + 1)
  }
  return { total, parFonction, parJour, depuis, moyenneJourUsd }
}

/** « 0,034 $ » — trois décimales sous 1 $, deux au-delà (les centimes comptent peu, les dixièmes de cent si). */
export function fmtUsd(v: number): string {
  return `${v.toFixed(v < 1 ? 3 : 2).replace('.', ',')} $`
}
