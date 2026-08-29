// ================================================================
// Lectures de la messe du jour, via l'API publique de l'AELF
// (https://api.aelf.org — pas de clé, pas de coût). Sert à l'écriture
// du jour sur l'accueil et à la page Écritures.
// ================================================================

import { useEffect, useState } from 'react'

export interface MassReading {
  type: 'lecture_1' | 'psaume' | 'cantique' | 'evangile'
  ref: string          // ex. « Mt 18, 21 – 19, 1 »
  title: string        // titre AELF (souvent un extrait cité du texte)
  text: string         // texte en clair, paragraphes séparés par une ligne vide
  refrain?: string     // psaume : antienne
  refrainRef?: string
}

export interface MassDay {
  date: string         // ISO
  name?: string        // ex. « Jeudi de la 19e semaine du Temps ordinaire »
  lecture1?: MassReading
  psaume?: MassReading   // psaume, ou cantique quand la messe du jour en propose un
  evangile?: MassReading
}

const CACHE_KEY = (date: string) => `horizon.aelf.${date}`
const CACHE_PREFIX = 'horizon.aelf.'
const CACHE_DAYS = 14   // au-delà, la lecture ne resservira plus
const FETCH_TIMEOUT_MS = 8000

/** Purge les lectures trop anciennes : le cache grossissait sans limite
 *  (une entrée par date consultée, jamais nettoyée). */
function pruneCache(today: string): void {
  try {
    const limit = new Date(`${today}T12:00:00Z`)
    limit.setUTCDate(limit.getUTCDate() - CACHE_DAYS)
    const floor = limit.toISOString().slice(0, 10)
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(CACHE_PREFIX) && key.slice(CACHE_PREFIX.length) < floor) {
        localStorage.removeItem(key)
      }
    }
  } catch { /* stockage indisponible : rien à purger */ }
}

/** Abréviations AELF des livres de l'Ancien Testament (pour distinguer AT / NT). */
const OT_BOOKS = new Set([
  'Gn', 'Ex', 'Lv', 'Nb', 'Dt', 'Jos', 'Jg', 'Rt', '1 S', '2 S', '1 R', '2 R', '1 Ch', '2 Ch',
  'Esd', 'Ne', 'Tb', 'Jdt', 'Est', '1 M', '2 M', 'Jb', 'Ps', 'Pr', 'Qo', 'Ct', 'Sg', 'Si',
  'Is', 'Jr', 'Lm', 'Ba', 'Ez', 'Dn', 'Os', 'Jl', 'Am', 'Ab', 'Jon', 'Mi', 'Na', 'Ha', 'So',
  'Ag', 'Za', 'Ml',
])

/** « Ez 12, 1-12 » → « Ez ». Gère les livres numérotés (« 1 S 3, 1 »). */
function bookOf(ref: string): string {
  const m = ref.trim().match(/^((?:[12]\s*)?[A-Za-zÉÈÊÎÔÛç]+)/)
  return (m?.[1] ?? '').replace(/\s+/g, ' ').trim()
}

export function isOldTestament(ref: string): boolean {
  return OT_BOOKS.has(bookOf(ref))
}

/** HTML AELF → texte brut (les <br> deviennent des retours, les <p> des paragraphes). */
function toText(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, '’')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map((l) => l.trim()).join('\n')
    .trim()
}

interface AelfLecture {
  type?: string; ref?: string; titre?: string | null; contenu?: string | null
  refrain_psalmique?: string | null; ref_refrain?: string | null
}

/** Lectures de la messe pour une date ISO (yyyy-mm-dd), calendrier « france ». */
export async function fetchMass(date: string): Promise<MassDay> {
  const cached = localStorage.getItem(CACHE_KEY(date))
  if (cached) {
    try { return JSON.parse(cached) as MassDay } catch { /* cache corrompu : on refait l'appel */ }
  }
  // Sans délai maximal, une API muette laissait la vue en chargement indéfiniment.
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`https://api.aelf.org/v1/messes/${date}/france`, { signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw new Error(`aelf ${res.status}`)
  const data = await res.json() as { messes?: { nom?: string; lectures?: AelfLecture[] }[] }
  const messe = data.messes?.[0]
  if (!messe) throw new Error('pas de messe pour ce jour')

  const pick = (type: string): MassReading | undefined => {
    const l = messe.lectures?.find((x) => x.type === type)
    if (!l) return undefined
    const text = toText(l.contenu)
    if (!text) return undefined
    return {
      type: type as MassReading['type'],
      ref: l.ref ?? '',
      title: toText(l.titre).replace(/^«\s*/, '').replace(/\s*»$/, ''),
      text,
      refrain: toText(l.refrain_psalmique) || undefined,
      refrainRef: l.ref_refrain ?? undefined,
    }
  }

  const day: MassDay = {
    date,
    name: messe.nom,
    lecture1: pick('lecture_1'),
    psaume: pick('psaume') ?? pick('cantique'),
    evangile: pick('evangile'),
  }
  try { localStorage.setItem(CACHE_KEY(date), JSON.stringify(day)) } catch { /* quota atteint */ }
  pruneCache(date)
  return day
}

/** La lecture mise en avant aujourd'hui. « lecture1 » retombe sur l'évangile
 *  les jours où la 1re lecture n'est pas tirée de l'Ancien Testament. */
export function readingOfDay(mass: MassDay | null, kind: 'evangile' | 'lecture1'): MassReading | undefined {
  if (!mass) return undefined
  if (kind === 'lecture1' && mass.lecture1 && isOldTestament(mass.lecture1.ref)) return mass.lecture1
  return mass.evangile ?? mass.lecture1
}

/** Citation courte tirée d'une lecture : le titre AELF s'il est utilisable,
 *  sinon la première phrase du texte. */
export function readingQuote(r: MassReading): { text: string; source: string } {
  const title = r.title.trim()
  if (title.length >= 15 && title.length <= 200) return { text: title, source: r.ref }
  const body = r.text.replace(/\s+/g, ' ').trim()
  const first = body.match(/^.{20,200}?[.!?»](?=\s|$)/)?.[0] ?? body.slice(0, 160).trim() + '…'
  return { text: first, source: r.ref }
}

/** Charge les lectures du jour (avec cache localStorage). */
export function useMassOfDay(date: string) {
  const [mass, setMass] = useState<MassDay | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null)
    fetchMass(date)
      .then((m) => { if (alive) setMass(m) })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [date])

  return { mass, loading, error }
}
