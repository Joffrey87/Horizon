import { describe, expect, it } from 'vitest'
import {
  ajusterDuree, clicDansLeVide, decomposerDuree, dureeEnMinutes, estBalayage, libelleDuree,
  niveauSuivant, projetsEnPastilles, valeursTache, type FormTache,
} from './tacheForm'

const base: FormTache = {
  title: '  Kiné 16h30 ', anchor: 'd:sante', scheduled_date: '2026-10-24', end_date: '',
  dur_value: '1', dur_unit: 'heure', is_task: false, importance: 2, urgence: null,
  is_recurring: false, recur_kind: 'weekly', recur_days: '1', recur_dom: '1',
  notable: true, location: ' ', notes: '',
}

describe('valeursTache', () => {
  it("n'envoie jamais due_date (une échéance existante n'est pas écrasée)", () => {
    const v = valeursTache(base)
    expect('due_date' in v).toBe(false)
    expect(v.title).toBe('Kiné 16h30')
    expect(v.domain_id).toBe('sante')
    expect(v.project_id).toBeNull()
    expect(v.duration_min).toBe(60)
    expect(v.location).toBeNull()
  })
  it('rattache à un projet et ignore la durée si « jusqu\'au » est rempli', () => {
    const v = valeursTache({ ...base, anchor: 'p:abc', end_date: '2026-10-26' })
    expect(v.project_id).toBe('abc')
    expect(v.domain_id).toBeNull()
    expect(v.duration_min).toBeNull()
    expect(v.end_date).toBe('2026-10-26')
  })
  it('construit les règles de récurrence', () => {
    expect(valeursTache({ ...base, is_recurring: true, recur_kind: 'daily' }).recurrence_rule).toBe('daily')
    expect(valeursTache({ ...base, is_recurring: true, recur_days: '1,4' }).recurrence_rule).toBe('weekly:1,4')
    expect(valeursTache({ ...base, is_recurring: true, recur_kind: 'monthly', recur_dom: '15' }).recurrence_rule).toBe('monthly:15')
    expect(valeursTache(base).recurrence_rule).toBeNull()
  })
})

describe('durée', () => {
  it('décompose et recompose', () => {
    expect(decomposerDuree(null)).toEqual({ value: '', unit: 'min' })
    expect(decomposerDuree(90)).toEqual({ value: '90', unit: 'min' })
    expect(decomposerDuree(120)).toEqual({ value: '2', unit: 'heure' })
    expect(decomposerDuree(2880)).toEqual({ value: '2', unit: 'jour' })
    expect(dureeEnMinutes('2', 'jour', '')).toBe(2880)
    expect(dureeEnMinutes('', 'min', '')).toBeNull()
    expect(dureeEnMinutes('0', 'min', '')).toBeNull()
  })
  it('libellés et −/+', () => {
    expect(libelleDuree('', 'min')).toBe('—')
    expect(libelleDuree('15', 'min')).toBe('15 min')
    expect(libelleDuree('1', 'heure')).toBe('1 h')
    expect(libelleDuree('3', 'jour')).toBe('3 j')
    expect(ajusterDuree('30', 'min', 1)).toBe('35')
    expect(ajusterDuree('3', 'min', -1)).toBe('1')
    expect(ajusterDuree('1', 'heure', -1)).toBe('1')
    expect(ajusterDuree('', 'heure', 1)).toBe('1')
    expect(ajusterDuree('', 'heure', -1)).toBe('')
  })
})

describe('puces', () => {
  it('niveau : cycle Basse → Moyenne → Haute → vide', () => {
    expect(niveauSuivant(null)).toBe(1)
    expect(niveauSuivant(1)).toBe(2)
    expect(niveauSuivant(2)).toBe(3)
    expect(niveauSuivant(3)).toBeNull()
  })
  it('projets : pastilles courtes seulement si nombreux et un projet choisi', () => {
    expect(projetsEnPastilles(3, true)).toBe(false)
    expect(projetsEnPastilles(6, false)).toBe(false)
    expect(projetsEnPastilles(6, true)).toBe(true)
  })
})

describe('clic dans le vide de la journée', () => {
  it('ne compte que le clic sur la zone elle-même, pas sur une brique', () => {
    const zone = {}, brique = {}
    expect(clicDansLeVide(zone, zone)).toBe(true)
    expect(clicDansLeVide(brique, zone)).toBe(false)
  })
  it('un balayage n\'est pas un clic', () => {
    expect(estBalayage(80, 5)).toBe(true)
    expect(estBalayage(2, 3)).toBe(false)
  })
})
