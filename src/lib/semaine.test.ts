import { describe, it, expect } from 'vitest'
import { ECHELLE_TELEPHONE, bandeService, hauteurBrique, libelleDuree, libelleHeures, heureCourte, notePropre, ordreSemaine } from './semaine'
import type { Task } from './types'

const t = (title: string, extra: Partial<Task> = {}) => ({ id: title, title, duration_min: null, scheduled_date: null, ...extra }) as Task

describe('hauteurBrique', () => {
  it('bureau (compact) : 10 px/h + 28, entre 40 et 100', () => {
    expect(hauteurBrique(45, 'bureau')).toBe(40)
    expect(hauteurBrique(60, 'bureau')).toBe(40)
    expect(hauteurBrique(150, 'bureau')).toBe(53)
    expect(hauteurBrique(480, 'bureau')).toBe(100)
    expect(hauteurBrique(1440, 'bureau')).toBe(100)
  })
  it('téléphone : de 36 (≤ 1 h) à 88 (8 h) px, plafonné à 88', () => {
    expect(hauteurBrique(45, 'telephone')).toBe(36)
    expect(hauteurBrique(300, 'telephone')).toBe(66)
    expect(hauteurBrique(480, 'telephone')).toBe(88)
    expect(hauteurBrique(1200, 'telephone')).toBe(88)
  })
  it('téléphone : 8 h = la moitié de l’ancienne brique J / S1 (176 px)', () => {
    expect(hauteurBrique(480, 'telephone')).toBe(176 / 2)
  })
  it('téléphone : croissante, jamais au-dessus du plafond ni sous le minimum', () => {
    let prec = 0
    for (let d = 0; d <= 1600; d += 15) {
      const h = hauteurBrique(d, 'telephone')
      expect(h).toBeGreaterThanOrEqual(prec)
      expect(h).toBeLessThanOrEqual(ECHELLE_TELEPHONE.max)
      expect(h).toBeGreaterThanOrEqual(ECHELLE_TELEPHONE.min)
      prec = h
    }
  })
  it('sans durée : la hauteur minimale', () => {
    expect(hauteurBrique(null, 'bureau')).toBe(40)
    expect(hauteurBrique(0, 'telephone')).toBe(36)
  })
})

describe('libellés', () => {
  it('heures de début et de fin', () => {
    expect(libelleHeures(t('10h30 J', { duration_min: 480 }))).toBe('10:30 – 18:30')
    expect(libelleHeures(t('8h30 Dentiste', { duration_min: 45 }))).toBe('8:30 – 9:15')
    expect(libelleHeures(t('7h30 Départ'))).toBe('7:30')
    expect(libelleHeures(t('Sans heure'))).toBeNull()
  })
  it('la fin passe minuit', () => {
    expect(libelleHeures(t('22h Garde', { duration_min: 180 }))).toBe('22:00 – 1:00')
  })
  it('durée', () => {
    expect(libelleDuree(45)).toBe('45 min')
    expect(libelleDuree(480)).toBe('8 h')
    expect(libelleDuree(150)).toBe('2 h 30')
    expect(libelleDuree(null)).toBe('')
  })
  it('note : ignore les marqueurs techniques', () => {
    expect(notePropre('source:caps\nApporter le dessert')).toBe('Apporter le dessert')
    expect(notePropre('source:check:abc')).toBeNull()
    expect(notePropre(null)).toBeNull()
  })
})

describe('ordreSemaine', () => {
  it('multi-jours, puis toute la journée, puis chronologique', () => {
    const l = [t('14h Rdv'), t('Courses'), t('9h Sport'), t('Vacances', { scheduled_date: '2026-10-19' })]
    const spans = new Set(['Vacances'])
    l.sort((a, b) => ordreSemaine(a, b, spans.has(a.title), spans.has(b.title)))
    expect(l.map((x) => x.title)).toEqual(['Vacances', 'Courses', '9h Sport', '14h Rdv'])
  })
})

describe('bandeService', () => {
  const t = (id: string, title: string, date: string, notes: string | null = 'source:caps') => ({ id, title, notes, scheduled_date: date })
  it('journée de travail : code + plage', () => {
    const b = bandeService([t('1', '10h30-18h30 J', '2026-10-19')], '2026-10-19')!
    expect(b.libelle).toBe('J 10h30–18h30')
    expect(b.id).toBe('1')
    expect(b.fond).toBe('#f59e0b')
  })
  it('nuit : « Nuit » et fin après minuit', () => {
    expect(bandeService([t('1', '19h45-6h N', '2026-10-25')], '2026-10-25')!.libelle).toBe('Nuit 19h45–6h')
  })
  it('jour sans service, congé ou évènement non CAPS : pas de bande', () => {
    expect(bandeService([], '2026-10-19')).toBeNull()
    expect(bandeService([t('1', '6h-14h M1 - Vf', '2026-10-19')], '2026-10-19')).toBeNull()
    expect(bandeService([t('1', '10h30-18h30 J', '2026-10-19', null)], '2026-10-19')).toBeNull()
    expect(bandeService([t('1', '10h30-18h30 J', '2026-10-20')], '2026-10-19')).toBeNull()
  })
  it('aucune couleur bleue', () => {
    for (const code of ['M1', 'M2', 'J', 'S1', 'S2', 'N', 'X']) {
      const { fond } = bandeService([t('1', `6h-14h ${code}`, '2026-10-19')], '2026-10-19')!
      const [r, , b] = [1, 3, 5].map((i) => parseInt(fond.slice(i, i + 2), 16))
      expect(b!).toBeLessThan(r!)
    }
  })
})

describe('heureCourte (téléphone)', () => {
  it('heure ronde sans minutes', () => {
    expect(heureCourte(8 * 60)).toEqual({ h: '8h', m: null })
    expect(heureCourte(0)).toEqual({ h: '0h', m: null })
  })
  it('minutes séparées pour l’exposant', () => {
    expect(heureCourte(8 * 60 + 30)).toEqual({ h: '8h', m: '30' })
    expect(heureCourte(9 * 60 + 5)).toEqual({ h: '9h', m: '05' })
    expect(heureCourte(24 * 60 + 15)).toEqual({ h: '0h', m: '15' })
  })
})
