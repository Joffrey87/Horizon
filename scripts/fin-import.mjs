// ================================================================
// Envoi d'un fichier d'extraction (ex. finary-AAAA-MM-JJ.json, produit par
// scripts/finary-extract.js) vers l'onglet Finances d'Horizon.
//
//   FIN_IMPORT_TOKEN=… node scripts/fin-import.mjs chemin/vers/finary-….json
//
// Le jeton est créé pour l'occasion dans la table `fin_import_tokens` (haché,
// valable 30 min) et désigne l'utilisateur : le script n'utilise que la clé
// publique « anon » du .env. L'import est idempotent (source + external_id) :
// relancer le même fichier ne crée aucun doublon.
// ================================================================
import { readFileSync } from 'node:fs'

const fichier = process.argv[2]
const jeton = process.env.FIN_IMPORT_TOKEN
if (!fichier || !jeton) {
  console.error('Usage : FIN_IMPORT_TOKEN=… node scripts/fin-import.mjs <fichier.json>')
  process.exit(1)
}

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]),
)
const url = env.VITE_SUPABASE_URL
const anon = env.VITE_SUPABASE_ANON_KEY
if (!url || !anon) { console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY absents du .env'); process.exit(1) }

const payload = JSON.parse(readFileSync(fichier, 'utf8'))
const { transactions = [], ...reste } = payload

const appel = async (corps) => {
  const r = await fetch(`${url}/rest/v1/rpc/fin_import`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: jeton, p_payload: corps }),
  })
  const texte = await r.text()
  if (!r.ok) throw new Error(`fin_import ${r.status} : ${texte.slice(0, 300)}`)
  return JSON.parse(texte)
}

// 1) Comptes, catégories, positions, patrimoine (les opérations s'y rattachent).
console.log('Comptes, catégories, positions, patrimoine :', await appel(reste))

// 2) Opérations, par lots (une requête raisonnable, des erreurs localisables).
const LOT = 800
let total = 0
for (let i = 0; i < transactions.length; i += LOT) {
  const r = await appel({ source: payload.source, transactions: transactions.slice(i, i + LOT) })
  total += r.operations
  console.log(`Opérations ${i + 1}–${Math.min(i + LOT, transactions.length)} : ${r.operations}`)
}
console.log(`Terminé : ${total} opérations sur ${transactions.length}.`)
