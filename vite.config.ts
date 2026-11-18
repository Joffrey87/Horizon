import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Hors ligne : après le build, écrit dans dist/sw.js la liste des fichiers de l'app
 *  et une version tirée de leur contenu (voir public/sw.js). Les fonds d'écran
 *  (22 Mo) n'y sont pas : ils se gardent au fil des jours, une fois vus. */
function horsLigne(): Plugin {
  let dist = ''
  return {
    name: 'horizon-hors-ligne',
    apply: 'build',
    configResolved(c) { dist = resolve(c.root, c.build.outDir) },
    closeBundle() {
      const fichiers: string[] = []
      const parcourir = (dossier: string) => {
        for (const nom of readdirSync(dossier)) {
          const chemin = join(dossier, nom)
          if (statSync(chemin).isDirectory()) parcourir(chemin)
          else fichiers.push(`/${relative(dist, chemin).split('\\').join('/')}`)
        }
      }
      parcourir(dist)
      const gardes = fichiers
        .filter((f) => f !== '/sw.js' && f !== '/demo.html' && !f.startsWith('/fonds/') && !f.endsWith('.map') && !f.endsWith('.txt'))
        .sort()
      const sw = join(dist, 'sw.js')
      const source = readFileSync(sw, 'utf8')
      // Le service worker lui-même compte : le corriger seul crée aussi une nouvelle version.
      const empreinte = createHash('sha256').update(source)
      for (const f of gardes) empreinte.update(f).update(readFileSync(join(dist, f)))
      const version = empreinte.digest('hex').slice(0, 12)
      const ligne = 'const PRECACHE = null // remplacé au build'
      if (!source.includes(ligne)) throw new Error('sw.js : ligne PRECACHE introuvable')
      writeFileSync(sw, source.replace(ligne, `const PRECACHE = ${JSON.stringify({ version, fichiers: gardes })}`))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), horsLigne()],
  // L'API AELF n'envoie plus d'en-tête CORS : on la sert depuis notre propre domaine (même règle dans vercel.json).
  server: { proxy: { '/aelf': { target: 'https://api.aelf.org', changeOrigin: true, rewrite: (p) => p.replace(/^\/aelf/, '') } } },
  build: {
    rollupOptions: {
      output: {
        // Le bundle partait en un seul fichier. On isole les dépendances dans un
        // chunk « vendor » mis en cache indépendamment du code applicatif —
        // SAUF React Flow (et ses dépendances d3), laissé au découpage dynamique
        // de /espace, sinon il repasserait dans le chargement du premier écran.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@xyflow') || id.includes('d3-') || id.includes('classcat')) return undefined
          return 'vendor'
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
})
