// ================================================================
// HORIZON — Edge Function « horizon-news »
// Génère une synthèse d'actualités par sujet suivi (table news_topics),
// via Claude + l'outil de recherche web, et l'écrit dans news_digests.
// Déclenchée chaque matin (pg_cron) et par le bouton « Actualiser ».
//
// App perso mono-utilisateur : à chaque appel, on rafraîchit TOUS les
// sujets actifs. verify_jwt reste actif (cron envoie la clé anon).
//
// Secrets requis : ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SYSTEM = `Tu es le veilleur d'actualités d'Horizon. Pour le sujet donné, tu produis une synthèse FACTUELLE et RÉCENTE en français.

MÉTHODE :
- Utilise la recherche web pour trouver les nouvelles des ~15 derniers jours (grandes annonces, avancées, sorties, décisions notables). Ignore le vieux et l'anecdotique.
- Vérifie les dates : ne garde que le récent. Si l'info est plus ancienne mais structurante, précise la date.
- N'invente jamais. Si peu de nouvelles récentes, dis-le en une phrase plutôt que de meubler.

FORMAT DE RÉPONSE (texte brut, pas de Markdown, pas de titre) :
- 3 à 6 puces maximum, chacune commençant par « — ».
- Chaque puce : une actu, datée si possible (ex. « (12 août) »), une phrase claire, l'essentiel d'abord.
- Ton sobre et neutre, pas de superlatifs marketing.
- Ne cite pas les URL dans le texte : les sources sont jointes à part.`

type Source = { title: string; url: string }

async function synthByTopic(apiKey: string, label: string, prompt: string | null, today: string):
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
      system: SYSTEM,
      // max_uses volontairement bas : borne le coût (chaque recherche web ≈ 1 ¢).
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{
        role: 'user',
        content: `Nous sommes le ${today}. Fais la synthèse des actualités récentes sur ce sujet :\n`
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
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY manquante' }, 500)
    if (!url || !serviceKey) return json({ error: 'Config Supabase manquante' }, 500)

    const supabase = createClient(url, serviceKey)
    const today = new Date().toISOString().slice(0, 10)

    const { data: topics, error: tErr } = await supabase
      .from('news_topics').select('id, user_id, label, prompt').eq('active', true)
    if (tErr) return json({ error: tErr.message }, 500)

    let updated = 0
    const errors: { topic: string; error: string }[] = []

    for (const t of topics ?? []) {
      try {
        const { content, sources } = await synthByTopic(apiKey, t.label, t.prompt, today)
        // remplace la synthèse précédente du sujet
        await supabase.from('news_digests').delete().eq('topic_id', t.id)
        const { error: iErr } = await supabase.from('news_digests').insert({
          user_id: t.user_id, topic_id: t.id, content, sources, generated_at: new Date().toISOString(),
        })
        if (iErr) throw new Error(iErr.message)
        updated++
      } catch (e) {
        errors.push({ topic: t.label, error: e instanceof Error ? e.message : String(e) })
      }
    }

    return json({ ok: true, updated, total: (topics ?? []).length, errors })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
