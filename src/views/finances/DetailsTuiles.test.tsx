import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DetailReste } from './DetailsTuiles'

const html = (resteTuile: number) => renderToStaticMarkup(
  <DetailReste budget={6050} depense={5369} resteTuile={resteTuile}
    aVenir={{ total: 101, details: [{ nom: 'Courses (moyenne 3 mois)', montant: 101 }] }} epargnes={{ total: 0, details: [] }} />,
)
const texte = (h: string) => h.replace(/<[^>]+>/g, '|').replace(/\u202f|\u00a0/g, ' ').replace(/\|+/g, '|')

describe('détail de la tuile Reste', () => {
  it('à venir d’abord, puis Reste, puis le rappel (Budget − Déjà dépensé) avec les vrais chiffres', () => {
    const t = texte(html(580))
    expect(t.indexOf('À venir')).toBeGreaterThanOrEqual(0)
    expect(t.indexOf('À venir')).toBeLessThan(t.indexOf('Reste'))
    expect(t.indexOf('Reste')).toBeLessThan(t.indexOf('(Budget (6 050 €) - Déjà dépensé (5 369 €))'))
  })
  it('ne parle plus du capital remboursé ni d’un budget en tête de liste', () => {
    const t = texte(html(580))
    expect(t).not.toContain('capital')
    expect(t).not.toMatch(/\|Budget des dépenses/)
  })
  it('dépassement : « Au-delà du budget »', () => {
    expect(texte(html(-12))).toContain('Au-delà du budget')
  })
})
