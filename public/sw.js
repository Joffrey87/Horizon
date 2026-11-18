// ================================================================
// Service worker d'Horizon : l'app s'ouvre même sans réseau.
//
// - Au build, `vite.config.ts` (plugin « horizon-hors-ligne ») remplace la ligne
//   PRECACHE ci-dessous par la liste des fichiers de l'app et une version.
//   Chaque déploiement change donc ce fichier → le navigateur installe le
//   nouveau service worker de lui-même (mise à jour automatique).
// - Page (navigation) : réseau d'abord — en ligne, on a TOUJOURS la dernière
//   version ; sans réseau (ou réseau muet > 4 s), la page gardée.
// - Fichiers /assets/ (noms versionnés, jamais modifiés) : depuis le cache.
// - Images, polices, icônes : cache, rafraîchi en arrière-plan.
// - Supabase, AELF et tout autre site : jamais touchés (les données ont leur
//   propre copie sur l'appareil, voir src/lib/horsLigne/).
// En développement, PRECACHE reste null : le service worker ne fait rien.
// ================================================================

const PRECACHE = null // remplacé au build

const CACHE = PRECACHE ? `horizon-${PRECACHE.version}` : null
const CACHE_IMAGES = 'horizon-images'

self.addEventListener('install', (e) => {
  self.skipWaiting()
  if (!CACHE) return
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.fichiers.map((f) => new Request(f, { cache: 'reload' })))))
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    if (CACHE) {
      // Les versions précédentes s'en vont ; les images restent (elles ne changent pas).
      for (const nom of await caches.keys()) {
        if (nom.startsWith('horizon-') && nom !== CACHE && nom !== CACHE_IMAGES) await caches.delete(nom)
      }
    }
    await self.clients.claim()
  })())
})

/** Réseau d'abord, avec un délai : un réseau « présent » mais muet ne bloque pas l'ouverture. */
async function page(req) {
  const cache = await caches.open(CACHE)
  try {
    const rep = await Promise.race([
      fetch(req),
      new Promise((_, ko) => setTimeout(() => ko(new Error('délai')), 4000)),
    ])
    if (rep.ok) cache.put('/index.html', rep.clone())
    return rep
  } catch {
    return (await cache.match('/index.html', { ignoreVary: true })) ?? Response.error()
  }
}

async function depuisCache(req) {
  const garde = await caches.match(req, { ignoreVary: true })
  if (garde) return garde
  const rep = await fetch(req)
  if (rep.ok) (await caches.open(CACHE)).put(req, rep.clone())
  return rep
}

async function image(req) {
  const cache = await caches.open(CACHE_IMAGES)
  const garde = await caches.match(req, { ignoreVary: true }) // celles de l'app (précache) ou déjà vues
  const frais = fetch(req).then((rep) => { if (rep.ok) cache.put(req, rep.clone()); return rep }).catch(() => null)
  return garde ?? (await frais) ?? Response.error()
}

self.addEventListener('fetch', (e) => {
  if (!CACHE) return
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/aelf/') || url.pathname === '/sw.js') return
  if (req.mode === 'navigate') { e.respondWith(page(req)); return }
  if (url.pathname.startsWith('/assets/')) { e.respondWith(depuisCache(req)); return }
  if (/\.(png|jpe?g|webp|svg|ico|otf|ttf|woff2?)$/i.test(url.pathname)) { e.respondWith(image(req)); return }
  if (PRECACHE.fichiers.includes(url.pathname)) e.respondWith(depuisCache(req))
})
