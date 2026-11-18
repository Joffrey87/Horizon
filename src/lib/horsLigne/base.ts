// ================================================================
// Hors ligne — petit magasin clé → valeur dans IndexedDB.
// localStorage est trop petit (≈ 5 Mo) pour la copie des données ; IndexedDB
// garde aussi les ArrayBuffer de la copie chiffrée des Finances tels quels.
// Toute erreur est avalée ici et rendue comme « rien » : la copie locale est
// un confort, jamais une condition pour que l'app marche.
// ================================================================

const NOM = 'horizon-horsligne'
const MAGASIN = 'kv'

let ouverture: Promise<IDBDatabase> | null = null

function ouvrir(): Promise<IDBDatabase> {
  if (!ouverture) {
    ouverture = new Promise((ok, ko) => {
      if (typeof indexedDB === 'undefined') { ko(new Error('IndexedDB indisponible')); return }
      const req = indexedDB.open(NOM, 1)
      req.onupgradeneeded = () => { req.result.createObjectStore(MAGASIN) }
      req.onsuccess = () => ok(req.result)
      req.onerror = () => ko(req.error ?? new Error('IndexedDB'))
    })
    ouverture.catch(() => { ouverture = null })
  }
  return ouverture
}

function requete<T>(mode: IDBTransactionMode, faire: (m: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return ouvrir().then((db) => new Promise<T | undefined>((ok) => {
    const tx = db.transaction(MAGASIN, mode)
    const req = faire(tx.objectStore(MAGASIN))
    tx.oncomplete = () => ok(req.result as T)
    tx.onerror = () => ok(undefined)
    tx.onabort = () => ok(undefined)
  })).catch(() => undefined)
}

export const lireLocal = <T>(cle: string) => requete<T>('readonly', (m) => m.get(cle))

export async function ecrireLocal(cle: string, valeur: unknown): Promise<boolean> {
  const r = await requete<IDBValidKey>('readwrite', (m) => m.put(valeur, cle))
  return r !== undefined
}

export async function effacerLocal(cle: string): Promise<void> {
  await requete('readwrite', (m) => m.delete(cle))
}

/** Efface tout ce qui commence par ce préfixe (ex. tout ce qui concerne un compte). */
export async function effacerPrefixe(prefixe: string): Promise<void> {
  const cles = await requete<IDBValidKey[]>('readonly', (m) => m.getAllKeys())
  for (const c of cles ?? []) if (typeof c === 'string' && c.startsWith(prefixe)) await effacerLocal(c)
}
