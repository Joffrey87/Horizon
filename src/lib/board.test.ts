// ================================================================
// Bornage des cartes de l'accueil : aucun bord ne doit dépasser du cadre.
// ================================================================
import { describe, it, expect } from 'vitest'
import { borner } from './board'

const cadre = { width: 1000, height: 600 }
const CARTE = { w: 300, h: 200 }

describe('borner', () => {
  it('laisse une position déjà à l’intérieur', () => {
    expect(borner(100, 50, CARTE.w, CARTE.h, cadre)).toEqual({ x: 100, y: 50 })
  })
  it('ramène une carte qui dépasse à droite', () => {
    // 1000 - 300 = 700 : le bord droit affleure celui du cadre.
    expect(borner(5000, 0, CARTE.w, CARTE.h, cadre)).toEqual({ x: 700, y: 0 })
  })
  it('ramène une carte qui dépasse en bas', () => {
    expect(borner(0, 5000, CARTE.w, CARTE.h, cadre)).toEqual({ x: 0, y: 400 })
  })
  it('ramène les deux à la fois', () => {
    expect(borner(9999, 9999, CARTE.w, CARTE.h, cadre)).toEqual({ x: 700, y: 400 })
  })
  it('refuse les positions négatives', () => {
    expect(borner(-50, -80, CARTE.w, CARTE.h, cadre)).toEqual({ x: 0, y: 0 })
  })
  it('colle en haut à gauche si la carte est plus grande que le cadre', () => {
    // Pas de position valide : mieux vaut le coin visible que le hors-champ.
    expect(borner(300, 300, 1400, 900, cadre)).toEqual({ x: 0, y: 0 })
  })
  it('le bord exact du cadre est admis', () => {
    expect(borner(700, 400, CARTE.w, CARTE.h, cadre)).toEqual({ x: 700, y: 400 })
  })
  it('sans cadre connu, ne borne que le négatif', () => {
    expect(borner(9999, 9999, CARTE.w, CARTE.h, undefined)).toEqual({ x: 9999, y: 9999 })
    expect(borner(-10, -10, CARTE.w, CARTE.h, undefined)).toEqual({ x: 0, y: 0 })
  })
})

import { chevauche, placeLibre, degager, type Rect } from './board'

const R = (x: number, y: number, w = 100, h = 100): Rect => ({ x, y, w, h })

describe('chevauche', () => {
  it('détecte une superposition', () => {
    expect(chevauche(R(0, 0), R(50, 50))).toBe(true)
  })
  it('des tuiles côte à côte sans écart ne se chevauchent pas', () => {
    expect(chevauche(R(0, 0), R(100, 0))).toBe(false)
  })
  it('l’écart minimal compte : trop près = gêne', () => {
    expect(chevauche(R(0, 0), R(105, 0), 12)).toBe(true)
    expect(chevauche(R(0, 0), R(112, 0), 12)).toBe(false)
  })
})

describe('placeLibre', () => {
  it('garde la position si elle est libre', () => {
    expect(placeLibre(R(300, 300), [R(0, 0)], cadre)).toEqual({ x: 300, y: 300 })
  })
  it('range la tuile au plus près, sans superposition', () => {
    const autre = R(0, 0, 200, 200)
    const p = placeLibre(R(150, 50), [autre], cadre)!
    expect(chevauche({ ...p, w: 100, h: 100 }, autre, 12)).toBe(false)
    // Collée contre l'autre, pas rejetée à l'autre bout du cadre.
    expect(p.x).toBeLessThanOrEqual(212)
  })
  it('reste dans le cadre', () => {
    const p = placeLibre(R(900, 500), [R(850, 450, 150, 150)], cadre)!
    expect(p.x + 100).toBeLessThanOrEqual(cadre.width)
    expect(p.y + 100).toBeLessThanOrEqual(cadre.height)
  })
  it('rend null quand il n’y a plus de place', () => {
    expect(placeLibre(R(0, 0, 900, 500), [R(0, 0, 1000, 600)], cadre)).toBeNull()
  })
})

describe('degager', () => {
  it('ne touche à rien quand tout est séparé', () => {
    expect(degager([{ id: 'a', ...R(0, 0) }, { id: 'b', ...R(300, 0) }], cadre)).toBeNull()
  })
  it('la première tuile garde sa place, la suivante se range', () => {
    const out = degager([{ id: 'a', ...R(0, 0, 200, 200) }, { id: 'b', ...R(100, 100) }], cadre)!
    expect(out['a']).toEqual({ x: 0, y: 0 })
    expect(out['b']).not.toEqual({ x: 100, y: 100 })
    expect(chevauche({ ...out['b']!, w: 100, h: 100 }, R(0, 0, 200, 200), 12)).toBe(false)
  })
  it('plusieurs tuiles empilées au même endroit finissent toutes séparées', () => {
    const items = ['a', 'b', 'c', 'd'].map((id) => ({ id, ...R(10, 10, 150, 120) }))
    const out = degager(items, cadre)!
    const rects = items.map((i) => ({ ...out[i.id]!, w: i.w, h: i.h }))
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      expect(chevauche(rects[i]!, rects[j]!)).toBe(false)
    }
  })
})
