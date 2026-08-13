// ================================================================
// HORIZON — Edge Function « horizon-gospel » (mode 'quiz')
// Quiz sur un passage biblique : 4 questions (2 sur le sens, 2 de
// mémorisation du/des verset(s) essentiel(s)), profondeur croissante
// selon `level`, questions non répétées d'un niveau à l'autre.
// Le passage vient de getbible.net côté app (gratuit) — voir src/lib/bible.ts.
// Secret requis : ANTHROPIC_API_KEY
// ================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

async function callClaude(apiKey: string, system: string, user: string, maxTokens: number): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status} ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  return (data.content ?? []).filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text).join('\n').trim()
}

const QUIZ_SYSTEM = `Tu conçois un quiz sur un passage biblique. Réponds STRICTEMENT en JSON valide (aucun texte hors JSON) :
{"level":<n>,"intro":"<courte phrase>","questions":[{"id":"q1","type":"qcm"|"texte","question":"...","choices":["...","..."],"answer":"...","hint":"..."}]}

COMPOSITION — EXACTEMENT 4 questions, dans l'ordre du passage :
- 2 questions sur le SENS (message, leçon, application, portée spirituelle).
- 2 questions de MÉMORISATION du/des verset(s) ESSENTIEL(S) — en priorité le verset clé fourni — pour aider à le retenir PAR CŒUR.

FORMAT SELON LE NIVEAU (impératif) :
- Niveaux 1 et 2 : les 4 questions sont en 'qcm' (3-4 propositions, "answer" = le texte exact d'une proposition).
  * Les 2 questions de mémorisation = choisir la formulation ou le mot EXACT du verset parmi des propositions proches.
- Niveaux 3 et 4 :
  * Les 2 questions de SENS portent sur des NUANCES d'interprétation, en 'qcm'.
  * Les 2 questions de MÉMORISATION sont des TEXTES À TROUS, type 'texte' : cite une phrase du verset clé en remplaçant un ou plusieurs mots par « ___ » ; "answer" = le(s) mot(s) exact(s) manquant(s) (séparés par des espaces s'il y en a plusieurs).

RÈGLES :
- Uniquement à partir du passage fourni. En français.
- N'interroge JAMAIS sur la grammaire, la syntaxe, ou l'ordre des versets.
- Les questions doivent être NOUVELLES : ne reprends AUCUNE des questions déjà posées (liste fournie). Chaque niveau apporte d'autres questions.
- Profondeur STRICTEMENT croissante :
  * niveau 1 : sens évident + mémoriser un mot clé simple.
  * niveau 2 : application concrète (comment le vivre) + mémoriser une expression.
  * niveau 3 : PLUS LOIN — nuances et pièges d'interprétation + trous sur des expressions entières.
  * niveau 4+ : ENCORE PLUS LOIN — portée spirituelle profonde, exigence d'application personnelle + trous restituant presque tout le verset clé, avec parfois une nuance FINE à distinguer (un mot attendu qu'un synonyme proche ne remplacerait pas) pour vérifier la mémorisation précise — sans excès ni piège tordu.
- "hint" : indice court et optionnel.`

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
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY manquante' }, 500)

    const { reference, passage, level, keyVerse, verseRef, avoid } = await req.json()
    if (!reference) return json({ error: 'référence manquante' }, 400)

    const lvl = Math.max(1, Number(level) || 1)
    const avoidList = Array.isArray(avoid) ? (avoid as string[]).filter(Boolean) : []
    const user = `Passage : ${reference}\n`
      + (keyVerse ? `Verset clé (essentiel à mémoriser) : « ${keyVerse} » (${verseRef ?? ''})\n` : '')
      + `\nTEXTE :\n${passage ?? '(texte non fourni — appuie-toi sur la référence)'}\n\n`
      + (avoidList.length ? `Questions déjà posées aux niveaux précédents (NE LES REPRENDS PAS) :\n- ${avoidList.join('\n- ')}\n\n` : '')
      + `Génère le quiz au NIVEAU ${lvl}.`

    const raw = await callClaude(apiKey, QUIZ_SYSTEM, user, 1500)
    let quiz: unknown
    try {
      quiz = JSON.parse(raw)
    } catch {
      const m = raw.match(/\{[\s\S]*\}/)
      if (!m) return json({ error: 'quiz illisible' }, 502)
      quiz = JSON.parse(m[0])
    }
    return json({ quiz })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
