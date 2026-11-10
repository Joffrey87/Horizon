import { describe, it, expect } from 'vitest'
import type { FinTransaction } from './types'
import { jourParis, lireCsvCarte, operationDepuisLigne, verifierCsvCarte } from './csvCarte'

const EN_TETE = 'Timestamp (UTC),Transaction Description,Currency,Amount,To Currency,To Amount,Native Currency,Native Amount,Native Amount (in USD),Transaction Kind,Transaction Hash'
const csv = (...l: string[]) => [EN_TETE, ...l].join('\n')
const ligne = (ts: string, lib: string, m: number) => `${ts},${lib},EUR,${m},,,EUR,${m},${m},,`
let n = 0
const op = (date: string, amount: number, label: string, over: Partial<FinTransaction> = {}): FinTransaction => ({
  id: `t${++n}`, user_id: 'u', account_id: 'a', date, amount, label, label_local: null, category_id: null, category_manual: false,
  owner: null, internal: false, excluded: false, note: null, source: 'crypto', external_id: `notif-${n}`, created_at: '', ...over,
})

describe('relevé CSV de carte', () => {
  it('passe en heure de Paris (23 h 11 UTC en novembre = lendemain)', () => {
    expect(jourParis('2026-11-07 23:11:47')).toBe('2026-11-08')
    expect(jourParis('2026-11-07 16:13:35')).toBe('2026-11-07')
  })

  it('refuse un fichier sans les colonnes attendues', () => {
    expect(() => lireCsvCarte('a,b\n1,2')).toThrow()
  })

  it('rapproche : identique, écart de montant (autorisation), manquante, dépôt interne', () => {
    const { lignes } = lireCsvCarte(csv(
      ligne('2026-11-09 18:11:14', 'Carrefour City 2472581', -5.65),
      ligne('2026-11-07 23:11:47', 'Certas Essof255 4310222', -80.02),
      ligne('2026-11-03 09:05:05', 'Sum Up *Sexo Carole Co', -80),
      ligne('2026-11-06 14:06:19', 'EUR Deposit', 200),
    ))
    const v = verifierCsvCarte(lignes, [
      op('2026-11-09', -5.65, 'CARREFOUR CITY REIMS FRA'),
      op('2026-11-08', -120, 'CERTAS ESSOF255 REIMS FRA'),
      op('2026-11-10', -2.25, 'LA BOITE A PAIN'),
    ])
    expect(v.identiques).toBe(1)
    expect(v.ecarts).toHaveLength(1)
    expect(v.ecarts[0]!.ligne.amount).toBe(-80.02)
    expect(v.manquantes.map((l) => l.label)).toEqual(['Sum Up *Sexo Carole Co', 'EUR Deposit'])
    expect(v.manquantes[1]!.depot).toBe(true)
    expect(v.enBaseSeulement).toHaveLength(0) // le 10/11 est après la fin du relevé
    const dep = operationDepuisLigne(v.manquantes[1]!, 'a', 'crypto')
    expect(dep).toMatchObject({ internal: true, excluded: true, amount: 200 })
  })

  it('est idempotent : une ligne déjà importée n’est pas re-proposée', () => {
    const { lignes } = lireCsvCarte(csv(ligne('2026-11-02 08:33:32', 'Lav Reims', -4.5)))
    const v = verifierCsvCarte(lignes, [op('2026-11-02', -4.5, 'Lav Reims', { external_id: lignes[0]!.externalId })])
    expect(v.manquantes).toHaveLength(0)
    expect(v.identiques).toBe(1)
  })

  it('deux achats identiques le même jour comptent deux fois', () => {
    const { lignes } = lireCsvCarte(csv(ligne('2026-11-03 11:00:00', 'Resto', -13), ligne('2026-11-03 12:00:00', 'Resto', -13)))
    const v = verifierCsvCarte(lignes, [op('2026-11-03', -13, 'RESTO')])
    expect(v.identiques).toBe(1)
    expect(v.manquantes).toHaveLength(1)
  })
})
