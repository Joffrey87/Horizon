import { describe, expect, it } from 'vitest'
import { cleCommercant, clesDuGroupe, planAlias, planRegrouper, planSeparer } from './editionGroupes'

const regles = [
  { id: 'r1', pattern: 'enseigne:carrefour', name: 'Supermarchés' },
  { id: 'r2', pattern: 'enseigne:lidl', name: 'Supermarchés' },
  { id: 'r3', pattern: 'rum:x', name: 'Abonnements' },
]

describe('édition des regroupements', () => {
  it('un groupe manuel emporte toutes ses règles, même hors du mois', () => {
    expect(clesDuGroupe({ cles: ['enseigne:carrefour'], manuel: true, nom: 'Supermarchés' }, regles)).toEqual(['enseigne:carrefour', 'enseigne:lidl'])
    expect(clesDuGroupe({ cles: ['enseigne:auchan'], manuel: false, nom: 'Auchan' }, regles)).toEqual(['enseigne:auchan'])
  })
  it('fusionner : une règle par clé, au nom choisi', () => {
    expect(planRegrouper(['enseigne:carrefour', 'enseigne:lidl', 'enseigne:auchan'], ' Courses ', regles)).toEqual([
      { op: 'update', id: 'r1', values: { name: 'Courses' } },
      { op: 'update', id: 'r2', values: { name: 'Courses' } },
      { op: 'insert', values: { pattern: 'enseigne:auchan', name: 'Courses' } },
    ])
    expect(planRegrouper(['enseigne:carrefour'], '  ', regles)).toEqual([])
  })
  it('séparer retire les règles du groupe', () => {
    expect(planSeparer(['enseigne:carrefour', 'enseigne:lidl'], regles)).toEqual([{ op: 'remove', id: 'r1' }, { op: 'remove', id: 'r2' }])
  })
  it('renommer un commerçant : crée, modifie ou retire l’alias', () => {
    const alias = [{ id: 'a1', pattern: 'enseigne:carrefour', label: 'Carrefour' }]
    expect(planAlias(['enseigne:carrefour'], 'Carrefour', alias)).toEqual([])
    expect(planAlias(['enseigne:carrefour'], 'Carrefour Reims', alias)).toEqual([{ op: 'update', id: 'a1', values: { label: 'Carrefour Reims' } }])
    expect(planAlias(['enseigne:carrefour'], '', alias)).toEqual([{ op: 'remove', id: 'a1' }])
    expect(planAlias(['lav reims'], 'Laverie', alias)).toEqual([{ op: 'insert', values: { pattern: 'lav reims', label: 'Laverie' } }])
    expect(cleCommercant('CARTE CARREFOUR CITY REIMS')).toBe('enseigne:carrefour')
  })
})
