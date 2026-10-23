// Écriture réelle d'un budget « pour ce mois seulement » : le vrai store, un Supabase simulé qui applique la contrainte
// unique (line_id, kind, month) comme la base. Vérifie les appels (upsert avec onConflict, delete filtré) et l'affichage rafraîchi.
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Rang = { id: string; user_id: string; line_id: string; kind: string; month: string; amount: number }
const base: { lignes: Rang[]; appels: string[] } = { lignes: [], appels: [] }

vi.mock('./supabase', () => {
  const from = (table: string) => ({
    upsert: (v: Omit<Rang, 'id'>, opts: { onConflict: string }) => {
      base.appels.push(`upsert ${table} ${v.month} ${v.amount} [${opts.onConflict}]`)
      const i = base.lignes.findIndex((r) => r.line_id === v.line_id && r.kind === v.kind && r.month === v.month)
      const rang = { id: i >= 0 ? base.lignes[i]!.id : `n${base.lignes.length}`, ...v }
      if (i >= 0) base.lignes[i] = rang; else base.lignes.push(rang)
      return { select: () => ({ single: async () => ({ data: rang, error: null }) }) }
    },
    delete: () => {
      const f: Record<string, string> = {}
      const q = { eq: (k: string, v: string) => { f[k] = v; return q }, then: (ok: (r: { error: null }) => void) => {
        base.appels.push(`delete ${table} ${f.month}`)
        base.lignes = base.lignes.filter((r) => !(r.line_id === f.line_id && r.kind === f.kind && r.month === f.month))
        ok({ error: null })
      } }
      return q
    },
  })
  return { supabase: { from } }
})

import { useHorizon } from './store'
import { budgetDe } from './finances'

const L = 'ligne-courses'
const valeurs = () => ['2026-09', '2026-10', '2026-11'].map((m) => budgetDe(L, m, useHorizon.getState().finBudgets))

beforeEach(() => {
  base.appels = []
  base.lignes = [{ id: 'b0', user_id: 'u1', line_id: L, kind: 'budget', month: '2026-01-01', amount: 700 }]
  useHorizon.setState({ session: { user: { id: 'u1' } } as never, finBudgets: base.lignes.map((r) => ({ ...r, created_at: '' })) as never })
})

describe('setFinBudgetMois sur le vrai store', () => {
  it('écrit le mois suivant figé puis le mois choisi, et l’affichage suit', async () => {
    await useHorizon.getState().setFinBudgetMois(L, '2026-10', 900)
    expect(base.appels).toEqual([
      'upsert fin_budgets 2026-11-01 700 [line_id,kind,month]',
      'upsert fin_budgets 2026-10-01 900 [line_id,kind,month]',
    ])
    expect(valeurs()).toEqual([700, 900, 700])
    expect(useHorizon.getState().error).toBeFalsy()
  })
  it('un second changement du même mois remplace (upsert) sans doublon', async () => {
    await useHorizon.getState().setFinBudgetMois(L, '2026-10', 900)
    await useHorizon.getState().setFinBudgetMois(L, '2026-10', 950)
    expect(base.lignes.filter((r) => r.month === '2026-10-01')).toHaveLength(1)
    expect(valeurs()).toEqual([700, 950, 700])
  })
  it('vider rétablit le budget habituel', async () => {
    await useHorizon.getState().setFinBudgetMois(L, '2026-10', 900)
    await useHorizon.getState().setFinBudgetMois(L, '2026-10', null)
    expect(valeurs()).toEqual([700, 700, 700])
  })
})
