import { describe, expect, it } from 'vitest'
import { chiffrer, creerCles, dechiffrer, MotDePasseIncorrect } from './chiffrement'

// Peu de tours en test : seule la mécanique est vérifiée ici.
describe('copie chiffrée des Finances', () => {
  it('se relit avec le bon mot de passe, et seulement avec lui', async () => {
    const cles = await creerCles('bon mot de passe', 1000)
    const donnees = { finTransactions: [{ id: 't1', amount: -42.5, label: 'Boulangerie' }], finLines: [] }
    const copie = await chiffrer(donnees, cles)
    // Rien de lisible dans la copie.
    expect(new TextDecoder().decode(copie.donnees)).not.toContain('Boulangerie')
    expect(await dechiffrer(copie, cles, 'bon mot de passe')).toEqual(donnees)
    await expect(dechiffrer(copie, cles, 'mauvais')).rejects.toBeInstanceOf(MotDePasseIncorrect)
  })

  it('chaque copie a sa propre clé', async () => {
    const cles = await creerCles('x', 1000)
    const a = await chiffrer({ n: 1 }, cles)
    const b = await chiffrer({ n: 1 }, cles)
    expect(new Uint8Array(a.cle)).not.toEqual(new Uint8Array(b.cle))
    expect(await dechiffrer(b, cles, 'x')).toEqual({ n: 1 })
  })
})
