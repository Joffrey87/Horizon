// ================================================================
// Tests du suivi de consommation IA (aiUsage.ts) et des messages d'erreur
// des fonctions (functionError.ts). Purs : aucun réseau.
// ================================================================
import { describe, it, expect } from 'vitest'
import type { AiUsage } from './types'
import { bilanUsage, coutUsd, fmtUsd } from './aiUsage'
import { traduireErreurIA } from './functionError'

let seq = 0
function ligne(over: Partial<AiUsage> = {}): AiUsage {
  return {
    id: `a${++seq}`, user_id: 'u', fn: 'gospel', detail: null, model: 'claude-sonnet-4-5',
    input_tokens: 0, output_tokens: 0, web_searches: 0,
    created_at: '2026-10-04T10:00:00Z', ...over,
  }
}

describe('coutUsd', () => {
  it('applique 3 $ / 15 $ par million de tokens', () => {
    // 2 000 entrée + 800 sortie = 0,006 + 0,012
    expect(coutUsd(ligne({ input_tokens: 2000, output_tokens: 800 }))).toBeCloseTo(0.018, 6)
  })
  it('ajoute 0,01 $ par recherche web', () => {
    expect(coutUsd(ligne({ web_searches: 3 }))).toBeCloseTo(0.03, 6)
  })
  it('retombe sur le tarif Sonnet pour un modèle inconnu (jamais 0)', () => {
    expect(coutUsd(ligne({ model: 'autre', input_tokens: 1_000_000 }))).toBeCloseTo(3, 6)
  })
})

describe('bilanUsage', () => {
  it('est vide sans ligne', () => {
    const b = bilanUsage([], '2026-10-04')
    expect(b.total.appels).toBe(0)
    expect(b.depuis).toBeNull()
    expect(b.moyenneJourUsd).toBe(0)
  })

  it('agrège par fonction et par jour, du plus récent au plus ancien', () => {
    const b = bilanUsage([
      ligne({ fn: 'gospel', input_tokens: 1_000_000, created_at: '2026-10-02T09:00:00Z' }),
      ligne({ fn: 'news', output_tokens: 1_000_000, created_at: '2026-10-04T09:00:00Z' }),
      ligne({ fn: 'news', web_searches: 2, created_at: '2026-10-04T15:00:00Z' }),
    ], '2026-10-04')
    expect(b.total.appels).toBe(3)
    expect(b.total.usd).toBeCloseTo(3 + 15 + 0.02, 6)
    expect(b.parFonction.gospel?.usd).toBeCloseTo(3, 6)
    expect(b.parFonction.news?.appels).toBe(2)
    expect(b.parJour.map((j) => j.jour)).toEqual(['2026-10-04', '2026-10-02'])
    expect(b.depuis).toBe('2026-10-02')
  })

  it('moyenne sur les jours calendaires depuis le 1er appel, jours creux inclus', () => {
    // 2 → 4 octobre = 3 jours
    const b = bilanUsage([
      ligne({ input_tokens: 1_000_000, created_at: '2026-10-02T09:00:00Z' }),
      ligne({ input_tokens: 2_000_000, created_at: '2026-10-04T09:00:00Z' }),
    ], '2026-10-04')
    expect(b.moyenneJourUsd).toBeCloseTo(9 / 3, 6)
  })
})

describe('fmtUsd', () => {
  it('trois décimales sous 1 $, deux au-delà, virgule française', () => {
    expect(fmtUsd(0.0184)).toBe('0,018 $')
    expect(fmtUsd(12.345)).toBe('12,35 $')
  })
})

describe('traduireErreurIA', () => {
  it('reconnaît un crédit épuisé', () => {
    const brut = 'Anthropic 400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'
    expect(traduireErreurIA(brut)).toMatch(/Crédit API Anthropic épuisé/)
  })
  it('reconnaît une clé absente ou invalide', () => {
    expect(traduireErreurIA('ANTHROPIC_API_KEY manquante')).toMatch(/Clé API Anthropic/)
    expect(traduireErreurIA('Anthropic 401 {"error":{"type":"authentication_error"}}')).toMatch(/Clé API Anthropic/)
  })
  it('reconnaît limite de débit et surcharge', () => {
    expect(traduireErreurIA('Anthropic 429 rate_limit_error')).toMatch(/Limite de débit/)
    expect(traduireErreurIA('Anthropic 529 overloaded_error')).toMatch(/surchargée/)
  })
  it('rend un message inconnu tel quel', () => {
    expect(traduireErreurIA('quiz illisible')).toBe('quiz illisible')
  })
})
