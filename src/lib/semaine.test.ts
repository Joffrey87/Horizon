import { describe, it, expect } from 'vitest'
import { hauteurBrique, libelleDuree, libelleHeures, notePropre, ordreSemaine } from './semaine'
import type { Task } from './types'

const t = (title: string, extra: Partial<Task> = {}) => ({ id: title, title, duration_min: null, scheduled_date: null, ...extra }) as Task

describe('hauteurBrique', () => {
  it('bureau : 18 px/h + 40, entre 58 et 150', () => {
    expect(hauteurBrique(45, 'bureau')).toBe(58)
    expect(hauteurBrique(60, 'bureau')).toBe(58)
    expect(hauteurBrique(150, 'bureau')).toBe(85)
    expect(hauteurBrique(480, 'bureau')).toBe(150)
    expect(hauteurBrique(1440, 'bureau')).toBe(150)
  })
  it('téléphone : 22 px/h, entre 52 et 200', () => {
    expect(hauteurBrique(45, 'telephone')).toBe(52)
    expect(hauteurBrique(300, 'telephone')).toBe(110)
    expect(hauteurBrique(480, 'telephone')).toBe(176)
    expect(hauteurBrique(1200, 'telephone')).toBe(200)
  })
  it('sans durée : la hauteur minimale', () => {
    expect(hauteurBrique(null, 'bureau')).toBe(58)
    expect(hauteurBrique(0, 'telephone')).toBe(52)
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
