// ================================================================
// HORIZON — Edge Function « horizon-gospel » (mode 'quiz')
// Quiz sur un passage biblique. Deux formats :
//  - 'jour'     : 5 questions (3 sur le SENS + 2 textes à trous), profondeur
//                 croissante selon `level`, sans répéter les questions déjà posées ;
//  - 'revision' : 4 questions (2 sens + 2 trous) à profondeur STABLE et profonde,
//                 pour revoir en fin de semaine un évangile déjà travaillé (profondeur du niveau 3).
// Le passage vient de getbible.net côté app (gratuit) — voir src/lib/bible.ts.
// Chaque appel au modèle est consigné dans `ai_usage` (suivi de la consommation).
// Secrets requis : ANTHROPIC_API_KEY (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY : fournis par Supabase)
// ================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const MODEL = 'claude-sonnet-4-5'

type Usage = { input_tokens?: number; output_tokens?: number; server_tool_use?: { web_search_requests?: number } }

async function callClaude(apiKey: string, system: string, user: string, maxTokens: number):
  Promise<{ text: string; usage?: Usage }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status} ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  const text = (data.content ?? []).filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text).join('\n').trim()
  return { text, usage: data.usage as Usage | undefined }
}

/** Utilisateur appelant, déduit du JWT. Null si la clé anon ou un jeton invalide. */
async function callerId(req: Request): Promise<string | null> {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!url || !serviceKey || !jwt) return null
  const { data, error } = await createClient(url, serviceKey).auth.getUser(jwt)
  return error || !data.user ? null : data.user.id
}

/** Consigne la consommation d'un appel. Ne doit JAMAIS faire échouer la requête :
 *  le suivi est secondaire, le quiz passe avant. */
async function logUsage(uid: string | null, detail: string, usage: Usage | undefined): Promise<void> {
  if (!uid || !usage) return
  try {
    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !serviceKey) return
    const { error } = await createClient(url, serviceKey).from('ai_usage').insert({
      user_id: uid, fn: 'gospel', detail, model: MODEL,
      input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0,
      web_searches: usage.server_tool_use?.web_search_requests ?? 0,
    })
    if (error) console.error('ai_usage :', error.message)
  } catch (e) { console.error('ai_usage :', e) }
}

type Format = 'jour' | 'revision'

const COMPOSITION_JOUR = `COMPOSITION — EXACTEMENT 5 questions, dans l'ordre du passage :
- q1, q2, q3 : le SENS, en 'qcm'. C'est le cœur du quiz.
- q4, q5 : la MÉMORISATION du verset clé, en TEXTE À TROUS (type 'texte').`

const COMPOSITION_REVISION = `COMPOSITION — EXACTEMENT 4 questions, dans l'ordre du passage :
- q1, q2 : le SENS, en 'qcm'. C'est le cœur du quiz.
- q3, q4 : la MÉMORISATION du verset clé, en TEXTE À TROUS (type 'texte').`

// La montée est rapide : le niveau 1 part déjà du message ET de son application ; le niveau 4 va au-delà du seul
// passage, dans la lecture de l'Église.
const PROFONDEUR_JOUR = `PROFONDEUR SELON LE NIVEAU — la compréhension se creuse vite, jamais la difficulté gratuite :
* niveau 1 : le message central ET ce à quoi il engage concrètement — comment le vivre. Trous : un à deux mots porteurs.
* niveau 2 : nuances, implications moins évidentes et sens second : ce que le passage révèle du Christ, de Dieu, de l'homme. Trous : de courtes expressions.
* niveau 3 : portée spirituelle profonde — conversion du cœur, exigence personnelle, ce que le passage dénonce ou purifie en nous. Trous : jusqu'à 3 mots, expressions entières.
* niveau 4 : le sommet — lecture de l'Église. Typologie et accomplissement (figures de l'Ancien Testament, prophéties), les quatre sens de l'Écriture (littéral, allégorique, moral, anagogique), enseignement des Pères et du Catéchisme, vérité théologique (Trinité, Incarnation, grâce, salut, sacrements), discernement des intentions et des mouvements intérieurs. Trous : expressions entières, jusqu'à 3 trous.`

// Révision de fin de semaine : l'évangile a déjà été travaillé, on reste à la
// profondeur du niveau 3 pour tous les jours révisés (pas de progression).
const PROFONDEUR_REVISION = `PROFONDEUR — RÉVISION, niveau profond et STABLE (l'équivalent du niveau 3) :
* Les questions de sens portent sur la portée spirituelle profonde et l'exigence d'application personnelle, pas sur la leçon de surface.
* Les trous font jusqu'à 3 mots et peuvent porter sur des expressions entières.
* Ce passage a déjà été étudié cette semaine : on vérifie ce qui en reste, sans le réexpliquer.`

const quizSystem = (composition: string, profondeur: string) => `Tu conçois un quiz sur un passage biblique pour aider l'utilisateur à en saisir le SENS, puis à mémoriser le verset clé.
Réponds STRICTEMENT en JSON valide (aucun texte hors JSON), de la forme :
{"level":<n>,"intro":"<courte phrase>","questions":[{"id":"q1","type":"qcm"|"texte","question":"...","choices":["...","..."],"answer":"...","hint":"..."}]}

${composition}

LES QUESTIONS DE SENS :
- Elles portent sur le message central, la leçon à en tirer, ce que le passage enseigne, sa portée spirituelle, son application concrète dans la vie.
- N'interroge JAMAIS sur la syntaxe, la grammaire, l'ordre des versets ou des idées, ni sur du par-cœur mécanique : la mémorisation est le rôle des questions à trous.
- Ce sont de vraies questions de compréhension, pas des devinettes ni des pièges : la bonne réponse est défendable à partir du passage, quelqu'un qui l'a lu et compris doit pouvoir la trouver.
- Au niveau 4, tu peux t'appuyer sur la Tradition de l'Église catholique (Pères, Catéchisme, liens avec l'Ancien Testament) : la bonne réponse reste fidèle à la doctrine de l'Église, jamais une opinion d'auteur, et "hint" dit sur quoi elle s'appuie (ex. « cf. Is 53 », « saint Augustin », « CEC 1430 »). N'invente JAMAIS une citation ni une référence.
- 4 propositions, "answer" = le texte exact de la bonne proposition.
- Les propositions sont plausibles et du même registre, les mauvaises étant erronées au regard de CE passage — jamais d'absurdité ni de contre-sens grossier qui se repère à l'œil.
- Longueurs et style comparables : aucune proposition ne doit se trahir par sa précision ou sa longueur. Fais VARIER la position de la bonne réponse.

LES 2 TEXTES À TROUS :
- Type 'texte', SANS "choices". Cite une phrase du verset clé fourni (à défaut, du verset le plus marquant du passage) en remplaçant des mots par « ___ ».
- "answer" = le(s) mot(s) exact(s) manquant(s), dans l'ordre, séparés par des espaces.
- Jamais de restitution à l'aveugle : la phrase citée garde TOUJOURS au moins la moitié de ses mots visibles, qui servent d'appui. Au plus 3 trous par question, jamais deux trous côte à côte, toujours sur des mots porteurs de sens.
- Ne demande jamais de redonner un verset entier de mémoire.
- Les deux portent sur deux endroits différents du verset clé (ou sur deux versets voisins).

${profondeur}

RÈGLES :
- En français, à partir du passage fourni (et, au niveau 4 seulement, de la Tradition de l'Église).
- Les questions doivent être NOUVELLES : ne reprends AUCUNE des questions déjà posées (liste fournie). Chaque niveau apporte d'autres questions.
- Ce qui aide à répondre va DANS la question (contexte, début de la phrase, mots voisins), pas seulement dans "hint".
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
    const uid = await callerId(req)
    if (!uid) return json({ error: 'Appel non authentifié' }, 401)

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY manquante' }, 500)

    const { reference, passage, level, keyVerse, verseRef, avoid, format: fmt } = await req.json()
    const format: Format = fmt === 'revision' ? 'revision' : 'jour'
    if (!reference) return json({ error: 'référence manquante' }, 400)

    const lvl = Math.max(1, Number(level) || 1)
    const avoidList = Array.isArray(avoid) ? (avoid as string[]).filter(Boolean) : []
    const user = `Passage : ${reference}\n`
      + (keyVerse ? `Verset clé (essentiel à mémoriser) : « ${keyVerse} » (${verseRef ?? ''})\n` : '')
      + `\nTEXTE :\n${passage ?? '(texte non fourni — appuie-toi sur la référence)'}\n\n`
      + (avoidList.length ? `Questions déjà posées aux niveaux précédents (NE LES REPRENDS PAS) :\n- ${avoidList.join('\n- ')}\n\n` : '')
      + (format === 'revision'
        ? `Génère le quiz de RÉVISION de ce passage.`
        : `Génère le quiz au NIVEAU ${lvl}.`)

    const systeme = format === 'revision'
      ? quizSystem(COMPOSITION_REVISION, PROFONDEUR_REVISION)
      : quizSystem(COMPOSITION_JOUR, PROFONDEUR_JOUR)
    const { text: raw, usage } = await callClaude(apiKey, systeme, user, 1500)
    await logUsage(uid, format === 'revision' ? 'revision' : `jour niv. ${lvl}`, usage)
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
