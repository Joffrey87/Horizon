// ================================================================
// HORIZON — listes de vérification (checklists) : modèles + helpers
// Le contenu vit dans `Check.config` (jsonb) : aucune migration requise.
// ================================================================

import type { ChecklistConfig, ChecklistSection } from './types'

/** Identifiant court et unique pour une section / un item. */
export const uid = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2)}`)

const section = (title: string, labels: string[]): ChecklistSection => ({
  id: uid(), title, items: labels.map((label) => ({ id: uid(), label, done: false })),
})

/** Modèles pré-remplis par catégorie. « Vacances » = préparatifs départ / maison / route / retour. */
export function checklistTemplate(category: string): ChecklistConfig {
  const cat = category.trim().toLowerCase()
  if (cat === 'vacances') {
    return {
      category: 'Vacances',
      sections: [
        section('Avant le départ', [
          'Confirmer hébergement & transport',
          'Vérifier papiers (CNI / passeports / permis)',
          'Assurance & assistance à jour',
          'Faire les valises',
          'Trousse à pharmacie & médicaments',
          'Chargeurs, adaptateurs, batterie externe',
          'Retirer un peu d\'espèces',
          'Lecture / jeux / musique pour la route',
        ]),
        section('Maison (avant de partir)', [
          'Vider le frigo des périssables',
          'Sortir les poubelles',
          'Couper l\'eau et le gaz',
          'Baisser le chauffage / clim',
          'Débrancher les appareils',
          'Arroser les plantes / confier à un voisin',
          'Faire suivre / relever le courrier',
          'Vérifier fenêtres & portes verrouillées',
          'Programmer une lumière sur minuteur',
        ]),
        section('Voiture / trajet', [
          'Plein d\'essence',
          'Pneus, niveaux, lave-glace',
          'Itinéraire, péages, vignette',
          'Eau & en-cas pour la route',
        ]),
        section('Retour', [
          'Rallumer eau / gaz / chauffage',
          'Rebrancher les appareils',
          'Faire les courses de base',
          'Défaire les valises & lancer une lessive',
          'Trier le courrier accumulé',
          'Ranger photos & souvenirs',
        ]),
      ],
    }
  }
  // Catégorie libre : une liste vierge prête à remplir.
  return { category: category.trim() || undefined, sections: [{ id: uid(), title: 'À faire', items: [] }] }
}

/** Progression d'une liste : nombre d'items faits / total. */
export function checklistProgress(cfg: ChecklistConfig): { done: number; total: number } {
  let done = 0, total = 0
  for (const sec of cfg.sections ?? []) for (const it of sec.items) { total++; if (it.done) done++ }
  return { done, total }
}
