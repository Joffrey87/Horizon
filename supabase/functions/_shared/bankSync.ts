// ================================================================
// HORIZON — logique pure de la synchro bancaire (Enable Banking -> Finances)
// Port TypeScript de horizon-import/import_bourso.py + maj_bourso.py.
// Aucune dépendance Deno/Node : utilisée par l'Edge Function « bank-sync »
// et testée par vitest (src/lib/bankSync.test.ts).
//
// Règles (identiques à l'import manuel) :
//  * seuls les comptes CACC sont lus ; les sous-comptes CARD sont des miroirs.
//  * opération comptabilisée (BOOK) : external_id
//      <source>:<last4>:<booking_date>:<centimes>:<sha1(libellé)[:8]>:<rang>
//    -> même identifiant que l'import CSV/manuel : aucun doublon.
//  * déjà présente si une ligne d'une autre source (Finary…) du même compte a le même
//    montant à ±3 j (appariement 1-pour-1).
//  * opération en attente (PDNG, montant non nul) : <source>-pdng:<last4>:<entry_reference>,
//    pending=true ; retirée à la synchro suivante quand elle n'est plus en attente
//    (pending_sync), la ligne comptabilisée arrivant avec son propre identifiant.
//  * catégorie : historique libellé -> catégorie (choix manuels x3), puis préfixe,
//    sinon « Dépenses du mois › Achats » (dépense) / « Non catégorisé » (rentrée).
//  * solde : temps réel XPCD (à défaut CLBD, ITAV, ITBD).
// ================================================================

export type EbAmount = { amount: string; currency?: string }
export type EbTransaction = {
  entry_reference?: string | null
  transaction_amount: EbAmount
  credit_debit_indicator: 'CRDT' | 'DBIT'
  status: string
  booking_date?: string | null
  value_date?: string | null
  transaction_date?: string | null
  remittance_information?: (string | null)[] | null
}
export type EbBalance = { balance_type: string; balance_amount: EbAmount }

export type SnapAccount = { id: string; name: string; source?: string | null; balance_source?: number | null; balance_manual_at?: string | null }
export type SnapTx = {
  account_id: string; date: string; amount: number; label: string; category?: string | null
  category_manual?: boolean | null; external_id?: string | null; source?: string | null; pending?: boolean | null
}
export type SnapCategory = { id: string; name: string; parent?: string | null; n: number }
export type Snapshot = {
  accounts: SnapAccount[]
  transactions: SnapTx[]
  categories: SnapCategory[]
  label_cat: [string, string, number, number][]
}

export type OutTx = {
  account_id: string; external_id: string; date: string; amount: number; label: string
  category_id: string | null; internal: boolean; excluded: boolean; pending: boolean
  // diagnostic (non envoyé)
  _category: string; _origin: string; _l4: string
}

// ---------------------------------------------------------------- libellés
export const deaccent = (s: string) => s.normalize('NFKD').replace(/[^\x00-\x7f]/g, '')

export function finaryLabel(raw: string): string {
  let s = raw.trim()
  s = s.replace(/^(CARTE|RETRAIT DAB|AVOIR)\s+\d\d\/\d\d\/\d\d\s+/i, '')
  s = /^VIR INST/i.test(s) ? s.replace(/^VIR INST/i, 'INST') : s.replace(/^(VIR SEPA|PRLV SEPA|VIR|PRLV)\s+/i, '')
  return s.replace(/\s+/g, ' ').trim()
}

export function key(label: string): string {
  let s = deaccent(label).toLowerCase()
  s = s.replace(/\bcarte \d\d\/\d\d\/\d\d\b/g, '')
  s = s.replace(/\bcb\*\d+/g, '')
  s = s.replace(/\b\d+,\d+ [a-z]{3} \/ 1 euro = [\d,.]+/g, '')
  s = s.replace(/\bref\s*:?.*$/, '')
  s = s.replace(/^(vir inst|vir|prlv sepa|prlv)\s+/, '')
  return s.replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Même clé que la requête d'historique SQL (libellé sans « CB*… », minuscule). */
export const histKey = (label: string) => label.replace(/\s*CB\*\d+.*$/i, '').toLowerCase().trim()

export async function sha1hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function extId(source: string, l4: string, date: string, amount: number, raw: string, rank: number) {
  const h = (await sha1hex(deaccent(raw).toLowerCase().replace(/\s+/g, ' '))).slice(0, 8)
  return `${source}:${l4}:${date}:${Math.round(amount * 100)}:${h}:${rank}`
}

/** Ratio de difflib.SequenceMatcher (sans heuristique « autojunk », chaînes courtes). */
export function ratio(a: string, b: string): number {
  if (!a.length && !b.length) return 1
  const matches = (alo: number, ahi: number, blo: number, bhi: number): number => {
    let bi = alo, bj = blo, bk = 0
    let prev = new Map<number, number>()
    for (let i = alo; i < ahi; i++) {
      const cur = new Map<number, number>()
      for (let j = blo; j < bhi; j++) {
        if (a[i] !== b[j]) continue
        const k = (prev.get(j - 1) ?? 0) + 1
        cur.set(j, k)
        if (k > bk) { bi = i - k + 1; bj = j - k + 1; bk = k }
      }
      prev = cur
    }
    if (!bk) return 0
    return bk + matches(alo, bi, blo, bj) + matches(bi + bk, ahi, bj + bk, bhi)
  }
  return (2 * matches(0, a.length, 0, b.length)) / (a.length + b.length)
}
export const sim = (a: string, b: string) => ratio(key(a), key(b))

// ---------------------------------------------------------------- catégories
class Counter {
  m = new Map<string, number>()
  add(k: string, n: number) { this.m.set(k, (this.m.get(k) ?? 0) + n) }
  get size() { return this.m.size }
  top(): string | undefined { let best: string | undefined, bn = -Infinity; for (const [k, n] of this.m) if (n > bn) { best = k; bn = n }; return best }
}

export function catByName(cats: SnapCategory[]): Map<string, SnapCategory> {
  const out = new Map<string, SnapCategory>()
  const put = (k: string, c: SnapCategory) => { const cur = out.get(k); if (!cur || c.n > cur.n) out.set(k, c) }
  for (const c of cats) {
    put(c.name.toLowerCase(), c)
    if (c.parent) put(`${c.parent} › ${c.name}`.toLowerCase(), c)
  }
  return out
}

export type History = { hist: Map<string, Counter>; full: [string, string, number][] }
export function buildHistory(snap: Snapshot): History {
  const hist = new Map<string, Counter>()
  const at = (k: string) => { let c = hist.get(k); if (!c) hist.set(k, (c = new Counter())); return c }
  for (const [lbl, cat, n, man] of snap.label_cat) if (cat) at(lbl).add(cat, n + 2 * man)
  const full: [string, string, number][] = []
  for (const t of snap.transactions) {
    if (!t.category) continue
    const w = t.category_manual ? 3 : 1
    at(histKey(t.label)).add(t.category, w)
    full.push([key(t.label), t.category, w])
  }
  return { hist, full }
}

export function pickCategory(label: string, amount: number, h: History): [string, string] {
  const hk = histKey(label)
  const c0 = h.hist.get(hk)
  if (c0 && c0.size) return [c0.top()!, 'historique']
  const k = key(label)
  if (k.length >= 6) {
    const c = new Counter()
    for (const [fk, cat, w] of h.full) if (fk.startsWith(k) || (fk.length >= 6 && k.startsWith(fk))) c.add(cat, w)
    if (c.size) return [c.top()!, 'historique']
  }
  return amount < 0 ? ['Dépenses du mois › Achats', 'defaut-achats'] : ['Non catégorisé', 'defaut']
}

// ---------------------------------------------------------------- appariement
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000

export function matchAccount(rows: { date: string; amount: number; raw: string }[], ex: { date: string; amount: number; label: string }[], tol = 3) {
  const used = new Set<number>(); const res = new Map<number, number>()
  const order = rows.map((_, i) => i).sort((i, j) => (rows[i]!.date < rows[j]!.date ? -1 : rows[i]!.date > rows[j]!.date ? 1 : 0))
  for (const i of order) {
    const x = rows[i]!
    let best: [number, number, number] | undefined
    ex.forEach((y, j) => {
      if (used.has(j) || Math.abs(y.amount - x.amount) > 0.004) return
      const dd = days(y.date, x.date)
      if (dd > tol) return
      const c: [number, number, number] = [dd, -sim(x.raw, y.label), j]
      if (!best || c[0] < best[0] || (c[0] === best[0] && (c[1] < best[1] || (c[1] === best[1] && c[2] < best[2])))) best = c
    })
    if (best) { used.add(best[2]); res.set(i, best[2]) }
  }
  return res
}

// ---------------------------------------------------------------- Enable Banking
export const signed = (t: EbTransaction) => {
  const a = Number(t.transaction_amount.amount)
  return Math.round((t.credit_debit_indicator === 'CRDT' ? a : -a) * 100) / 100
}
const firstLine = (t: EbTransaction) => (t.remittance_information ?? []).map((x) => (x ?? '').trim()).find(Boolean) ?? '(sans libellé)'

/** Derniers 4 chiffres du n° de compte (IBAN FR : 11 chiffres de compte + clé RIB). */
export const last4 = (iban?: string | null) => (iban ? iban.slice(-17, -2).slice(-4) : '')

export function pickBalance(bals: EbBalance[]): number | null {
  const by = new Map(bals.map((b) => [b.balance_type, Number(b.balance_amount.amount)]))
  for (const t of ['XPCD', 'CLBD', 'ITAV', 'ITBD', 'CLAV']) if (by.has(t)) return by.get(t)!
  return bals.length ? Number(bals[0]!.balance_amount.amount) : null
}

export type AccountInput = { accountId: string; l4: string; txs: EbTransaction[]; balances: EbBalance[] }
export type AccountReport = {
  account_id: string; l4: string; name: string; booked: number; already_other_source: number; already_imported: number
  new_booked: number; pending: number; pending_new: number; balance: number | null; balance_before: number | null; balance_manual: boolean
}

export async function analyse(source: string, inputs: AccountInput[], snap: Snapshot, today: string, overrides: Record<string, { category?: string; internal?: boolean; excluded?: boolean }> = {}) {
  const cats = catByName(snap.categories)
  const h = buildHistory(snap)
  const known = new Set(snap.transactions.map((t) => t.external_id).filter(Boolean) as string[])
  const accById = new Map(snap.accounts.map((a) => [a.id, a]))
  const out: OutTx[] = []; const reports: AccountReport[] = []; const balances: { account_id: string; balance: number; as_of: string }[] = []
  const catId = (c: string) => cats.get(c.toLowerCase())?.id ?? null
  for (const inp of inputs) {
    const acc = accById.get(inp.accountId)
    if (!acc) throw new Error(`compte Horizon ${inp.accountId} absent de l'instantané`)
    if (acc.source === 'virtuel') throw new Error('le compte virtuel ne reçoit jamais d\'import')
    const book = inp.txs.filter((t) => t.status === 'BOOK' && t.booking_date)
      .map((t, i) => ({ t, i })).sort((a, b) => (a.t.booking_date! < b.t.booking_date! ? 1 : a.t.booking_date! > b.t.booking_date! ? -1 : a.i - b.i)).map((x) => x.t)
    const rows = book.map((t) => ({ date: t.booking_date!, amount: signed(t), raw: firstLine(t) }))
    const ex = snap.transactions.filter((t) => t.account_id === inp.accountId && t.source !== source && t.source !== 'ventilation' && !t.pending)
    const m = matchAccount(rows, ex)
    const seen = new Map<string, number>()
    const rep: AccountReport = { account_id: inp.accountId, l4: inp.l4, name: acc.name, booked: rows.length, already_other_source: 0, already_imported: 0,
      new_booked: 0, pending: 0, pending_new: 0, balance: null, balance_before: acc.balance_source ?? null, balance_manual: !!acc.balance_manual_at }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!
      const k = `${r.date}|${r.amount}|${key(r.raw)}`; const rank = (seen.get(k) ?? 0) + 1; seen.set(k, rank)
      const id = await extId(source, inp.l4, r.date, r.amount, r.raw, rank)
      if (known.has(id)) { rep.already_imported++; continue }
      if (m.has(i)) { rep.already_other_source++; continue }
      const label = finaryLabel(r.raw)
      let [cat, origin] = pickCategory(label, r.amount, h)
      const o = overrides[id] ?? {}
      let internal = o.internal ?? cat === 'Virement interne'
      if (o.category) { cat = o.category; origin = 'correction' } else if (internal) cat = 'Virement interne'
      out.push({ account_id: inp.accountId, external_id: id, date: r.date, amount: r.amount, label, category_id: catId(cat),
        internal, excluded: o.excluded ?? internal, pending: false, _category: cat, _origin: origin, _l4: inp.l4 })
      rep.new_booked++
    }
    for (const t of inp.txs) {
      if (t.status !== 'PDNG' || Math.abs(signed(t)) <= 0.004 || !t.entry_reference) continue
      const id = `${source}-pdng:${inp.l4}:${t.entry_reference}`
      const label = finaryLabel(firstLine(t))
      const [cat, origin] = pickCategory(label, signed(t), h)
      rep.pending++; if (!known.has(id)) rep.pending_new++
      const internal = cat === 'Virement interne' // virement entre comptes : exclu, comme les lignes comptabilisées
      out.push({ account_id: inp.accountId, external_id: id, date: t.transaction_date ?? t.value_date ?? today, amount: signed(t), label,
        category_id: catId(cat), internal, excluded: internal, pending: true, _category: cat, _origin: origin, _l4: inp.l4 })
    }
    const b = pickBalance(inp.balances)
    rep.balance = b
    if (b !== null) balances.push({ account_id: inp.accountId, balance: b, as_of: today })
    reports.push(rep)
  }
  return { transactions: out, balances, reports }
}

/** Charge utile de fin_sync_apply (sans les champs de diagnostic). */
export function payload(source: string, r: Awaited<ReturnType<typeof analyse>>, syncedAccounts: string[]) {
  return {
    source,
    transactions: r.transactions.map(({ _category: _c, _origin: _o, _l4: _l, ...t }) => t),
    balances: r.balances,
    pending_sync: syncedAccounts,
  }
}

// ---------------------------------------------------------------- horaire / consentement
export const SYNC_HOURS_PARIS = [8, 14, 20]

/** Heure locale à Paris (gère l'heure d'été/hiver). */
export function parisHour(d: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(d))
}
/** Le cron tourne à 6,7,12,13,18,19 h UTC ; seule l'exécution qui tombe à 8/14/20 h Paris synchronise. */
export const isSyncSlot = (d: Date) => SYNC_HOURS_PARIS.includes(parisHour(d))

/** Jours restants avant l'expiration du consentement (arrondi à l'inférieur). */
export const consentDaysLeft = (validUntil: string, now: Date) => Math.floor((Date.parse(validUntil) - now.getTime()) / 86400000)
export const CONSENT_ALERT_DAYS = 14
export const consentNeedsAlert = (validUntil: string | null | undefined, now: Date) => !!validUntil && consentDaysLeft(validUntil, now) <= CONSENT_ALERT_DAYS
