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

QUALITÉ DES PROPOSITIONS (le cœur du travail — vaut à TOUS les niveaux) :
- Les propositions d'un QCM sont TOUTES du même registre et toutes crédibles : quatre vertus, quatre attitudes justes, quatre lectures spirituelles recevables. JAMAIS une bonne réponse entourée de vices, d'absurdités ou de contre-sens grossiers : ce serait trop facile.
- Ce qui distingue la bonne réponse : elle est ce que dit CE passage-ci. Les autres sont vraies en général, ou vraies ailleurs dans l'Écriture, mais ABSENTES de ce passage. On teste la lecture attentive, pas le bon sens.
- Pour la mémorisation : les distracteurs sont des synonymes ou des mots du même champ lexical (registre identique, même connotation) ; seul le mot ou la formulation EXACTE du texte est correcte.
- Aucune proposition ne doit se trahir par sa longueur, son ton ou sa précision : longueurs comparables, même style.
- L'ORDRE des propositions doit varier : la bonne réponse ne doit pas se trouver systématiquement en premier — répartis-la au hasard dans la liste.

FORMAT SELON LE NIVEAU (impératif) :
- Niveaux 1 et 2 : les 4 questions sont en 'qcm' (4 propositions, "answer" = le texte exact d'une proposition).
  * Les 2 questions de mémorisation = choisir la formulation ou le mot EXACT du verset parmi des propositions proches.
- Niveaux 3 et 4 :
  * Les 2 questions de SENS portent sur des NUANCES d'interprétation, en 'qcm'.
  * Les 2 questions de MÉMORISATION sont des TEXTES À TROUS, type 'texte' : cite une phrase du verset clé en remplaçant quelques mots par « ___ » ; "answer" = le(s) mot(s) exact(s) manquant(s), dans l'ordre, séparés par des espaces.

RÈGLES :
- Uniquement à partir du passage fourni. En français.
- N'interroge JAMAIS sur la grammaire, la syntaxe, ou l'ordre des versets.
- Les questions doivent être NOUVELLES : ne reprends AUCUNE des questions déjà posées (liste fournie). Chaque niveau apporte d'autres questions.
- Profondeur STRICTEMENT croissante — mais AUCUN niveau n'est facile ni évident :
  * niveau 1 : ce que dit VRAIMENT le passage, parmi quatre lectures toutes plausibles spirituellement (trois sont justes ailleurs, pas ici) + mémoriser le mot exact contre des synonymes proches.
  * niveau 2 : l'application concrète que CE passage demande, distinguée d'applications voisines et également bonnes en soi + mémoriser une expression exacte contre des variantes du même champ lexical.
  * niveau 3 : PLUS LOIN — nuances et pièges d'interprétation, ce que le texte ne dit PAS malgré les apparences + trous sur des expressions entières.
  * niveau 4 : ENCORE PLUS LOIN — portée spirituelle profonde, exigence d'application personnelle + trous plus larges, avec parfois une nuance FINE à distinguer (un mot attendu qu'un synonyme proche ne remplacerait pas) — sans excès ni piège tordu.
- TEXTES À TROUS — jamais de restitution à l'aveugle : la phrase citée garde TOUJOURS au moins la moitié de ses mots visibles, qui servent d'appui. Les « ___ » portent sur les mots porteurs de sens, au plus 3 par question, et jamais deux trous côte à côte. Ne demande jamais de redonner un verset entier de mémoire.
- Ce qui aiderait à répondre va DANS la question (contexte, début de la phrase, mots voisins), pas seulement dans "hint".
- "hint" : indice court et optionnel.`

/** Mélange les propositions de chaque QCM : la bonne réponse ne doit pas se
 *  retrouver toujours en tête (le modèle a tendance à la placer en premier). */
function shuffleChoices(quiz: unknown): unknown {
  const q = quiz as { questions?: { choices?: unknown }[] }
  for (const question of q?.questions ?? []) {
    const choices = question?.choices
    if (!Array.isArray(choices) || choices.length < 2) continue
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = choices[i]; choices[i] = choices[j]; choices[j] = tmp
    }
  }
  return quiz
}

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

Deno.serve(async (req) => {
  const cors = corsFor(req)
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
    return json({ quiz: shuffleChoices(quiz) })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
