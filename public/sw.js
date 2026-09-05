// ================================================================
// Service worker minimal : il existe pour qu'Android accepte d'INSTALLER
// Horizon (icône propre, raccourcis, cible de partage). Il ne met RIEN en
// cache — servir une version périmée de l'app serait pire que tout, et le
// hors-ligne se gère au niveau de la capture, pas ici.
// ================================================================

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
// Handler présent mais volontairement passif : le navigateur fait sa requête
// normale. Ne jamais appeler respondWith ici sans stratégie de péremption.
self.addEventListener('fetch', () => {})
