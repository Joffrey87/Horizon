// ================================================================
// Tests des règles métier pures de logic.ts.
// Aucune dépendance réseau : tout est déterministe, dates figées.
// ================================================================
import { describe, it, expect } from 'vitest'
import type { Check, OlafatcoJob, Task } from './types'
import {
  buildControlHoursLines, catholicFeasts, checkStatus, chosenMassForDay, citySlug,
  controlHoursWorkDays, extractEmojis, extractHourMinute, feastOnDay, firstFridayOrSaturday,
  fmtMinutes, hasMaintainedMasses, isLineValid, isMarketParkingDay, isObligationDay, iso,
  lastControlHoursPeriodEnd, lineTotal, massFitsShift, massesInfoUrl, parseShift,
  misselDayName, proposeControlHours, revisionWeek, quadrant, recurrenceDueOn, recurrenceLabel, spanPart, tasksForDay,
  tripLocationOn, workShiftOn, worksOn,
} from './logic'

// ---- fabriques minimales ------------------------------------------------

let seq = 0
function task(over: Partial<Task> = {}): Task {
  return {
    id: `t${++seq}`, user_id: 'u', title: 'Tâche', status: 'a_faire',
    is_task: true, is_recurring: false, recurrence_rule: null, notable: false,
    domain_id: null, project_id: null, step_id: null,
    scheduled_date: null, due_date: null, end_date: null,
    done_at: null, duration_min: null, importance: null, urgence: null,
    notes: null, location: null, sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  } as Task
}
/** Vacation CAPS telle qu'importée depuis l'iCal (le marqueur vit dans `notes`). */
const caps = (date: string, title: string) =>
  task({ title, scheduled_date: date, notes: 'source:caps', is_task: false })

// ---- dates & récurrences ------------------------------------------------

describe('récurrences', () => {
  it('daily tombe tous les jours', () => {
    expect(recurrenceDueOn('daily', new Date(2026, 7, 29))).toBe(true)
  })
  it('weekly ne retient que les jours ISO listés', () => {
    const samedi = new Date(2026, 7, 29) // samedi = 6
    expect(recurrenceDueOn('weekly:6', samedi)).toBe(true)
    expect(recurrenceDueOn('weekly:1,2', samedi)).toBe(false)
  })
  it('monthly compare le quantième', () => {
    expect(recurrenceDueOn('monthly:29', new Date(2026, 7, 29))).toBe(true)
    expect(recurrenceDueOn('monthly:3', new Date(2026, 7, 29))).toBe(false)
  })
  it('une règle absente ou inconnue ne tombe jamais', () => {
    expect(recurrenceDueOn(null, new Date())).toBe(false)
    expect(recurrenceDueOn('yearly:1', new Date())).toBe(false)
  })
  it('les libellés restent lisibles', () => {
    expect(recurrenceLabel('daily')).toBe('Chaque jour')
    expect(recurrenceLabel('weekly:1,5')).toBe('Chaque lun, ven')
    expect(recurrenceLabel('monthly:12')).toBe('Le 12 du mois')
    expect(recurrenceLabel(null)).toBe('')
  })
})

describe('tasksForDay', () => {
  const jour = new Date(2026, 7, 29)
  it('retient une tâche planifiée ce jour', () => {
    expect(tasksForDay([task({ scheduled_date: '2026-08-29' })], jour)).toHaveLength(1)
  })
  it('ignore une tâche annulée', () => {
    expect(tasksForDay([task({ scheduled_date: '2026-08-29', status: 'annule' })], jour)).toHaveLength(0)
  })
  it('couvre chaque jour d un évènement multi-jours', () => {
    const vac = task({ scheduled_date: '2026-08-27', end_date: '2026-08-31', is_task: false })
    expect(tasksForDay([vac], jour)).toHaveLength(1)
    expect(tasksForDay([vac], new Date(2026, 8, 2))).toHaveLength(0)
  })
})

describe('spanPart', () => {
  const ev = task({ scheduled_date: '2026-08-27', end_date: '2026-08-30' })
  it('situe le jour dans la bande', () => {
    expect(spanPart(ev, '2026-08-27')).toBe('start')
    expect(spanPart(ev, '2026-08-28')).toBe('middle')
    expect(spanPart(ev, '2026-08-30')).toBe('end')
  })
  it('sans end_date, ou end_date <= début, la tâche est simple', () => {
    expect(spanPart(task({ scheduled_date: '2026-08-27' }), '2026-08-27')).toBe('single')
    expect(spanPart(task({ scheduled_date: '2026-08-27', end_date: '2026-08-27' }), '2026-08-27')).toBe('single')
  })
})

describe('quadrant', () => {
  it('classe selon importance et urgence, 2 valant « oui »', () => {
    expect(quadrant(3, 3)).toBe(1)
    expect(quadrant(3, 1)).toBe(2)
    expect(quadrant(1, 3)).toBe(3)
    expect(quadrant(1, 1)).toBe(4)
  })
  it('sans valeur, on suppose important et urgent', () => {
    expect(quadrant(null, null)).toBe(1)
  })
})

// ---- comput de Pâques et fêtes -----------------------------------------

describe('catholicFeasts', () => {
  // Dates de Pâques de référence (calendrier grégorien).
  const paques: Record<number, string> = {
    2024: '2024-03-31', 2025: '2025-04-20', 2026: '2026-04-05',
    2027: '2027-03-28', 2030: '2030-04-21', 2038: '2038-04-25',
  }
  it('calcule Pâques conformément au comput', () => {
    for (const [an, date] of Object.entries(paques)) {
      const f = catholicFeasts(Number(an)).find((x) => x.name === 'Pâques')
      expect(`${an} → ${f?.date}`).toBe(`${an} → ${date}`)
    }
  })
  it('place l Ascension 39 jours après Pâques et la Pentecôte 49', () => {
    const f = catholicFeasts(2026)
    expect(f.find((x) => x.name === 'Ascension')?.date).toBe('2026-05-14')
    expect(f.find((x) => x.name === 'Pentecôte')?.date).toBe('2026-05-24')
  })
  it('donne 15 fêtes triées par date', () => {
    const f = catholicFeasts(2026)
    expect(f).toHaveLength(15)
    expect([...f].sort((a, b) => a.date.localeCompare(b.date))).toEqual(f)
  })
  it('reconnaît une fête au jour le jour', () => {
    expect(feastOnDay(new Date(2026, 11, 25))).toBe('Noël')
    expect(feastOnDay(new Date(2026, 11, 26))).toBeNull()
  })
})

describe('jours d obligation et de dévotion', () => {
  it('tout dimanche est jour d obligation', () => {
    expect(isObligationDay(new Date(2026, 7, 30))).toBe(true) // dimanche
  })
  it('1er vendredi et 1er samedi du mois seulement', () => {
    expect(firstFridayOrSaturday(new Date(2026, 8, 4))).toBe('1er vendredi')
    expect(firstFridayOrSaturday(new Date(2026, 8, 5))).toBe('1er samedi')
    expect(firstFridayOrSaturday(new Date(2026, 8, 11))).toBeNull() // 2e vendredi
    expect(firstFridayOrSaturday(new Date(2026, 8, 9))).toBeNull()  // mercredi
  })
})

// ---- planning CAPS ------------------------------------------------------

describe('parseShift', () => {
  it('lit les horaires avec ou sans minutes', () => {
    expect(parseShift('6h-14h M1')).toEqual({ start: 360, end: 840 })
    expect(parseShift('15h-20h45 S2 - Ext')).toEqual({ start: 900, end: 1245 })
  })
  it('franchit minuit en ajoutant 24 h à la fin', () => {
    expect(parseShift('21h-6h N')).toEqual({ start: 1260, end: 1800 })
  })
  it('rend null sur un titre sans horaire', () => {
    expect(parseShift('Réunion ARIL')).toBeNull()
  })
})

describe('workShiftOn', () => {
  it('extrait le code de journée', () => {
    expect(workShiftOn([caps('2026-08-29', '6h-14h M1')], '2026-08-29')?.code).toBe('M1')
  })
  it('ignore un congé (suffixe V / Vf)', () => {
    expect(workShiftOn([caps('2026-08-29', '6h-14h M1 - V')], '2026-08-29')).toBeNull()
    expect(worksOn([caps('2026-08-29', '6h-14h M1 - Vf')], new Date(2026, 7, 29))).toBe(false)
  })
  it('ignore un évènement qui ne vient pas du planning CAPS', () => {
    expect(workShiftOn([task({ title: '6h-14h M1', scheduled_date: '2026-08-29' })], '2026-08-29')).toBeNull()
  })
})

describe('isMarketParkingDay', () => {
  const dim = new Date(2026, 7, 30) // dimanche
  it('alerte un dimanche travaillé qui commence avant 15h', () => {
    expect(isMarketParkingDay([caps('2026-08-30', '6h-14h M1')], dim)).toBe(true)
  })
  it('n alerte pas à 15h pile (marché terminé)', () => {
    expect(isMarketParkingDay([caps('2026-08-30', '15h-20h45 S2')], dim)).toBe(false)
  })
  it('n alerte pas hors dimanche', () => {
    expect(isMarketParkingDay([caps('2026-08-29', '6h-14h M1')], new Date(2026, 7, 29))).toBe(false)
  })
})

// ---- messes -------------------------------------------------------------

describe('massFitsShift', () => {
  const garde = { start: 6 * 60, end: 14 * 60 } // 6h-14h, marge 30 min, messe 60 min
  it('accepte une messe finie avant le début moins la marge', () => {
    expect(massFitsShift('04:00', garde)).toBe(true) // 4h-5h ≤ 5h30
  })
  it('accepte une messe commencée après la fin plus la marge', () => {
    expect(massFitsShift('18:30', garde)).toBe(true)
  })
  it('écarte une messe qui chevauche la garde', () => {
    expect(massFitsShift('10:30', garde)).toBe(false)
    expect(massFitsShift('14:15', garde)).toBe(false) // dans la marge d après-garde
  })
  it('ne rejette pas un horaire illisible', () => {
    expect(massFitsShift('inconnu', garde)).toBe(true)
  })
})

describe('ville et liens messes.info', () => {
  it('translittère les accents et les espaces', () => {
    expect(citySlug('Saint-Étienne')).toBe('saint-etienne')
    expect(citySlug('  La Rochelle ')).toBe('la+rochelle')
    expect(massesInfoUrl('Reims')).toBe('https://messes.info/horaires/reims')
  })
  it('ne maintient une liste horaire que pour Reims', () => {
    expect(hasMaintainedMasses('Reims')).toBe(true)
    expect(hasMaintainedMasses('Lyon')).toBe(false)
  })
})

describe('tripLocationOn', () => {
  const sejour = task({ is_task: false, location: 'Annecy', scheduled_date: '2026-08-27', end_date: '2026-08-31' })
  it('rend le lieu couvrant le jour', () => {
    expect(tripLocationOn([sejour], '2026-08-29')).toBe('Annecy')
  })
  it('rend null hors de la plage', () => {
    expect(tripLocationOn([sejour], '2026-09-01')).toBeNull()
  })
})

describe('chosenMassForDay', () => {
  const check = { id: 'c1', kind: 'messe_travail', config: { chosen: { '2026-08-30': '10:30 Saint-Remi' } } } as unknown as Check
  it('retrouve le choix mémorisé', () => {
    expect(chosenMassForDay([check], '2026-08-30')).toBe('10:30 Saint-Remi')
    expect(chosenMassForDay([check], '2026-08-31')).toBeNull()
  })
})

describe('checkStatus (messe_travail)', () => {
  const check = {
    id: 'c1', kind: 'messe_travail', active: true, domain_id: null, window_months: 2,
    resolved: [], config: {}, title: 'Messe si je travaille',
  } as unknown as Check
  it('ne retient que les jours d obligation travaillés', () => {
    const tasks = [
      caps('2026-08-30', '6h-14h M1'), // dimanche travaillé → retenu
      caps('2026-08-31', '6h-14h M1'), // lundi travaillé    → ignoré
    ]
    const st = checkStatus(check, tasks, { now: new Date(2026, 7, 29), homeCity: 'Reims' })
    expect(st.dates.map((d) => d.date)).toContain('2026-08-30')
    expect(st.dates.map((d) => d.date)).not.toContain('2026-08-31')
  })
  it('situe la recherche au lieu de séjour', () => {
    const tasks = [
      caps('2026-08-30', '6h-14h M1'),
      task({ is_task: false, location: 'Annecy', scheduled_date: '2026-08-29', end_date: '2026-08-31' }),
    ]
    const st = checkStatus(check, tasks, { now: new Date(2026, 7, 29), homeCity: 'Reims' })
    expect(st.dates.find((d) => d.date === '2026-08-30')?.location).toBe('Annecy')
  })
})

// ---- heures de contrôle (OLAFATCO) --------------------------------------

describe('règles des heures de contrôle', () => {
  it('valide une ligne conforme', () => {
    expect(isLineValid({ date: '2026-08-29', shift_code: 'M1', standard: 2.5, instructeur: 2, urmn: 2, urme: 2 })).toBe(true)
  })
  it('refuse un total hors bornes', () => {
    expect(isLineValid({ date: '2026-08-29', shift_code: 'M1', standard: 2, instructeur: 1.5, urmn: 2, urme: 2 })).toBe(false) // 3.5 < 4
    expect(isLineValid({ date: '2026-08-29', shift_code: 'M1', standard: 3.5, instructeur: 2, urmn: 2, urme: 2 })).toBe(false) // 5.5 > 5
  })
  it('refuse moins de 1,5 d un côté', () => {
    expect(isLineValid({ date: '2026-08-29', shift_code: 'M1', standard: 3, instructeur: 1.25, urmn: 2, urme: 2 })).toBe(false)
  })
  it('refuse une valeur hors du pas de 0,25', () => {
    expect(isLineValid({ date: '2026-08-29', shift_code: 'M1', standard: 2.4, instructeur: 2, urmn: 2, urme: 2 })).toBe(false)
  })
  it('additionne sans dérive flottante', () => {
    expect(lineTotal({ standard: 2.25, instructeur: 2.5 })).toBe(4.75)
  })
})

describe('proposeControlHours', () => {
  it('produit toujours une ligne valide', () => {
    for (const d of ['2026-08-24', '2026-08-25', '2026-08-28', '2026-08-29', '2026-08-30', '2026-09-01']) {
      expect(`${d}: ${isLineValid(proposeControlHours(d, 'M1'))}`).toBe(`${d}: true`)
    }
  })
  it('est déterministe : même date, mêmes heures', () => {
    expect(proposeControlHours('2026-08-29', 'M1')).toEqual(proposeControlHours('2026-08-29', 'M1'))
  })
  it('vise les totaux hauts du vendredi au lundi', () => {
    const total = lineTotal(proposeControlHours('2026-08-29', 'M1')) // samedi
    expect([4.5, 4.75]).toContain(total)
  })
  it('vise les totaux bas du mardi au jeudi', () => {
    const total = lineTotal(proposeControlHours('2026-08-26', 'M1')) // mercredi
    expect([4, 4.25]).toContain(total)
  })
})

describe('controlHoursWorkDays', () => {
  const tasks = [
    caps('2026-08-24', '6h-14h M1'),
    caps('2026-08-25', '6h-14h M1 - V'), // congé
    caps('2026-08-26', '15h-20h45 S2'),
  ]
  it('ne garde que les jours réellement travaillés, dans l ordre', () => {
    const j = controlHoursWorkDays(tasks, new Date(2026, 7, 24), new Date(2026, 7, 26))
    expect(j.map((x) => x.date)).toEqual(['2026-08-24', '2026-08-26'])
    expect(j.map((x) => x.code)).toEqual(['M1', 'S2'])
  })
  it('rend une liste vide si la période est inversée', () => {
    expect(controlHoursWorkDays(tasks, new Date(2026, 7, 26), new Date(2026, 7, 24))).toEqual([])
  })
  it('construit une ligne valide par jour travaillé', () => {
    const lines = buildControlHoursLines(tasks, new Date(2026, 7, 24), new Date(2026, 7, 26))
    expect(lines).toHaveLength(2)
    expect(lines.every((l) => isLineValid(l))).toBe(true)
  })
})

describe('lastControlHoursPeriodEnd', () => {
  const jobs = [
    { id: 'j1', period_end: '2026-07-31', validated_at: '2026-08-01T00:00:00Z' },
    { id: 'j2', period_end: '2026-08-15', validated_at: '2026-08-16T00:00:00Z' },
    { id: 'j3', period_end: '2026-08-31', validated_at: null },
  ] as unknown as OlafatcoJob[]
  it('prend la fin de période validée la plus récente', () => {
    expect(lastControlHoursPeriodEnd(jobs)).toBe('2026-08-15')
  })
  it('rend null sans job validé', () => {
    expect(lastControlHoursPeriodEnd([])).toBeNull()
  })
})

// ---- petits utilitaires d affichage -------------------------------------

describe('utilitaires', () => {
  it('formate les minutes', () => {
    expect(fmtMinutes(360)).toBe('6h')
    expect(fmtMinutes(1245)).toBe('20h45')
    expect(fmtMinutes(1800)).toBe('6h') // lendemain 6h (garde de nuit)
  })
  it('extrait l heure d un titre', () => {
    expect(extractHourMinute('9h30 dentiste')).toEqual({ hour: 9, minute: 30 })
    expect(extractHourMinute('14h réunion')).toEqual({ hour: 14, minute: 0 })
    expect(extractHourMinute('9:00 call')).toEqual({ hour: 9, minute: 0 })
    expect(extractHourMinute('Courses')).toBeNull()
    expect(extractHourMinute('99h fantaisie')).toBeNull()
  })
  it('extrait les emojis d un titre', () => {
    expect(extractEmojis('Vacances 🏖️ en famille')).toContain('🏖')
    expect(extractEmojis('Réunion')).toBe('')
  })
  it('iso formate en date locale', () => {
    expect(iso(new Date(2026, 7, 29))).toBe('2026-08-29')
  })
})

// ---- missel de 1962 -----------------------------------------------------

describe('misselDayName', () => {
  it('nomme les dimanches après la Pentecôte', () => {
    // 30 août 2026 = 14e dimanche après la Pentecôte (Pâques le 5 avril).
    expect(misselDayName('Pent14-0')).toBe('14e dimanche après la Pentecôte')
    expect(misselDayName('Pent02-0')).toBe('2e dimanche après la Pentecôte')
  })
  it('donne leur nom propre aux dimanches qui en ont un', () => {
    expect(misselDayName('Pent01-0')).toBe('dimanche de la Sainte Trinité')
    expect(misselDayName('Pasc0-0')).toBe('dimanche de Pâques')
    expect(misselDayName('Pasc7-0')).toBe('dimanche de la Pentecôte')
    expect(misselDayName('Quad6-0')).toBe('dimanche des Rameaux')
    expect(misselDayName('Quadp1-0')).toBe('dimanche de la Septuagésime')
    expect(misselDayName('Quadp3-0')).toBe('dimanche de la Quinquagésime')
  })
  it('distingue Carême et temps de la Passion', () => {
    expect(misselDayName('Quad1-0')).toBe('1er dimanche de Carême')
    expect(misselDayName('Quad5-0')).toBe('5e dimanche de la Passion')
  })
  it('nomme les féries par leur semaine', () => {
    expect(misselDayName('Adv1-3')).toBe("mercredi de la 1re semaine de l'Avent")
    expect(misselDayName('Pent14-5')).toBe('vendredi de la 14e semaine après la Pentecôte')
  })
  it("gère l'Avent et l'Épiphanie", () => {
    expect(misselDayName('Adv1-0')).toBe("1er dimanche de l'Avent")
    expect(misselDayName('Epi3-0')).toBe("3e dimanche après l'Épiphanie")
  })
  it('ignore le suffixe de variante', () => {
    expect(misselDayName('Pent01-0r')).toBe('dimanche de la Sainte Trinité')
  })
  it('rend null sur une clé inconnue (repli sur le nom latin)', () => {
    expect(misselDayName('08-15')).toBeNull()
    expect(misselDayName('nimportequoi')).toBeNull()
  })
})

describe('revisionWeek', () => {
  it('le dimanche, prend le lundi→samedi qui précèdent', () => {
    const r = revisionWeek(new Date(2026, 7, 30)) // dimanche 30 août 2026
    expect(r.sunday).toBe('2026-08-30')
    expect(r.days).toEqual([
      '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29',
    ])
  })
  it('garde la même semaine du dimanche au samedi suivant', () => {
    const dimanche = revisionWeek(new Date(2026, 7, 30))
    for (const d of [31, 1, 2, 3, 4, 5]) {
      const jour = d === 31 ? new Date(2026, 7, 31) : new Date(2026, 8, d)
      expect(revisionWeek(jour)).toEqual(dimanche)
    }
  })
  it('bascule au dimanche suivant', () => {
    expect(revisionWeek(new Date(2026, 8, 6)).sunday).toBe('2026-09-06')
    expect(revisionWeek(new Date(2026, 8, 6)).days[0]).toBe('2026-08-31')
  })
})
