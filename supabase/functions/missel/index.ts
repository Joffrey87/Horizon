// ================================================================
// HORIZON — Edge Function « missel »
// Jour liturgique selon le MISSEL DE 1962 (forme extraordinaire) et ses
// propres en français. Le jour est déterminé par la LITURGIE (fête, dimanche
// après la Pentecôte…), pas par la date : c'est le missel qui commande.
//
//  - calendrier : missalemeum.com — implémente les rubriques de 1962, dont la
//    précédence des fêtes sur le dimanche. Appelé ici et pas dans le navigateur
//    parce que ce site n'autorise pas le CORS ;
//  - texte français : fichiers de Divinum Officium (missa/Francais), dont
//    missalemeum tire lui-même ses propres.
//
// Aucun appel à un modèle : cette fonction ne coûte rien.
// Secrets requis : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (pour authentifier
// l'appelant — la fonction ne lit ni n'écrit aucune donnée utilisateur).
// ================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CALENDAR_API = 'https://www.missalemeum.com/en/api/v5/proper'
const PROPERS_RAW = 'https://raw.githubusercontent.com/DivinumOfficium/divinum-officium/master/web/www/missa'

// Origines autorisées, surchargeables par le secret ALLOWED_ORIGINS.
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS')
  ?? 'https://horizon-sigma-woad.vercel.app,http://localhost:5173')
  .split(',').map((o) => o.trim()).filter(Boolean)

/** Origine acceptée : liste explicite, plus les déploiements Vercel du projet. */
function allowed(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true
  return /^https:\/\/horizon-[a-z0-9-]+\.vercel\.app$/.test(origin)
}

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': allowed(origin) ? origin : (ALLOWED_ORIGINS[0] ?? ''),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  }
}

/** Appel authentifié seulement — la fonction est un simple relais, on ne
 *  l'ouvre pas à tout Internet. */
async function isCaller(req: Request, url: string, serviceKey: string): Promise<boolean> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return false
  const { data, error } = await createClient(url, serviceKey).auth.getUser(jwt)
  return !error && !!data.user
}

// ---- lecture des fichiers Divinum Officium -------------------------------

/** Contenu d'une section `[Nom]` d'un fichier de propre, sans son en-tête. */
function section(file: string, name: string): string | null {
  const start = file.indexOf(`[${name}]`)
  if (start === -1) return null
  const from = start + name.length + 2
  const rest = file.slice(from)
  const next = rest.search(/\n\[[A-Za-zÀ-ÿ]+\]/)
  return (next === -1 ? rest : rest.slice(0, next)).trim()
}

type Lecture = { ref: string; incipit: string; texte: string }

/** Une lecture : ligne d'incipit latin, puis `!Référence`, puis le texte français.
 *  Les lignes de rubrique (`&`, `$`) et les marques de mise en page sont retirées. */
function lecture(block: string | null): Lecture | null {
  if (!block) return null
  const lines = block.split('\n').map((l) => l.trimEnd())
  const refIdx = lines.findIndex((l) => l.startsWith('!'))
  if (refIdx === -1) return null
  const incipit = lines.slice(0, refIdx).join(' ').trim()
  const ref = (lines[refIdx] ?? '').slice(1).trim()
  const texte = lines.slice(refIdx + 1)
    .filter((l) => !l.startsWith('&') && !l.startsWith('$') && !l.startsWith('!'))
    .map((l) => l.replace(/^v\.\s*/, '').replace(/_+/g, '').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!texte) return null
  return { ref, incipit, texte }
}

/** Nom latin de la fête, tiré de la section [Rank] (« In Assumptione… »). */
function nomLatin(file: string): string {
  const rank = section(file, 'Rank')
  return rank ? (rank.split('\n')[0] ?? '').split(';;')[0]?.trim() ?? '' : ''
}

/** `tempora:Pent14-0:2:g` → `Tempora/Pent14-0`, `sancti:08-15:1:w` → `Sancti/08-15`. */
function cheminPropre(id: string): string | null {
  const [famille, cle] = id.split(':')
  if (!famille || !cle) return null
  const dossier = famille === 'sancti' ? 'Sancti' : famille === 'tempora' ? 'Tempora' : null
  if (!dossier) return null
  return `${dossier}/${cle}`
}

/** Fichier de propre : français d'abord, latin en repli si la traduction manque. */
async function fichierPropre(chemin: string): Promise<{ texte: string; langue: 'fr' | 'la' } | null> {
  for (const [dossier, langue] of [['Francais', 'fr'], ['Latin', 'la']] as const) {
    const res = await fetch(`${PROPERS_RAW}/${dossier}/${chemin}.txt`)
    if (res.ok) return { texte: await res.text(), langue }
  }
  return null
}

Deno.serve(async (req) => {
  const cors = corsFor(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
    })

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !serviceKey) return json({ error: 'Config Supabase manquante' }, 500)
    if (!await isCaller(req, url, serviceKey)) return json({ error: 'Appel non authentifié' }, 401)

    let date = ''
    try { date = ((await req.json()) as { date?: string })?.date ?? '' } catch { /* pas de corps */ }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'date attendue (yyyy-mm-dd)' }, 400)

    // 1. Quel jour liturgique ? (le calendrier applique la précédence des fêtes)
    const calRes = await fetch(`${CALENDAR_API}/${date}`)
    if (!calRes.ok) return json({ error: `calendrier indisponible (${calRes.status})` }, 502)
    const jours = await calRes.json() as { info?: { id?: string; title?: string; rank?: number } }[]
    const info = jours?.[0]?.info
    const id = info?.id ?? ''
    const chemin = cheminPropre(id)
    if (!chemin) return json({ error: `jour liturgique illisible (${id})` }, 502)

    // 2. Ses propres, en français
    const fichier = await fichierPropre(chemin)
    if (!fichier) return json({ error: `propre introuvable (${chemin})` }, 502)

    return json({
      date,
      id,
      cle: chemin.split('/')[1] ?? '',
      titreEn: info?.title ?? '',
      titreLatin: nomLatin(fichier.texte),
      rang: info?.rank ?? null,
      langue: fichier.langue,
      epitre: lecture(section(fichier.texte, 'Lectio')),
      evangile: lecture(section(fichier.texte, 'Evangelium')),
    })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
