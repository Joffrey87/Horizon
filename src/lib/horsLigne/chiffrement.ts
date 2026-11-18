// ================================================================
// Hors ligne — copie chiffrée des Finances.
//
// Exigence : la copie gardée sur le téléphone ne se lit qu'avec le mot de passe
// Horizon, qui n'est jamais enregistré. Mais la copie doit pouvoir être
// rafraîchie à chaque ouverture des Finances, SANS redemander le mot de passe.
//
// D'où un chiffrement hybride :
//  - à l'activation (mot de passe saisi une fois), une paire de clés RSA-OAEP est
//    créée ; la clé publique est gardée telle quelle, la clé privée est chiffrée
//    (AES-GCM) par une clé tirée du mot de passe (PBKDF2-SHA-256, 600 000 tours) ;
//  - chaque copie est chiffrée par une clé AES-GCM neuve, elle-même chiffrée par
//    la clé publique → on peut écrire une copie sans le mot de passe ;
//  - pour la lire, il faut le mot de passe → clé privée → clé AES → données.
// Mauvais mot de passe : AES-GCM refuse de déchiffrer la clé privée (rien n'est
// « deviné » à moitié).
// ================================================================

const subtle = () => globalThis.crypto.subtle
const ITERATIONS = 600_000

export interface ClesFinances {
  version: 1
  /** Clé publique (SPKI) : chiffre les copies. */
  publique: ArrayBuffer
  /** Clé privée (PKCS#8) chiffrée par le mot de passe. */
  privee: ArrayBuffer
  sel: ArrayBuffer
  iv: ArrayBuffer
  iterations: number
  creees: string
}

export interface CopieChiffree {
  version: 1
  /** Moment de la copie (ISO). */
  at: string
  /** Clé AES de la copie, chiffrée par la clé publique. */
  cle: ArrayBuffer
  iv: ArrayBuffer
  donnees: ArrayBuffer
  gzip: boolean
}

export class MotDePasseIncorrect extends Error {
  constructor() { super('Mot de passe incorrect.') }
}

const aleatoire = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n)).buffer
const RSA = { name: 'RSA-OAEP', hash: 'SHA-256' } as const

async function cleDuMotDePasse(motDePasse: string, sel: ArrayBuffer, iterations: number): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', new TextEncoder().encode(motDePasse), 'PBKDF2', false, ['deriveKey'])
  return subtle().deriveKey({ name: 'PBKDF2', salt: sel, iterations, hash: 'SHA-256' }, base,
    { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey'])
}

/** Crée les clés de l'appareil à partir du mot de passe (une fois, à l'activation). */
export async function creerCles(motDePasse: string, iterations = ITERATIONS): Promise<ClesFinances> {
  const paire = await subtle().generateKey(
    { ...RSA, modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['encrypt', 'decrypt'])
  const sel = aleatoire(16)
  const iv = aleatoire(12)
  const kek = await cleDuMotDePasse(motDePasse, sel, iterations)
  const privee = await subtle().wrapKey('pkcs8', paire.privateKey, kek, { name: 'AES-GCM', iv })
  const publique = await subtle().exportKey('spki', paire.publicKey)
  return { version: 1, publique, privee, sel, iv, iterations, creees: new Date().toISOString() }
}

const peutCompresser = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'

async function transformer(octets: ArrayBuffer, flux: CompressionStream | DecompressionStream): Promise<ArrayBuffer> {
  return new Response(new Blob([octets]).stream().pipeThrough(flux)).arrayBuffer()
}

/** Chiffre des données avec la clé publique (aucun mot de passe nécessaire). */
export async function chiffrer(donnees: unknown, cles: ClesFinances): Promise<CopieChiffree> {
  const publique = await subtle().importKey('spki', cles.publique, RSA, false, ['encrypt'])
  const aes = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const iv = aleatoire(12)
  const gzip = peutCompresser()
  let octets: ArrayBuffer = new TextEncoder().encode(JSON.stringify(donnees)).buffer as ArrayBuffer
  if (gzip) octets = await transformer(octets, new CompressionStream('gzip'))
  const chiffre = await subtle().encrypt({ name: 'AES-GCM', iv }, aes, octets)
  const cle = await subtle().encrypt(RSA, publique, await subtle().exportKey('raw', aes))
  return { version: 1, at: new Date().toISOString(), cle, iv, donnees: chiffre, gzip }
}

/** Déchiffre une copie avec le mot de passe. Lève `MotDePasseIncorrect` s'il ne convient pas. */
export async function dechiffrer<T>(copie: CopieChiffree, cles: ClesFinances, motDePasse: string): Promise<T> {
  const kek = await cleDuMotDePasse(motDePasse, cles.sel, cles.iterations)
  let privee: CryptoKey
  try {
    privee = await subtle().unwrapKey('pkcs8', cles.privee, kek, { name: 'AES-GCM', iv: cles.iv }, RSA, false, ['decrypt'])
  } catch {
    throw new MotDePasseIncorrect()
  }
  const brute = await subtle().decrypt(RSA, privee, copie.cle)
  const aes = await subtle().importKey('raw', brute, { name: 'AES-GCM' }, false, ['decrypt'])
  let octets = await subtle().decrypt({ name: 'AES-GCM', iv: copie.iv }, aes, copie.donnees)
  if (copie.gzip) octets = await transformer(octets, new DecompressionStream('gzip'))
  return JSON.parse(new TextDecoder().decode(octets)) as T
}
