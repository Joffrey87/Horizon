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

/** Modèles pré-remplis par catégorie. « Vacances » = liste de référence, reprise de la
 *  « Préparation Voyage » (Notion) : préparatifs J-20 à J-7, valises, bonus, retour.
 *  Elle se copie puis se personnalise pour chaque voyage. */
export function checklistTemplate(category: string): ChecklistConfig {
  const cat = category.trim().toLowerCase()
  if (cat === 'vacances') {
    return {
      category: 'Vacances',
      sections: [
        section('Préparer le voyage (J-20 à J-7)', [
          'Préparer le trajet & les pauses',
          'Prévoir les horaires d’arrivée & de départ',
          'Prévenir les contacts (arrivée & départ)',
          'Vérifier le linge de la maison de vacances',
          'Vérifier l’assurance & le forfait internet',
          'Prévoir la garde des chats',
          'Prévoir les lessives',
          'Prévoir le rangement & le ménage de la maison',
          'Prévoir la messe du dimanche (et autres jours ?)',
          'Prévoir les activités',
          'Caler les RDV avec les amis',
          'Prévoir la sécurité de la maison',
        ]),
        section('Valises — indispensables', [
          'Habits — bas',
          'Habits — hauts',
          'Chaussures, chaussons',
          'Sous-vêtements',
          'Trousse de toilette',
          'Documents, portefeuille',
          'Portable chargé, chargeur',
          'Nourriture pour le voyage, eau',
          'Veste, manteau',
          'Valise adaptée, sacs de transport',
          'Réservations (hôtels, avions, transports)',
          'Médicaments, serviette',
          'Missel, chapelet',
          'Pyjama, boules Quies, bandeau',
          'Préparer la voiture',
          'Sécuriser la maison',
        ]),
        section('Bonus (selon le voyage)', [
          'Jeux',
          'Protection solaire',
          'Enceinte, écouteurs',
          'Glacière',
          'Parapluie, K-way',
          'Chaussures de rando',
          'Vêtements de sport',
          'Plage, piscine',
          'Livres',
          'PC, chargeur, souris',
          'Affaires des chats',
          'Affaires de ski',
          'Linge de lit',
          'Affaires de travail',
          'Nourriture qui va périmer',
          'Nettoyer',
        ]),
        section('Retour', [
          'Préparer le trajet retour & les pauses',
          'Prévoir les horaires de départ & d’arrivée',
          'Prévenir les contacts (départ & arrivée)',
          'Refaire les valises (indispensables + bonus)',
          'Rangement, ménage & nettoyage du logement',
          'Linge de la maison de vacances',
          'Lessives',
          'Nourriture qui va périmer',
          'Récupérer les chats',
          'Sécuriser la maison de vacances',
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
