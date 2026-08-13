// ================================================================
// Récupération d'un passage biblique en Louis Segond 1910 (domaine public)
// depuis l'API gratuite getbible.net (traduction « ls1910 »). Aucune clé,
// aucun coût. Utilisé par la page Écritures.
// ================================================================

export interface PassageLoc { book: number; chapter: number; start: number; end: number }

/** Renvoie le texte du passage (versets numérotés « [n] »), ou lève une erreur. */
export async function fetchPassage(loc: PassageLoc): Promise<string> {
  const res = await fetch(`https://api.getbible.net/v2/ls1910/${loc.book}/${loc.chapter}.json`)
  if (!res.ok) throw new Error(`getbible ${res.status}`)
  const data = await res.json() as { verses?: { verse: number; text: string }[] }
  const verses = (data.verses ?? []).filter((v) => v.verse >= loc.start && v.verse <= loc.end)
  if (verses.length === 0) throw new Error('passage introuvable')
  return verses.map((v) => `[${v.verse}] ${String(v.text).replace(/\s+/g, ' ').trim()}`).join('\n')
}
