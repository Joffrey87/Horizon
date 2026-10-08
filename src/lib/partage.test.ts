// ================================================================
// Tests des règles de partage (partage.ts). La sécurité réelle est en base
// (policies RLS) ; ici on vérifie ce que l'écran et l'aperçu en font.
// ================================================================
import { describe, it, expect } from 'vitest'
import type { Partage, Project, Task } from './types'
import { ecriturePermise, pageAccueil, projetsVisibles, routeAutorisee, tachesVisibles, vueActive } from './partage'

const partage = (over: Partial<Partage> = {}): Partage => ({
  id: 'p1', owner_id: 'joffrey', member_email: 'h@ex.fr', member_name: 'Honorine', member_id: 'honorine', actif: true,
  onglets: ['finances', 'temps'], finances_classer: true, temps_projets_masques: ['secret'], temps_taches_masquees: true,
  created_at: '', ...over,
})
const tache = (over: Partial<Task>): Task => ({ id: Math.random().toString(), project_id: null, is_task: false, ...over } as Task)

describe('vue active', () => {
  it('le membre voit le partage reçu ; le propriétaire seulement en aperçu', () => {
    const p = partage()
    expect(vueActive({ partages: [p], moi: 'honorine', apercu: null })?.id).toBe('p1')
    expect(vueActive({ partages: [p], moi: 'joffrey', apercu: null })).toBeNull()
    expect(vueActive({ partages: [p], moi: 'joffrey', apercu: 'p1' })?.id).toBe('p1')
  })
})

describe('pages et écritures', () => {
  it('n’ouvre que Temps et budget / bilan / patrimoine', () => {
    const p = partage()
    expect(['/temps', '/temps/2026-10-09', '/finances', '/finances/bilan', '/finances/patrimoine'].every((c) => routeAutorisee(c, p))).toBe(true)
    expect(['/', '/finances/operations', '/finances/reglages', '/parametres', '/projets'].some((c) => routeAutorisee(c, p))).toBe(false)
    expect(pageAccueil(p)).toBe('/finances')
    expect(pageAccueil(partage({ onglets: ['temps'] }))).toBe('/temps')
  })
  it('rien tant que le partage n’est pas validé', () => {
    const p = partage({ actif: false })
    expect(routeAutorisee('/temps', p)).toBe(false)
    expect(pageAccueil(p)).toBeNull()
    expect(ecriturePermise('fin_transactions', p)).toBe(false)
  })
  it('ranger les opérations seulement, et seulement si permis', () => {
    expect(ecriturePermise('fin_transactions', partage())).toBe(true)
    expect(ecriturePermise('fin_labels', partage())).toBe(true)
    expect(ecriturePermise('tasks', partage())).toBe(false)
    expect(ecriturePermise('fin_budgets', partage())).toBe(false)
    expect(ecriturePermise('fin_transactions', partage({ finances_classer: false }))).toBe(false)
    expect(ecriturePermise('tasks', null)).toBe(true)
  })
})

describe('Temps partagé', () => {
  it('cache le projet masqué et, au besoin, les tâches', () => {
    const t = [tache({ id: 'evt' }), tache({ id: 'tache', is_task: true }), tache({ id: 'secret-evt', project_id: 'secret' })]
    expect(tachesVisibles(t, partage()).map((x) => x.id)).toEqual(['evt'])
    expect(tachesVisibles(t, partage({ temps_taches_masquees: false })).map((x) => x.id)).toEqual(['evt', 'tache'])
    const projets = [{ id: 'secret' }, { id: 'autre' }] as Project[]
    expect(projetsVisibles(projets, partage()).map((p) => p.id)).toEqual(['autre'])
  })
})
