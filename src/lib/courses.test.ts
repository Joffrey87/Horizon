// Tests du tri automatique des articles de courses (courses.ts).
import { describe, it, expect } from 'vitest'
import type { ShoppingItem, ShoppingList } from './types'
import {
  classerArticle, decouperArticles, planifierAjout, rayonPourArticle, trouverListeCourses, cleRayon, rayonDeCle,
} from './courses'

const item = (label: string, section: ShoppingItem['section'], over: Partial<ShoppingItem> = {}): ShoppingItem => ({
  id: label + section, user_id: 'u', list_id: 'l', label, section, category: null, checked: false, sort_order: 0, created_at: '', ...over,
})

describe('tri par catégorie', () => {
  it('range les évidences dans le bon rayon', () => {
    expect(rayonPourArticle('Pommes')).toEqual({ section: 'alimentaire', category: 'Fruits' })
    expect(rayonPourArticle('carottes')).toEqual({ section: 'alimentaire', category: 'Légumes' })
    expect(rayonPourArticle('Saumon')).toEqual({ section: 'alimentaire', category: 'Poissons' })
    expect(rayonPourArticle('lait demi-écrémé')).toEqual({ section: 'alimentaire', category: 'Frais' })
    expect(rayonPourArticle('Œufs')).toEqual({ section: 'alimentaire', category: 'Frais' })
    expect(rayonPourArticle('baguette')).toEqual({ section: 'alimentaire', category: 'Boulangerie' })
    expect(rayonPourArticle('Spaghetti')).toEqual({ section: 'alimentaire', category: 'Épicerie' })
    expect(rayonPourArticle('huile')).toEqual({ section: 'alimentaire', category: 'Condiments' })
    expect(rayonPourArticle('jus de raisin')).toEqual({ section: 'alimentaire', category: 'Boissons' })
    expect(rayonPourArticle('glace vanille')).toEqual({ section: 'alimentaire', category: 'Surgelés' })
    expect(rayonPourArticle('Poulet')).toEqual({ section: 'boucherie', category: null })
    expect(rayonPourArticle('dentifrice')).toEqual({ section: 'non_alimentaire', category: 'Hygiène' })
    expect(rayonPourArticle('liquide vaisselle')).toEqual({ section: 'non_alimentaire', category: 'Entretien' })
  })

  it('le mot-clé le plus long l’emporte', () => {
    expect(rayonPourArticle('pommes de terre')).toEqual({ section: 'alimentaire', category: 'Légumes' })
    expect(rayonPourArticle('jus d\'orange')).toEqual({ section: 'alimentaire', category: 'Boissons' })
    expect(rayonPourArticle('compote de pomme').category).toBe('Épicerie')
    expect(rayonPourArticle('crème solaire')).toEqual({ section: 'non_alimentaire', category: 'Hygiène' })
  })

  it('ignore pluriels, accents et majuscules', () => {
    expect(rayonPourArticle('TOMATES')).toEqual(rayonPourArticle('tomate'))
    expect(rayonPourArticle('Clémentines')).toEqual({ section: 'alimentaire', category: 'Fruits' })
  })

  it('« bio » bascule dans l’onglet Bio et retire le mot du libellé', () => {
    expect(classerArticle('Pommes bio')).toEqual({ label: 'Pommes', section: 'bio', category: 'Fruits' })
    expect(classerArticle('bio lessive')).toEqual({ label: 'Lessive', section: 'bio', category: null })
    expect(classerArticle('lait bio')).toEqual({ label: 'Lait', section: 'bio', category: null })
  })

  it('un mot inconnu part dans Alimentaire, sans catégorie', () => {
    expect(classerArticle('truc bizarre')).toEqual({ label: 'Truc bizarre', section: 'alimentaire', category: null })
  })

  it('la clé de rayon fait l’aller-retour', () => {
    const r = { section: 'bio', category: 'Fruits' } as const
    expect(rayonDeCle(cleRayon(r))).toEqual(r)
    expect(rayonDeCle(cleRayon({ section: 'boucherie', category: null }))).toEqual({ section: 'boucherie', category: null })
  })
})

describe('découpage', () => {
  it('sépare virgules, points-virgules et retours ligne, sans doublon ni vide', () => {
    expect(decouperArticles('lait, pommes ;  riz\n\nlait,  ')).toEqual(['Lait', 'Pommes', 'Riz'])
    expect(decouperArticles('Pomme, pommes')).toEqual(['Pomme'])
    expect(decouperArticles('  ,, \n')).toEqual([])
  })
})

describe('ajout sans doublon', () => {
  const existants = [
    item('Poulet', 'alimentaire', { category: 'Viande' }),
    item('Pomme', 'bio', { category: 'Fruits' }),
    item('Lessive', 'bio'),
    item('Lessive', 'non_alimentaire'),
    item('Savon', 'non_alimentaire', { checked: true }),
  ]

  it('ignore un article déjà présent, même dans un autre onglet ou au pluriel', () => {
    const p = planifierAjout('poulet, pommes bio, lessive, yaourts', existants)
    expect(p.doublons).toEqual(['Poulet', 'Pomme', 'Lessive'])
    expect(p.aAjouter).toEqual([{ label: 'Yaourts', section: 'alimentaire', category: 'Frais' }])
  })

  it('distingue le bio du non-bio', () => {
    const p = planifierAjout('pommes', existants)
    expect(p.aAjouter).toEqual([{ label: 'Pommes', section: 'alimentaire', category: 'Fruits' }])
  })

  it('un article déjà acheté (coché) est remis à acheter au lieu d’être recréé', () => {
    const p = planifierAjout('savon', existants)
    expect(p.aAjouter).toEqual([])
    expect(p.aRemettre.map((i) => i.label)).toEqual(['Savon'])
  })

  it('respecte la catégorie choisie dans le panneau', () => {
    const p = planifierAjout('Mystère', [], { Mystère: { section: 'non_alimentaire', category: 'Maison' } })
    expect(p.aAjouter).toEqual([{ label: 'Mystère', section: 'non_alimentaire', category: 'Maison' }])
  })
})

describe('liste Courses', () => {
  const l = (name: string): ShoppingList => ({ id: name, user_id: 'u', name, recurrent: true, sort_order: 0, created_at: '' })
  it('retrouve « Courses » quelle que soit la casse', () => {
    expect(trouverListeCourses([l('Travaux'), l('courses')])?.name).toBe('courses')
    expect(trouverListeCourses([l('Travaux')])).toBeNull()
  })
})
