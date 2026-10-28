// Secret de cron partagé avec la synchro bancaire.
// Vault `bank_sync_cron_secret`, ou variable BANK_SYNC_CRON_SECRET.
// La clé anon ne suffit pas : elle est dans le site public.

type ClientRpc = {
  rpc: (fn: string) => PromiseLike<{ data: unknown; error: { message?: string } | null }>
}

function egal(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ (b.charCodeAt(i) ?? 0)
  return r === 0
}

/** Vrai seulement si l'en-tête x-cron-secret correspond au secret, en temps constant. */
export async function cronAutorise(db: ClientRpc, req: Request): Promise<boolean> {
  const given = req.headers.get('x-cron-secret') ?? ''
  if (!given) return false
  let attendu = Deno.env.get('BANK_SYNC_CRON_SECRET') ?? ''
  if (!attendu) {
    const { data, error } = await db.rpc('fin_bank_secrets')
    if (!error && data && typeof data === 'object') {
      const brut = (data as Record<string, unknown>).bank_sync_cron_secret
      attendu = typeof brut === 'string' ? brut : ''
    }
  }
  return attendu.length > 0 && egal(given, attendu)
}
