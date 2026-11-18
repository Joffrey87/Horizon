import { describe, expect, it } from 'vitest'
import { actionPermise, ajouterAction, appliquerActions, nouvelleAction, type ActionHorsLigne } from './file'

const a = (op: ActionHorsLigne['op'], rowId: string, values: Record<string, unknown>, table = 'shopping_items', locale?: Record<string, unknown>) =>
  nouvelleAction(table, op, rowId, values, locale)

describe('actionPermise', () => {
  it('ouvre les courses et les habitudes', () => {
    expect(actionPermise('shopping_items', 'update', { checked: true })).toBe(true)
    expect(actionPermise('shopping_items', 'insert', { label: 'pain' })).toBe(true)
    expect(actionPermise('habit_logs', 'delete')).toBe(true)
  })
  it('ne laisse sur une tâche que les petits gestes', () => {
    expect(actionPermise('tasks', 'update', { status: 'fait', done_at: 'x' })).toBe(true)
    expect(actionPermise('tasks', 'update', { scheduled_date: '2026-11-20' })).toBe(true)
    expect(actionPermise('tasks', 'update', { title: 'autre' })).toBe(false)
    expect(actionPermise('tasks', 'update', { status: 'fait', title: 'autre' })).toBe(false)
    expect(actionPermise('tasks', 'insert', { title: 'x' })).toBe(false)
    expect(actionPermise('tasks', 'delete')).toBe(false)
  })
  it('séances : enregistrer ou supprimer', () => {
    expect(actionPermise('training_sessions', 'upsert')).toBe(true)
    expect(actionPermise('training_sessions', 'update', { notes: 'x' })).toBe(false)
  })
  it('refuse tout le reste (finances comprises)', () => {
    expect(actionPermise('fin_transactions', 'update', { category_id: 'c' })).toBe(false)
    expect(actionPermise('projects', 'update', { status: 'actif' })).toBe(false)
  })
})

describe('ajouterAction', () => {
  it('fusionne deux cochages de la même ligne', () => {
    let f = ajouterAction([], a('update', 'r1', { checked: true }))
    f = ajouterAction(f, a('update', 'r1', { checked: false }))
    expect(f).toHaveLength(1)
    expect(f[0]!.values).toEqual({ checked: false })
  })
  it('garde l’ordre entre lignes différentes', () => {
    let f = ajouterAction([], a('update', 'r1', { checked: true }))
    f = ajouterAction(f, a('update', 'r2', { checked: true }))
    expect(f.map((x) => x.rowId)).toEqual(['r1', 'r2'])
  })
  it('une ligne créée puis supprimée hors ligne ne laisse rien', () => {
    let f = ajouterAction([], a('insert', 'n1', { id: 'n1', label: 'lait' }))
    f = ajouterAction(f, a('update', 'n1', { checked: true }))
    f = ajouterAction(f, a('delete', 'n1', {}))
    expect(f).toEqual([])
  })
  it('modifier une ligne créée hors ligne complète sa création', () => {
    let f = ajouterAction([], a('insert', 'n1', { id: 'n1', label: 'lait' }))
    f = ajouterAction(f, a('update', 'n1', { checked: true }))
    expect(f).toHaveLength(1)
    expect(f[0]!.values).toEqual({ id: 'n1', label: 'lait', checked: true })
  })
  it('une suppression rend inutiles les modifications précédentes', () => {
    let f = ajouterAction([], a('update', 'r1', { checked: true }))
    f = ajouterAction(f, a('delete', 'r1', {}))
    expect(f.map((x) => x.op)).toEqual(['delete'])
  })
  it('ne touche pas à l’action en cours d’envoi', () => {
    const envoi = a('update', 'r1', { checked: true })
    let f = ajouterAction([envoi], a('update', 'r1', { checked: false }), envoi.id)
    expect(f.map((x) => x.values)).toEqual([{ checked: true }, { checked: false }])
    const creation = a('insert', 'n1', { id: 'n1' })
    f = ajouterAction([creation], a('delete', 'n1', {}), creation.id)
    expect(f.map((x) => x.op)).toEqual(['insert', 'delete'])
  })
  it('une séance réenregistrée remplace la précédente', () => {
    let f = ajouterAction([], a('upsert', 's1', { notes: 'a' }, 'training_sessions'))
    f = ajouterAction(f, a('upsert', 's1', { notes: 'b' }, 'training_sessions'))
    expect(f).toHaveLength(1)
    expect(f[0]!.values).toEqual({ notes: 'b' })
  })
})

describe('appliquerActions', () => {
  const lignes = [{ id: 'r1', label: 'pain', checked: false }, { id: 'r2', label: 'œufs', checked: false }]
  it('rejoue cochages, créations et suppressions', () => {
    const f = [
      a('update', 'r1', { checked: true }),
      a('delete', 'r2', {}),
      a('insert', 'n1', { id: 'n1', label: 'lait' }, 'shopping_items', { checked: false }),
      a('update', 'x', { status: 'fait' }, 'tasks'),
    ]
    expect(appliquerActions(lignes, 'shopping_items', f)).toEqual([
      { id: 'r1', label: 'pain', checked: true },
      { id: 'n1', label: 'lait', checked: false },
    ])
  })
  it('ne duplique pas une création déjà arrivée au serveur', () => {
    const f = [a('insert', 'r1', { id: 'r1', label: 'pain' })]
    expect(appliquerActions(lignes, 'shopping_items', f)).toHaveLength(2)
  })
})
