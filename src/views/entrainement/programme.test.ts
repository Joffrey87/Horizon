import { describe, expect, it } from 'vitest'
import { arrondiDisque, etapesSeance } from './programme'
import { dernierePerf, records, tonnage, unRm, type SeanceFaite } from './stockage'

describe('etapesSeance', () => {
  it('commence par l’échauffement général et finit sans repos', () => {
    for (const s of ['A', 'B'] as const) {
      const e = etapesSeance(s)
      expect(e[0]?.type).toBe('echauffement')
      expect(e.at(-1)?.repos).toBe(0)
      expect(new Set(e.map((x) => x.id)).size).toBe(e.length)
    }
  })

  it('alterne leg extension et leg curl, le repos tombant après le curl', () => {
    const superset = etapesSeance('A').filter((e) => e.type === 'serie' && e.bloc.startsWith('Superset'))
    const ordre = superset.map((e) => (e.type === 'serie' ? `${e.exercice.id}:${e.repos}` : ''))
    expect(ordre.slice(0, 4)).toEqual(['legext:0', 'legcurl:45', 'legext:0', 'legcurl:90'])
  })

  it('numérote les séries de travail sans compter l’échauffement', () => {
    const couche = etapesSeance('A').filter((e) => e.type === 'serie' && e.exercice.id === 'couche')
    expect(couche.map((e) => (e.type === 'serie' ? e.numero ?? 0 : -1))).toEqual([0, 0, 0, 1, 2, 3, 4])
  })

  it('dédouble le gainage latéral par côté', () => {
    const lat = etapesSeance('B').filter((e) => e.type === 'serie' && e.exercice.id === 'lateral')
    expect(lat).toHaveLength(6)
  })
})

describe('statistiques', () => {
  const histo: SeanceFaite[] = [
    { id: '2', seance: 'B', debut: '2026-10-27T10:00:00Z', fin: '', dureeSec: 0, notes: '', series: [
      { exerciceId: 'couche', exerciceNom: 'Développé couché', numero: 1, cible: '4-6', kg: 62.5, reps: 5 },
    ] },
    { id: '1', seance: 'A', debut: '2026-10-25T10:00:00Z', fin: '', dureeSec: 0, notes: '', series: [
      { exerciceId: 'couche', exerciceNom: 'Développé couché', numero: 1, cible: '4-6', kg: 60, reps: 6 },
      { exerciceId: 'couche', exerciceNom: 'Développé couché', numero: 2, cible: '6-8', kg: 55, reps: 8 },
    ] },
  ]

  it('reprend la dernière performance de la même série', () => {
    expect(dernierePerf(histo, 'couche', 1)?.kg).toBe(62.5)
    expect(dernierePerf(histo, 'couche', 2)?.kg).toBe(55)
  })

  it('retient le meilleur 1RM estimé', () => {
    const r = records(histo)[0]
    expect(r?.kg).toBe(62.5)
    expect(Math.round(unRm(60, 6))).toBe(72)
  })

  it('calcule le tonnage et arrondit aux disques', () => {
    expect(tonnage(histo[1]?.series ?? [])).toBe(800)
    expect(arrondiDisque(24.3)).toBe(25)
  })
})
