// ================================================================
// HORIZON — Edge Function « horizon-news »
// Génère une synthèse d'actualités par sujet suivi (table news_topics),
// via Claude + l'outil de recherche web, et l'écrit dans news_digests.
// Déclenchée depuis l app : 1re visite du jour, ou bouton « Actualiser »
// (le cron serveur est désactivé — migration 015).
//
// Chaque appel ne rafraîchit QUE les sujets de l'utilisateur appelant
// (déduit du JWT) : la service-role key contourne RLS, le filtre est donc
// à notre charge — sans lui, tout compte créé déclenchait la facturation
// Anthropic de tous les utilisateurs.
//
// Secrets requis : ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Mode « jour » : la veille courante, strictement récente.
const SYSTEM_JOUR = `Tu es le veilleur d'actualités d'Horizon. Pour le sujet donné, tu produis une synthèse FACTUELLE et RÉCENTE en français.

FENÊTRE (règle absolue) :
- Uniquement des informations des 14 derniers jours. Rien de plus ancien, jamais, même si c'est important.
- PRIORITÉ à la semaine qui vient de s'écouler (7 derniers jours) : elle doit fournir la majorité des puces, et ces puces viennent en premier.
- Rejette tout ce qui date d'avant 2026 et tout ce dont tu ne peux pas vérifier la date.

MÉTHODE :
- Utilise la recherche web pour trouver les nouvelles de cette fenêtre (grandes annonces, avancées, sorties, décisions notables). Ignore l'anecdotique.
- Vérifie les dates avant de retenir une information ; en cas de doute sur la date, écarte-la.
- N'invente jamais. Si la fenêtre est pauvre, dis-le en une phrase plutôt que d'élargir la période ou de meubler.

FORMAT DE RÉPONSE (texte brut, pas de Markdown, pas de titre) :
- 3 à 6 puces maximum, chacune commençant par « — », de la plus récente/importante à la moins.
- Chaque puce : une actu, DATÉE (ex. « (12 août) »), une phrase claire, l'essentiel d'abord.
- Ton sobre et neutre, pas de superlatifs marketing.
- Ne cite pas les URL dans le texte : les sources sont jointes à part.`

// Mode « important » : la mémoire du sujet sur un trimestre.
const SYSTEM_IMPORTANT = `Tu es le veilleur d'actualités d'Horizon. Pour le sujet donné, tu retiens ce qui compte VRAIMENT sur les 3 derniers mois, en français.

FENÊTRE (règle absolue) :
- Uniquement des informations des 3 derniers mois, toutes en 2026. Rien de plus ancien.

MÉTHODE :
- Utilise la recherche web, puis sélectionne les 5 informations les plus STRUCTURANTES : ce dont on se souviendra dans six mois (sortie majeure, décision, rachat, résultat, rupture technique), pas le bruit hebdomadaire.
- Vérifie les dates. N'invente jamais : s'il y a moins de 5 faits marquants, donne-en moins.

FORMAT DE RÉPONSE (texte brut, pas de Markdown, pas de titre) :
- Exactement 5 puces maximum, chacune commençant par « — », classées de la plus importante à la moins.
- Chaque puce : une information, DATÉE (ex. « (12 juin) »), une phrase claire, et si utile un membre de phrase sur pourquoi ça compte.
- Ton sobre et neutre, pas de superlatifs marketing.
- Ne cite pas les URL dans le texte : les sources sont jointes à part.`

// Origines autorisées. `*` ouvrait la fonction — et la clé Anthropic qu'elle
// consomme — à n'importe quel site. Surchargeable par le secret ALLOWED_ORIGINS.
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS')
  ?? 'https://horizon-sigma-woad.vercel.app,http://localhost:5173')
  .split(',').map((o) => o.trim()).filter(Boolean)

/** Origine acceptée : liste explicite, plus les déploiements Vercel du projet
 *  (production et prévisualisations, dont l'URL change à chaque build). */
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

/** Utilisateur appelant, déduit du JWT de la requête — null si l'appel n'est pas
 *  authentifié. Sert à ne traiter QUE ses données (la service-role key ignore RLS). */
async function callerId(req: Request, url: string, serviceKey: string): Promise<string | null> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return null
  const { data, error } = await createClient(url, serviceKey).auth.getUser(jwt)
  if (error || !data.user) return null
  return data.user.id
}

type Source = { title: string; url: string }
type Mode = 'jour' | 'important'

/** Date ISO décalée de n jours (fenêtres passées au modèle). */
function shiftDays(today: string, days: number): string {
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function synthByTopic(apiKey: string, label: string, prompt: string | null, today: string, mode: Mode):
  Promise<{ content: string; sources: Source[] }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      system: mode === 'important' ? SYSTEM_IMPORTANT : SYSTEM_JOUR,
      // max_uses volontairement bas : borne le coût (chaque recherche web ≈ 1 ¢).
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{
        role: 'user',
        content: `Nous sommes le ${today}.\n`
          + (mode === 'important'
            ? `Retiens les informations les plus importantes du ${shiftDays(today, -92)} au ${today} sur ce sujet :\n`
            : `Fenêtre : du ${shiftDays(today, -14)} au ${today}, en privilégiant le ${shiftDays(today, -7)} → ${today}.\n`
              + `Fais la synthèse des actualités de cette fenêtre sur ce sujet :\n`)
          + `SUJET : ${label}\n`
          + (prompt ? `PRÉCISIONS : ${prompt}\n` : '')
          + `\nCherche sur le web puis rédige la synthèse selon le format demandé.`,
      }],
    }),
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Anthropic ${res.status} ${detail.slice(0, 300)}`)
  }

  const data = await res.json()
  const blocks: unknown[] = Array.isArray(data.content) ? data.content : []

  const content = blocks
    .filter((b): b is { type: string; text: string } =>
      typeof b === 'object' && b !== null && (b as { type?: string }).type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()

  // Sources : agrégées depuis les résultats de recherche web
  const seen = new Set<string>()
  const sources: Source[] = []
  for (const b of blocks) {
    const blk = b as { type?: string; content?: unknown }
    if (blk.type !== 'web_search_tool_result' || !Array.isArray(blk.content)) continue
    for (const r of blk.content as { type?: string; url?: string; title?: string }[]) {
      if (r.type !== 'web_search_result' || !r.url || seen.has(r.url)) continue
      seen.add(r.url)
      sources.push({ title: r.title || r.url, url: r.url })
      if (sources.length >= 8) break
    }
  }

  return { content: content || 'Pas de nouvelle récente marquante trouvée sur ce sujet.', sources }
}

Deno.serve(async (req) => {
  const cors = corsFor(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY manquante' }, 500)
    if (!url || !serviceKey) return json({ error: 'Config Supabase manquante' }, 500)

    const uid = await callerId(req, url, serviceKey)
    if (!uid) return json({ error: 'Appel non authentifié' }, 401)

    const supabase = createClient(url, serviceKey)
    const today = new Date().toISOString().slice(0, 10)

    // mode « jour » (veille quotidienne) ou « important » (top 5 du trimestre).
    let mode: Mode = 'jour'
    try {
      const body = await req.json() as { mode?: string }
      if (body?.mode === 'important') mode = 'important'
    } catch { /* pas de corps (cron) : mode jour */ }

    const { data: topics, error: tErr } = await supabase
      .from('news_topics').select('id, user_id, label, prompt')
      .eq('active', true).eq('user_id', uid)
    if (tErr) return json({ error: tErr.message }, 500)

    let updated = 0
    const errors: { topic: string; error: string }[] = []

    for (const t of topics ?? []) {
      try {
        const { content, sources } = await synthByTopic(apiKey, t.label, t.prompt, today, mode)
        // remplace la synthèse précédente du sujet pour ce mode (l'autre est conservée)
        await supabase.from('news_digests').delete().eq('topic_id', t.id).eq('kind', mode)
        const { error: iErr } = await supabase.from('news_digests').insert({
          user_id: t.user_id, topic_id: t.id, kind: mode, content, sources,
          generated_at: new Date().toISOString(),
        })
        if (iErr) throw new Error(iErr.message)
        updated++
      } catch (e) {
        errors.push({ topic: t.label, error: e instanceof Error ? e.message : String(e) })
      }
    }

    return json({ ok: true, mode, updated, total: (topics ?? []).length, errors })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
