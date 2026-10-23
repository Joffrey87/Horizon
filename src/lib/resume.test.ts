import { describe, expect, it } from 'vitest'
import type { FinLine } from './types'
import type { LigneBudget } from './finances'
import { PAGES_FINANCES, pagesFinancesVisibles } from './financesNav'
import { BUDGETS_RESUME, COULEURS_ANNEAU, eclaircie, ligneParNom, rgba, tonAnneau, tuileBudget, tuilesBudgets } from './resume'

const ligne = (name: string, kind: FinLine['kind'] = 'depense', id = name): FinLine =>
  ({ id, user_id: 'u', name, kind, color: null, sort_order: 0, created_at: '2026-01-01' })
const lb = (l: FinLine, budget: number | null, reel: number): LigneBudget =>
  ({ cle: l.id, ligne: l, budget, reel, precedent: 0, moyenne3: 0, prevision: null, previsionSaisie: false })

describe('couleur de l’anneau', () => {
  it('vert sous 75 %', () => {
    expect(tonAnneau(0)).toBe('ok')
    expect(tonAnneau(0.5)).toBe('ok')
    expect(tonAnneau(0.7499)).toBe('ok')
  })
  it('ambre de 75 % à 100 % inclus', () => {
    expect(tonAnneau(0.75)).toBe('attention')
    expect(tonAnneau(0.93)).toBe('attention')
    expect(tonAnneau(1)).toBe('attention')
  })
  it('rouge-orangé au-delà de 100 %', () => {
    expect(tonAnneau(1.0001)).toBe('depasse')
    expect(tonAnneau(1.09)).toBe('depasse')
    expect(tonAnneau(3)).toBe('depasse')
  })
  it('neutre sans budget', () => {
    expect(tonAnneau(null)).toBe('neutre')
    expect(tonAnneau(Number.NaN)).toBe('neutre')
  })
  it('aucun bleu dans la palette', () => {
    for (const c of Object.values(COULEURS_ANNEAU)) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number]
      expect(b).toBeLessThan(Math.max(r, g))
    }
  })
})

describe('recherche d’une ligne de budget par nom', () => {
  const lignes = [ligne('Frais fixe'), ligne('Courses'), ligne('AMENAGEMENT'), ligne('Dons'), ligne('Dépenses courantes (hors loyer)'),
    ligne('Épargne Courses', 'epargne'), ligne('Vacances')]
  it('trouve sans tenir compte de la casse ni des accents', () => {
    expect(ligneParNom(lignes, ['amenagement'])?.name).toBe('AMENAGEMENT')
    expect(ligneParNom(lignes, ['courses'])?.name).toBe('Courses')
  })
  it('accepte un nom plus long qui contient les mots voulus', () => {
    expect(ligneParNom(lignes, ['depenses courantes'])?.name).toBe('Dépenses courantes (hors loyer)')
  })
  it('préfère le nom exact et ignore les lignes d’épargne', () => {
    expect(ligneParNom([ligne('Épargne Courses', 'epargne'), ligne('Courses annexes'), ligne('Courses')], ['courses'])?.name).toBe('Courses')
    expect(ligneParNom([ligne('Courses', 'epargne')], ['courses'])).toBeUndefined()
  })
  it('ne confond pas « dons » avec un mot qui le contient', () => {
    expect(ligneParNom([ligne('Abandons')], ['dons'])).toBeUndefined()
  })
  it('absente : undefined, et la tuile est signalée absente', () => {
    expect(ligneParNom(lignes, ['depenses exceptionnelles'])).toBeUndefined()
    const t = tuilesBudgets(lignes.map((l) => lb(l, 100, 10)))
    expect(t.map((x) => x.titre)).toEqual(BUDGETS_RESUME.map((d) => d.titre))
    expect(t.find((x) => x.cle === 'exceptionnelles')?.absente).toBe(true)
    expect(t.find((x) => x.cle === 'courses')?.absente).toBe(false)
    expect(t.find((x) => x.cle === 'courantes')?.budget).toBe(100)
  })
})

describe('noms réels des lignes du budget du foyer', () => {
  const noms = ['Dépenses exceptionnelles', 'Dépenses courantes', 'Frais fixe', 'Courses', 'Dons', 'Vacances', 'Aménagement']
  const lignes = [...noms.map((n) => lb(ligne(n), 100, 10)), lb(ligne('Épargne vacances', 'epargne'), 50, 0), lb(ligne('Épargne avenir', 'epargne'), 50, 0)]
  it('retrouve les sept budgets dont « Frais fixe », jamais une épargne', () => {
    const t = tuilesBudgets(lignes)
    expect(t.every((x) => !x.absente)).toBe(true)
    expect(t.map((x) => x.titre)).toEqual(['Courses', 'Aménagement', 'Vacances', 'Dépenses courantes', 'Dépenses exceptionnelles', 'Frais fixe', 'Dons'])
  })
})

describe('données d’une tuile', () => {
  const def = { cle: 'courses', titre: 'Courses' }
  it('restant, part consommée et ton', () => {
    const t = tuileBudget(def, lb(ligne('Courses'), 400, 373))
    expect(t.restant).toBe(27)
    expect(t.ratio).toBeCloseTo(0.9325)
    expect(t.ton).toBe('attention')
  })
  it('dépassement : restant négatif, ton rouge-orangé', () => {
    const t = tuileBudget(def, lb(ligne('Courses'), 350, 383))
    expect(t.restant).toBe(-33)
    expect(t.ton).toBe('depasse')
  })
  it('budget absent ou à 0 : pas d’anneau, dépensé seulement', () => {
    for (const budget of [null, 0]) {
      const t = tuileBudget(def, lb(ligne('Courses'), budget, 42))
      expect(t.restant).toBeNull()
      expect(t.ratio).toBeNull()
      expect(t.ton).toBe('neutre')
      expect(t.depense).toBe(42)
    }
  })
  it('remboursement net (dépense négative) : l’anneau reste à 0 %', () => {
    expect(tuileBudget(def, lb(ligne('Courses'), 100, -20)).ratio).toBe(0)
  })
})

describe('navigation Finances', () => {
  it('Résumé est la première page et la route d’entrée ; Budget garde son nom', () => {
    expect(PAGES_FINANCES[0]).toMatchObject({ to: '/finances', label: 'Résumé', end: true })
    expect(PAGES_FINANCES.map((p) => p.label)).toEqual(['Résumé', 'Budget', 'Bilan', 'Opérations', 'Patrimoine', 'Investissements', 'À venir', 'Réglages'])
    expect(PAGES_FINANCES.find((p) => p.label === 'Budget')?.to).toBe('/finances/budget')
  })
  it('Résumé et Budget restent ouverts au partage', () => {
    const vue = { } as never
    expect(pagesFinancesVisibles(vue).map((p) => p.label)).toEqual(['Résumé', 'Budget', 'Bilan', 'Patrimoine'])
  })
})

describe('tuiles du Résumé (maquette C)', () => {
  it('ordre : Courses, Aménagement, Vacances, courantes, exceptionnelles, puis Dons à part', () => {
    expect(BUDGETS_RESUME.map((d) => d.cle)).toEqual(['courses', 'amenagement', 'vacances', 'courantes', 'exceptionnelles', 'fraisfixe', 'dons'])
    expect(BUDGETS_RESUME.filter((d) => d.separe).map((d) => d.cle)).toEqual(['dons'])
  })
  it('aucune teinte bleue (teinte hors de 190°–250°)', () => {
    for (const { rvb: [r, g, b] } of BUDGETS_RESUME) {
      const max = Math.max(r, g, b), min = Math.min(r, g, b)
      if (max === min) continue
      const h = max === r ? (((g - b) / (max - min)) * 60 + 360) % 360 : max === g ? ((b - r) / (max - min)) * 60 + 120 : ((r - g) / (max - min)) * 60 + 240
      expect(h < 190 || h > 250).toBe(true)
    }
  })
  it('rgba et éclaircie', () => {
    expect(rgba([10, 20, 30], 0.5)).toBe('rgba(10,20,30,0.5)')
    expect(eclaircie([0, 0, 0], 0.5)).toMatch(/^rgb\(128,128,128\)$|^rgb\(127,127,127\)$/)
  })
  it('la tuile porte la couleur et le drapeau « séparé »', () => {
    const t = tuilesBudgets([lb(ligne('Dons'), 300, 30)]).find((x) => x.cle === 'dons')!
    expect(t.separe).toBe(true)
    expect(t.rvb).toEqual(BUDGETS_RESUME.find((d) => d.cle === 'dons')!.rvb)
    expect(t.ligneId).toBe('Dons')
  })
})
