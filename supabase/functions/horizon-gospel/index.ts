// ================================================================
// HORIZON — Edge Function « horizon-gospel » (mode 'quiz')
// Quiz sur le SENS d'un passage biblique : 3 questions, profondeur
// croissante selon `level`. Le passage lui-même vient de getbible.net
// (gratuit, sans clé) côté app — voir src/lib/bible.ts.
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

const QUIZ_SYSTEM = `Tu conçois un petit quiz sur un passage biblique pour aider l'utilisateur à en saisir et retenir le SENS.
Réponds STRICTEMENT en JSON valide (aucun texte hors JSON), de la forme :
{"level":<n>,"intro":"<courte phrase>","questions":[{"id":"q1","type":"qcm"|"texte","question":"...","choices":["...","..."],"answer":"...","hint":"..."}]}

OBJET DU QUIZ (essentiel) :
- Porte SURTOUT sur le SENS : le message central, la leçon à en tirer, ce que ça enseigne, la portée spirituelle, l'application concrète dans la vie.
- PARFOIS seulement (1 question au plus) sur un MOT ou une expression clé du passage (vocabulaire fort et son sens).
- N'interroge JAMAIS sur la syntaxe, la grammaire, l'ordre des versets ou des idées, ni sur du par-cœur mécanique.

FORME :
- EXACTEMENT 3 questions, en français, uniquement à partir du passage fourni.
- Ordonne les 3 questions en suivant le fil du passage (du début à la fin).
- Privilégie le type 'qcm' (3-4 propositions, "answer" = le texte exact de la bonne proposition), car il permet de tester le sens avec une bonne réponse défendable et des distracteurs plausibles mais erronés.
- N'utilise 'texte' que pour un mot/une expression clé précis du passage (réponse courte, "answer" = ce mot). Pas de type 'texte' pour une interprétation ouverte.
- Difficulté croissante = PROFONDEUR de compréhension, pas mémoire :
  * niveau 1 : le message central, la leçon évidente.
  * niveau 2 : l'application concrète (à quoi cela engage, comment le vivre).
  * niveau 3 : nuances et pièges d'interprétation, implications moins évidentes.
  * niveau 4+ : portée spirituelle profonde, exigence d'application personnelle, sens second.
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

    const { reference, passage, level } = await req.json()
    if (!reference) return json({ error: 'référence manquante' }, 400)

    const lvl = Math.max(1, Number(level) || 1)
    const raw = await callClaude(apiKey, QUIZ_SYSTEM,
      `Passage : ${reference}\n\nTEXTE :\n${passage ?? '(texte non fourni — appuie-toi sur la référence)'}\n\n`
      + `Génère le quiz au NIVEAU ${lvl}.`, 1200)
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
