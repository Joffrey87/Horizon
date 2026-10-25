// Client Enable Banking minimal pour Deno (JWT RS256 signé avec la clé privée de l'application).
// Secrets : EB_APP_ID, EB_PRIVATE_KEY (contenu PEM PKCS#8 « BEGIN PRIVATE KEY »).
import { importPKCS8, SignJWT } from 'npm:jose@5.9.6'
import type { EbBalance, EbTransaction } from './bankSync.ts'

const API = 'https://api.enablebanking.com'
let cached: { token: string; exp: number } | null = null
let vault: Record<string, string> = {}

/** Secrets : variables d'environnement de la fonction, sinon Supabase Vault (RPC service_role fin_bank_secrets). */
// deno-lint-ignore no-explicit-any
export async function loadSecrets(db: any) {
  if (Deno.env.get('EB_APP_ID') && Deno.env.get('EB_PRIVATE_KEY') && Deno.env.get('BANK_SYNC_CRON_SECRET')) return
  const { data, error } = await db.rpc('fin_bank_secrets')
  if (!error && data) vault = data as Record<string, string>
}
export const secret = (name: string) => Deno.env.get(name) ?? vault[name.toLowerCase()] ?? ''

async function token(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.exp - 60 > now) return cached.token
  const appId = secret('EB_APP_ID'); const pem = secret('EB_PRIVATE_KEY')
  if (!appId || !pem) throw new Error('secrets EB_APP_ID / EB_PRIVATE_KEY manquants')
  const key = await importPKCS8(pem.replace(/\\n/g, '\n'), 'RS256')
  const t = await new SignJWT({}).setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: appId })
    .setIssuer('enablebanking.com').setAudience('api.enablebanking.com').setIssuedAt(now).setExpirationTime(now + 3600).sign(key)
  cached = { token: t, exp: now + 3600 }
  return t
}

async function call<T>(method: 'GET' | 'POST', path: string, q?: Record<string, string>, body?: unknown): Promise<T> {
  const u = new URL(API + path)
  for (const [k, v] of Object.entries(q ?? {})) u.searchParams.set(k, v)
  const r = await fetch(u, { method, headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined })
  if (!r.ok) throw new Error(`Enable Banking ${method} ${path} : HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
  return await r.json() as T
}

export async function transactions(uid: string, dateFrom: string): Promise<EbTransaction[]> {
  const out: EbTransaction[] = []; let ck: string | undefined
  for (let page = 0; page < 50; page++) {
    const q: Record<string, string> = { date_from: dateFrom }
    if (ck) q.continuation_key = ck
    const j = await call<{ transactions: EbTransaction[]; continuation_key?: string }>('GET', `/accounts/${uid}/transactions`, q)
    out.push(...j.transactions); ck = j.continuation_key
    if (!ck) break
  }
  return out
}
export const balances = async (uid: string) => (await call<{ balances: EbBalance[] }>('GET', `/accounts/${uid}/balances`)).balances

export type EbSessionAccount = { uid: string; cash_account_type?: string; name?: string; account_id?: { iban?: string } | null }
export const startAuth = (body: unknown) => call<{ url: string; authorization_id: string }>('POST', '/auth', undefined, body)
export const createSession = (code: string) =>
  call<{ session_id: string; accounts: EbSessionAccount[]; aspsp: { name: string; country: string }; access: { valid_until: string } }>('POST', '/sessions', undefined, { code })
