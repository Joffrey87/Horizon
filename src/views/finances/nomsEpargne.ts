import { useHorizon } from '../../lib/store'

/** Noms affichés des lignes d'épargne (détail « Épargné ») : clé = nom d'origine (ligne ou « Capital <prêt> »), valeur = nom choisi.
 *  Valable pour tous les mois, passés compris. Dans la base (un layout), jamais dans le dépôt public. */
const PROJECTION = 'fin-noms-epargne'

type Noms = Record<string, string>

export function useNomsEpargne() {
  const layout = useHorizon((s) => s.layouts.find((l) => l.projection === PROJECTION))
  const noms = ((layout?.data as { noms?: Noms } | undefined)?.noms) ?? {}
  /** Nom à afficher pour un nom d'origine. */
  const nom = (origine: string) => noms[origine]?.trim() || origine
  const renomme = (origine: string) => !!noms[origine]?.trim()
  /** Fixe (ou, vide, retire) le nom affiché d'une ligne. */
  const renommer = async (origine: string, affiche: string) => {
    const s = useHorizon.getState()
    const cur = s.layouts.find((l) => l.projection === PROJECTION)
    const suivant: Noms = { ...(((cur?.data as { noms?: Noms } | undefined)?.noms) ?? {}) }
    const v = affiche.trim()
    if (v && v !== origine) suivant[origine] = v
    else delete suivant[origine]
    const data = { ...(cur?.data ?? {}), noms: suivant }
    if (cur) await s.update('layouts', cur.id, { data, updated_at: new Date().toISOString() })
    else await s.insert('layouts', { name: 'Noms des épargnes', projection: PROJECTION, is_default: false, data })
  }
  return { nom, renomme, renommer }
}
