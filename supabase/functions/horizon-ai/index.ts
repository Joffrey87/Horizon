// ================================================================
// HORIZON — Edge Function « horizon-ai »
// Copilote IA : analyse le système et PROPOSE. Ne modifie jamais
// les données (garde-fou produit : l'utilisateur garde la main).
// Secret requis : ANTHROPIC_API_KEY (dashboard Supabase → Edge Functions → Secrets)
// ================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const SYSTEM = `Tu es l'assistant du POS « Horizon », le système d'exploitation personnel de l'utilisateur.

PHILOSOPHIE DU PRODUIT (à respecter absolument) :
- Réduire la charge mentale et le nombre de décisions, jamais l'augmenter.
- Une seule source de vérité ; limiter volontairement le travail en cours (seuil de projets actifs fourni).
- Mentalité anti-dispersion : « bonne idée, mais ce sera pour dans 6 mois ».
- Les habitudes s'ancrent sur 2-3 mois, une seule nouveauté à la fois.
- Tu es un copilote : tu proposes, tu mets en évidence, tu reformules. Tu ne décides pas.
- Ne culpabilise JAMAIS l'utilisateur. Ton ton est calme, bienveillant et concret.

RÈGLES DE RÉPONSE :
- Réponds en français, de façon brève et actionnable (pas de listes interminables).
- Appuie-toi uniquement sur le snapshot JSON fourni (l'état réel du système).
- Chaque suggestion importante tient en une phrase avec sa raison.
- Si l'utilisateur a trop de projets actifs, suggère lequel mettre en pause et pourquoi.
- Termine par au plus UNE question, seulement si elle aide à décider.`

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

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY manquante' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const { prompt, snapshot, history } = await req.json()

    const messages = [
      ...(Array.isArray(history)
        ? history.map((m: { role: string; text: string }) => ({
          role: m.role === 'user' ? 'user' : 'assistant', content: m.text,
        }))
        : []),
      {
        role: 'user',
        content: `ÉTAT ACTUEL DU SYSTÈME (snapshot JSON) :\n${JSON.stringify(snapshot)}\n\nDEMANDE : ${prompt}`,
      },
    ]

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1200,
        system: SYSTEM,
        messages,
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      return new Response(JSON.stringify({ error: `API Anthropic : ${res.status} ${detail.slice(0, 300)}` }),
        { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const data = await res.json()
    const text = (data.content ?? [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('\n')

    return new Response(JSON.stringify({ text }),
      { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
