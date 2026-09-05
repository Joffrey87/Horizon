// ================================================================
// Bornage des cartes de l'accueil : aucun bord ne doit dépasser du cadre.
// ================================================================
import { describe, it, expect } from 'vitest'
import { borner } from './HomeBoard'

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
