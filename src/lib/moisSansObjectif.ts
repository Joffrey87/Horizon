// Mois « sans objectif » : on affiche ce qui a été dépensé, sans budget ni reste par ligne.
// Pour en ajouter ou en retirer un, modifier cette liste (format AAAA-MM).
export const MOIS_SANS_OBJECTIF: readonly string[] = ['2026-08', '2026-09', '2026-10']

/** Seule ligne qui garde un repère ces mois-là : un anneau de remplissage (dépensé / budget), sans reste. */
export const LIGNE_AVEC_ANNEAU = 'fraisfixe'

export const estMoisSansObjectif = (mois: string, liste: readonly string[] = MOIS_SANS_OBJECTIF) => liste.includes(mois.slice(0, 7))

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '')
/** « Frais fixe » / « Frais fixes » (nom de ligne ou clé de tuile). */
export const estFraisFixe = (nomOuCle: string | null | undefined) => /^fraisfixes?$/.test(norm(nomOuCle ?? ''))
