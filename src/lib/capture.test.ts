// ================================================================
// Tests de la file d'attente locale des captures.
// localStorage est simulé : ces fonctions ne touchent ni au store ni au réseau.
// ================================================================
import { describe, it, expect, beforeEach } from 'vitest'
import {
  capturesEnAttente, depiler, dernierDomaine, echecReseau, empiler, memoriserDomaine,
} from './capture'

// Faux localStorage, suffisant pour ce que le module en fait.
function faireStockage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
    clear: () => { m.clear() },
  } as Storage
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: faireStockage(), configurable: true, writable: true,
  })
})

const capture = (title: string) => ({ kind: 'idee' as const, title, domain_id: 'dom-1' })

describe("file d'attente", () => {
  it('part vide', () => {
    expect(capturesEnAttente()).toEqual([])
  })

  it('empile dans l’ordre, du plus ancien au plus récent', () => {
    expect(empiler(capture('un'))).toBe(true)
    expect(empiler(capture('deux'))).toBe(true)
    expect(capturesEnAttente().map((c) => c.title)).toEqual(['un', 'deux'])
  })

  it('donne à chaque capture un identifiant et une date', () => {
    empiler(capture('un'))
    const c = capturesEnAttente()[0]!
    expect(c.id).toMatch(/^cap-/)
    expect(Number.isNaN(Date.parse(c.created_at))).toBe(false)
    expect(c.domain_id).toBe('dom-1')
  })

  it('dépile uniquement la capture envoyée', () => {
    empiler(capture('un')); empiler(capture('deux'))
    const [premier] = capturesEnAttente()
    depiler(premier!.id)
    expect(capturesEnAttente().map((c) => c.title)).toEqual(['deux'])
  })

  it('ignore un identifiant inconnu', () => {
    empiler(capture('un'))
    depiler('cap-inexistant')
    expect(capturesEnAttente()).toHaveLength(1)
  })

  it('refuse d’empiler au-delà de la limite, sans perdre l’existant', () => {
    for (let i = 0; i < 200; i++) expect(empiler(capture(`n${i}`))).toBe(true)
    expect(empiler(capture('de trop'))).toBe(false)
    expect(capturesEnAttente()).toHaveLength(200)
    expect(capturesEnAttente()[0]!.title).toBe('n0')
  })

  it('survit à un contenu illisible', () => {
    localStorage.setItem('horizon.capture.file', 'pas du JSON')
    expect(capturesEnAttente()).toEqual([])
    expect(empiler(capture('un'))).toBe(true)
  })

  it('survit à un JSON qui n’est pas une liste', () => {
    localStorage.setItem('horizon.capture.file', '{"a":1}')
    expect(capturesEnAttente()).toEqual([])
  })
})

describe('echecReseau', () => {
  it('reconnaît les échecs réseau à réessayer', () => {
    expect(echecReseau('Failed to fetch')).toBe(true)
    expect(echecReseau('TypeError: NetworkError when attempting to fetch')).toBe(true)
    expect(echecReseau('Load failed')).toBe(true)
    expect(echecReseau('request timeout')).toBe(true)
  })
  it('laisse passer les vrais refus, qui ne marcheront jamais', () => {
    // Les empiler reviendrait à les réessayer indéfiniment.
    expect(echecReseau('new row violates row-level security policy')).toBe(false)
    expect(echecReseau('duplicate key value violates unique constraint')).toBe(false)
    expect(echecReseau(null)).toBe(false)
    expect(echecReseau(undefined)).toBe(false)
    expect(echecReseau('')).toBe(false)
  })
})

describe('dernier domaine utilisé', () => {
  it('est null au départ, puis mémorisé', () => {
    expect(dernierDomaine()).toBeNull()
    memoriserDomaine('dom-42')
    expect(dernierDomaine()).toBe('dom-42')
  })
})
