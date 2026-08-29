// ================================================================
// refresh-masses — met à jour la liste des messes de Reims utilisée par les
// vérifications « messe si je travaille » et le sélecteur de messe (Temps,
// accueil). Couvre les 7 jours de la semaine, pas seulement ven/sam/dim.
//
// Stratégie robuste :
//  - on lit le calendrier (~3 mois) de chaque église de Reims sur
//    trouverunemesse.fr et on en déduit la semaine-type : un créneau
//    (jour, heure, église) n'est retenu que s'il revient au moins 2 fois,
//    ce qui écarte les célébrations exceptionnelles ;
//  - si le format change ou que le site ne répond pas, on retombe sur une
//    base MAINTENUE (jamais de liste cassée) ;
//  - les entrées « (Latin) » (ICRSP Sainte-Jeanne-d'Arc, FSSPX Notre-Dame de
//    France) restent en constantes : leurs sources ne sont pas scrapables.
//
// Aucun appel à un modèle : cette fonction ne coûte rien.
// Déclenché mensuellement (pg_cron) et par le bouton « Rafraîchir » de l'app.
// ================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

type Slot = { t: string; c: string }
type Schedule = Record<string, Slot[]> // clé = jour ISO ('1' lundi … '7' dimanche)

const DAY_KEY: Record<string, string> = {
  lundi: '1', mardi: '2', mercredi: '3', jeudi: '4', vendredi: '5', samedi: '6', dimanche: '7',
}
const ALL_DAYS = ['1', '2', '3', '4', '5', '6', '7']

// --- Base maintenue (repli si le scraping échoue) ---------------------------
// Relevé le 2026-08-17 sur trouverunemesse.fr.
const DIOCESAIN: Schedule = {
  '1': [
    { t: '11:30', c: 'Chapelle Sainte-Claire (Cormontreuil)' },
    { t: '17:30', c: 'Oratoire du presbytère' },
    { t: '18:30', c: 'Chapelle de l’adoration (Saint-André)' },
    { t: '19:00', c: 'Cathédrale Notre-Dame' },
  ],
  '2': [
    { t: '11:30', c: 'Chapelle Sainte-Claire (Cormontreuil)' },
    { t: '12:15', c: 'Basilique Saint-Remi' },
    { t: '17:30', c: 'Oratoire du presbytère' },
    { t: '19:00', c: 'Cathédrale Notre-Dame' },
  ],
  '3': [
    { t: '11:30', c: 'Saint-Jacques' },
    { t: '12:15', c: 'Basilique Saint-Remi' },
    { t: '12:15', c: 'Chapelle de l’adoration (Saint-André)' },
    { t: '17:30', c: 'Saint-Thomas' },
    { t: '17:30', c: 'Oratoire du presbytère' },
    { t: '18:00', c: 'Chapelle Sainte-Claire (Cormontreuil)' },
    { t: '19:00', c: 'Cathédrale Notre-Dame' },
  ],
  '4': [
    { t: '08:45', c: 'Chapelle de l’adoration (Saint-André)' },
    { t: '09:00', c: 'Saint-Louis' },
    { t: '11:30', c: 'Chapelle Sainte-Claire (Cormontreuil)' },
    { t: '17:30', c: 'Saint-Thomas' },
    { t: '17:30', c: 'Oratoire du presbytère' },
    { t: '19:00', c: 'Cathédrale Notre-Dame' },
  ],
  '5': [
    { t: '09:00', c: 'Sainte-Bernadette (Tinqueux)' },
    { t: '10:30', c: 'Basilique Sainte-Clotilde' },
    { t: '12:15', c: 'Saint-Jean-Baptiste-de-La-Salle' },
    { t: '18:00', c: 'Sainte-Geneviève' },
    { t: '18:00', c: 'Chapelle Sainte-Claire (Cormontreuil)' },
    { t: '19:00', c: 'Cathédrale Notre-Dame' },
  ],
  '6': [
    { t: '08:00', c: 'Cathédrale Notre-Dame' },
    { t: '11:30', c: 'Chapelle Sainte-Claire (Cormontreuil)' },
    { t: '17:00', c: 'Saint-Jacques (anticipée)' },
    { t: '18:00', c: 'Basilique Sainte-Clotilde (anticipée)' },
    { t: '18:00', c: 'Saint-Bruno (anticipée)' },
    { t: '18:00', c: 'Saint Vincent de Paul (anticipée)' },
  ],
  '7': [
    { t: '08:45', c: 'Basilique Saint-Remi' },
    { t: '08:45', c: 'Saint-Jean-Baptiste-de-La-Salle' },
    { t: '09:00', c: 'Cathédrale Notre-Dame' },
    { t: '10:30', c: 'Basilique Saint-Remi' },
    { t: '10:30', c: 'Saint-André' },
    { t: '10:30', c: 'Saint-Thomas' },
    { t: '11:00', c: 'Cathédrale Notre-Dame' },
    { t: '11:15', c: 'Chapelle Sainte-Claire (Cormontreuil)' },
    { t: '18:30', c: 'Saint-Jacques' },
  ],
}

// --- Rites latins (constantes stables) --------------------------------------
const LATIN: Schedule = {
  '5': [{ t: '18:30', c: 'Notre-Dame de France (Latin)' }],
  '6': [
    { t: '10:30', c: "Sainte-Jeanne-d'Arc (Latin)" },
    { t: '11:00', c: 'Notre-Dame de France (Latin)' },
  ],
  '7': [
    { t: '10:00', c: 'Notre-Dame de France (Latin — 11h15 en juil.-août)' },
    { t: '10:30', c: "Sainte-Jeanne-d'Arc (Latin)" },
  ],
}

const byTime = (a: Slot, b: Slot) => a.t.localeCompare(b.t) || a.c.localeCompare(b.c)

/** Fusionne diocésain + latin sur les 7 jours, trié par heure. */
function merge(diocesain: Schedule): Schedule {
  const out: Schedule = {}
  for (const k of ALL_DAYS) {
    out[k] = [...(diocesain[k] ?? []), ...(LATIN[k] ?? [])].sort(byTime)
  }
  return out
}

/** Nettoie un nom d'église : « église Saint-Thomas de Reims » → « Saint-Thomas ». */
function cleanChurch(raw: string): string {
  let c = raw
    .replace(/&#x27;/g, '’')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(église|eglise)\s+/i, '')
    .replace(/\s+de\s+Reims\s*$/i, '')
  const ville = c.match(/\s+de\s+(Cormontreuil|Tinqueux)\s*$/i)
  if (ville) c = `${c.replace(/\s+de\s+\S+\s*$/i, '')} (${ville[1]})`
  return c.charAt(0).toUpperCase() + c.slice(1)
}

/** Semaine-type déduite du calendrier de chaque église de Reims. */
async function scrapeDiocesain(): Promise<Schedule | null> {
  try {
    const res = await fetch('https://trouverunemesse.fr/commune/51454', {
      headers: { 'user-agent': 'Mozilla/5.0 HorizonBot' },
    })
    if (!res.ok) return null
    const commune = await res.text()
    const slugs = [...new Set([...commune.matchAll(/href="(\/eglises\/[a-z0-9-]+\/[a-z0-9-]+)"/g)]
      .map((m) => m[1]))]
    if (slugs.length < 5) return null

    const counts = new Map<string, number>() // "jour|HH:MM|église" -> occurrences

    // Par petits paquets : ~20 pages, on reste largement dans le temps imparti.
    for (let i = 0; i < slugs.length; i += 5) {
      await Promise.all(slugs.slice(i, i + 5).map(async (slug) => {
        try {
          const r = await fetch('https://trouverunemesse.fr' + slug, {
            headers: { 'user-agent': 'Mozilla/5.0 HorizonBot' },
          })
          if (!r.ok) return
          const html = await r.text()
          const name = cleanChurch(
            html.match(/"name":"([^"]+)","description":"Horaires des messes/)?.[1] ?? slug.split('/').pop()!,
          )
          const lines = html.replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ')
            .split('\n').map((l) => l.trim()).filter(Boolean)

          let wd: string | null = null
          const seenDates = new Set<string>()
          for (let k = 0; k < lines.length; k++) {
            if (/^Célébrations du$/i.test(lines[k])) {
              const m = (lines[k + 1] ?? '')
                .match(/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+(\d{1,2})\s+(\S+)/i)
              wd = m ? DAY_KEY[m[1].toLowerCase()] : null
              if (m) {
                const date = `${m[2]} ${m[3]}`
                // Le bloc « prochaine célébration » répète un jour déjà listé : on ne compte qu'une fois.
                if (seenDates.has(date)) wd = null
                else seenDates.add(date)
              }
              continue
            }
            if (!wd) continue
            const t = lines[k].match(/^(\d{1,2})h(\d{2})$/)
            if (!t) continue
            const label = (lines[k + 1] === '-' ? lines[k + 2] : lines[k + 1]) ?? ''
            if (!/^Messe/i.test(label)) continue // écarte chapelet, adoration, vêpres…
            const hhmm = `${t[1].padStart(2, '0')}:${t[2]}`
            const key = `${wd}|${hhmm}|${name}`
            counts.set(key, (counts.get(key) ?? 0) + 1)
          }
        } catch { /* une église en moins, pas de quoi casser la liste */ }
      }))
    }

    const out: Schedule = {}
    for (const k of ALL_DAYS) out[k] = []
    for (const [key, n] of counts) {
      if (n < 2) continue // célébration exceptionnelle
      const [wd, t, c] = key.split('|')
      out[wd]?.push({ t, c: wd === '6' && Number(t.slice(0, 2)) >= 17 ? `${c} (anticipée)` : c })
    }
    // Contrôle de cohérence : sans dimanche crédible ni messes de semaine, on ne fait pas confiance.
    const weekdays = ['1', '2', '3', '4'].reduce((n, k) => n + (out[k]?.length ?? 0), 0)
    if ((out['7']?.length ?? 0) < 3 || weekdays < 3) return null
    for (const k of ALL_DAYS) out[k] = out[k].sort(byTime)
    return out
  } catch {
    return null
  }
}

// Origines autorisées. `*` (ou l'absence totale d'en-têtes CORS) laissait la
// fonction joignable depuis n'importe quel site. Surchargeable par ALLOWED_ORIGINS.
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

/** Utilisateur appelant, déduit du JWT — null si l'appel n'est pas authentifié.
 *  Indispensable : la service-role key ignore RLS, sans ce filtre la fonction
 *  réécrivait la config des vérifications de TOUS les comptes. */
async function callerId(req: Request, url: string, serviceKey: string): Promise<string | null> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return null
  const { data, error } = await createClient(url, serviceKey).auth.getUser(jwt)
  if (error || !data.user) return null
  return data.user.id
}

Deno.serve(async (req) => {
  const cors = corsFor(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const uid = await callerId(req, url, key)
  if (!uid) return json({ ok: false, error: 'Appel non authentifié' }, 401)
  // `check_id` optionnel : ne rafraîchir qu'une vérification précise.
  let onlyId: string | null = null
  try { onlyId = ((await req.json()) as { check_id?: string })?.check_id ?? null } catch { /* pas de corps */ }
  const supabase = createClient(url, key)

  const scraped = await scrapeDiocesain()
  const masses = merge(scraped ?? DIOCESAIN)
  const source = scraped ? 'trouverunemesse.fr + rites latins' : 'base maintenue (scraping indisponible)'
  const refreshed_at = new Date().toISOString()

  let q = supabase.from('checks').select('id, config')
    .eq('kind', 'messe_travail').eq('user_id', uid)
  if (onlyId) q = q.eq('id', onlyId)
  const { data: checks, error } = await q
  if (error) return json({ ok: false, error: error.message }, 500)

  let updated = 0
  for (const c of checks ?? []) {
    const config = { ...(c.config ?? {}), masses, refreshed_at }
    const { error: upErr } = await supabase.from('checks').update({ config }).eq('id', c.id)
    if (!upErr) updated++
  }

  const counts = Object.fromEntries(ALL_DAYS.map((k) => [k, masses[k].length]))
  return json({ ok: true, updated, source, refreshed_at, counts })
})
