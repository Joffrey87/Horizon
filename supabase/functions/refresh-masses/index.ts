// ================================================================
// refresh-masses — met à jour la liste des messes de Reims utilisée par les
// vérifications « messe si je travaille ».
//
// Stratégie robuste :
//  - une base MAINTENUE et exacte (diocésain + rites latins), garantie correcte ;
//  - un re-scraping best-effort de la seule source proprement lisible
//    (trouverunemesse.fr) pour rafraîchir le diocésain ; si le format change,
//    on retombe sur la base maintenue (jamais de liste cassée) ;
//  - les entrées « (Latin) » (ICRSP Sainte-Jeanne-d'Arc, FSSPX Notre-Dame de
//    France) restent en constantes : leurs sources ne sont pas scrapables.
//
// Déclenché mensuellement (pg_cron) et par le bouton « Rafraîchir » de l'app.
// ================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

type Slot = { t: string; c: string }
type Schedule = Record<string, Slot[]> // clé = jour ISO ('5' ven, '6' sam, '7' dim)

// --- Base diocésaine maintenue (repli si le scraping échoue) ----------------
const DIOCESAIN: Schedule = {
  '5': [
    { t: '10:30', c: 'Basilique Sainte-Clotilde' },
    { t: '12:15', c: 'Saint-Jean-Baptiste-de-La-Salle' },
    { t: '17:00', c: 'Saint-Jacques' },
    { t: '18:00', c: 'Sainte-Geneviève' },
    { t: '19:00', c: 'Cathédrale Notre-Dame' },
  ],
  '6': [
    { t: '08:00', c: 'Cathédrale Notre-Dame' },
    { t: '17:00', c: 'Saint-Jacques (anticipée)' },
    { t: '18:00', c: 'Basilique Sainte-Clotilde (anticipée)' },
    { t: '18:00', c: 'Saint-Bruno (anticipée)' },
    { t: '18:00', c: 'Saint-Paul (anticipée)' },
  ],
  '7': [
    { t: '09:00', c: 'Cathédrale Notre-Dame' },
    { t: '10:30', c: 'Basilique Saint-Remi' },
    { t: '10:30', c: 'Saint-André' },
    { t: '10:30', c: 'Saint-Thomas' },
    { t: '11:00', c: 'Cathédrale Notre-Dame' },
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

const byTime = (a: Slot, b: Slot) => a.t.localeCompare(b.t)

/** Fusionne diocésain + latin, trié par heure. */
function merge(diocesain: Schedule): Schedule {
  const out: Schedule = {}
  for (const k of ['5', '6', '7']) {
    out[k] = [...(diocesain[k] ?? []), ...(LATIN[k] ?? [])].sort(byTime)
  }
  return out
}

/** Nettoie un nom d'église issu du scraping. */
function cleanChurch(raw: string): string {
  return raw
    .replace(/^Église\s+/i, '')
    .replace(/\s+de\s+Reims\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Re-scrape best-effort du diocésain (vendredi/samedi/dimanche) sur trouverunemesse. */
async function scrapeDiocesain(): Promise<Schedule | null> {
  try {
    const res = await fetch('https://trouverunemesse.fr/commune/51454', {
      headers: { 'user-agent': 'Mozilla/5.0 HorizonBot' },
    })
    if (!res.ok) return null
    const html = await res.text()
    const text = html.replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ')
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

    const dayKey: Record<string, string> = { vendredi: '5', samedi: '6', dimanche: '7' }
    const out: Schedule = { '5': [], '6': [], '7': [] }
    let cur: string | null = null
    for (const line of lines) {
      const low = line.toLowerCase()
      if (dayKey[low]) { cur = dayKey[low]; continue }
      if (!cur) continue
      // "08:00 - Cathédrale Notre-Dame de Reims" (ou "8h00")
      const m = line.match(/^(\d{1,2})[:h](\d{2})\s*[-–]?\s*(.+)$/)
      if (m) {
        const t = `${m[1].padStart(2, '0')}:${m[2]}`
        let c = cleanChurch(m[3])
        if (!c) continue
        if (/\b(chapelet|adoration|vêpres|confession)\b/i.test(m[3])) continue // pas des messes
        if (cur === '6' && Number(m[1]) >= 17) c += ' (anticipée)'
        out[cur].push({ t, c })
      }
    }
    // Contrôle de cohérence : au moins 3 messes dominicales sinon on ne fait pas confiance.
    if ((out['7']?.length ?? 0) < 3) return null
    for (const k of ['5', '6', '7']) out[k] = out[k].sort(byTime)
    return out
  } catch {
    return null
  }
}

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(url, key)

  const scraped = await scrapeDiocesain()
  const masses = merge(scraped ?? DIOCESAIN)
  const source = scraped ? 'trouverunemesse.fr + rites latins' : 'base maintenue (scraping indisponible)'
  const refreshed_at = new Date().toISOString()

  const { data: checks, error } = await supabase
    .from('checks').select('id, config').eq('kind', 'messe_travail')
  if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 })

  let updated = 0
  for (const c of checks ?? []) {
    const config = { ...(c.config ?? {}), masses, refreshed_at }
    const { error: upErr } = await supabase.from('checks').update({ config }).eq('id', c.id)
    if (!upErr) updated++
  }

  return new Response(
    JSON.stringify({ ok: true, updated, source, refreshed_at, counts: { ven: masses['5'].length, sam: masses['6'].length, dim: masses['7'].length } }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
