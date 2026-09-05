// ================================================================
// File d'attente locale des captures.
//
// Se vider la tête ne doit jamais dépendre du réseau : dans le métro, en
// voiture, en zone blanche, la pensée est conservée sur l'appareil et repart
// d'elle-même à la reconnexion. Rien ici ne connaît le store ni Supabase —
// c'est du localStorage pur, donc testable.
// ================================================================

const KEY = 'horizon.capture.file'
const DOMAINE_KEY = 'horizon.capture.domaine'
/** Garde-fou : au-delà, on cesse d'empiler (une file de cette taille signale
 *  un problème durable, pas un tunnel). Les plus anciennes sont conservées. */
const MAX = 200

export interface CaptureEnAttente {
  id: string
  kind: 'idee' | 'tache'
  title: string
  domain_id: string
  created_at: string
}

function lire(): CaptureEnAttente[] {
  try {
    const brut = localStorage.getItem(KEY)
    const liste: unknown = brut ? JSON.parse(brut) : []
    return Array.isArray(liste) ? (liste as CaptureEnAttente[]) : []
  } catch { return [] }
}

function ecrire(liste: CaptureEnAttente[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(liste)) } catch { /* quota */ }
}

/** Les captures en attente d'envoi, de la plus ancienne à la plus récente. */
export function capturesEnAttente(): CaptureEnAttente[] {
  return lire()
}

/** Met une capture de côté. Renvoie `false` si la file est pleine. */
export function empiler(capture: Omit<CaptureEnAttente, 'id' | 'created_at'>): boolean {
  const liste = lire()
  if (liste.length >= MAX) return false
  liste.push({
    ...capture,
    id: `cap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
  })
  ecrire(liste)
  return true
}

/** Retire une capture envoyée avec succès. */
export function depiler(id: string): void {
  ecrire(lire().filter((c) => c.id !== id))
}

/** Un échec qui vaut la peine d'être réessayé plus tard — réseau absent ou
 *  injoignable. Une erreur de validation ou de droits, elle, ne passera jamais :
 *  l'empiler reviendrait à la réessayer indéfiniment. */
export function echecReseau(message: string | null | undefined): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (!message) return false
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed|timeout/i.test(message)
}

/** Dernier domaine utilisé : permet de capturer même quand l'app n'a pas pu
 *  charger ses données (démarrage hors ligne). */
export function memoriserDomaine(id: string): void {
  try { localStorage.setItem(DOMAINE_KEY, id) } catch { /* quota */ }
}

export function dernierDomaine(): string | null {
  try { return localStorage.getItem(DOMAINE_KEY) } catch { return null }
}
