// ================================================================
// Points d'entrée de l'app. Horizon s'ouvre sur l'Agenda ; le tableau de bord
// (l'ancien « / ») vit sur /accueil et reste dans le menu.
// ================================================================

/** Où l'on atterrit en ouvrant l'app : « / », le lancement de la PWA (start_url) et toute adresse inconnue. */
export const PAGE_OUVERTURE = '/temps'
/** Le tableau de bord (Accueil) : menu « Accueil », logo, « Retour à l'accueil ». */
export const ROUTE_ACCUEIL = '/accueil'
/** Raccourci caddie de l'Agenda : la page Listes, positionnée sur la liste « Courses ». */
export const ROUTE_COURSES = '/verifications/listes?liste=courses'
