import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
