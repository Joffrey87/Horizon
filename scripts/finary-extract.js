// ================================================================
// Extraction Finary → fichier JSON pour l'onglet Finances d'Horizon.
//
// À exécuter DANS un onglet https://app.finary.com connecté (console du
// navigateur, ou l'agent Claude in Chrome). Le script lit l'API interne de
// Finary avec la session de la page (jeton Clerk) — aucun identifiant n'est
// lu ni stocké — normalise les données au format de `fin_import`, puis
// télécharge `finary-AAAA-MM-JJ.json`.
//
// La page Finary interdit tout envoi réseau hors de chez elle (CSP) : l'envoi
// vers Supabase se fait ensuite avec `node scripts/fin-import.mjs <fichier>`.
//
// Synchro partielle : `window.__HORIZON_DEPUIS = 'AAAA-MM-JJ'` avant de lancer
// ne relit que les opérations depuis cette date (les comptes, positions et le
// patrimoine sont toujours relus en entier — c'est léger).
// ================================================================
await (async () => {
  const API = 'https://api.finary.com'
  const token = await window.Clerk?.session?.getToken()
  if (!token) throw new Error('Pas de session Finary : connecte-toi sur app.finary.com')
  const get = async (path) => {
    const r = await fetch(API + path, { headers: { Authorization: 'Bearer ' + token } })
    if (!r.ok) throw new Error(`Finary ${r.status} sur ${path.split('?')[0]}`)
    return (await r.json()).result
  }

  // Organisation et adhésion de l'utilisateur connecté (rien d'écrit en dur).
  const me = await get('/users/me')
  const orga = (await get('/users/me/organizations'))[0]
  const membre = orga.members.find((m) => m.user?.id === me.id) ?? orga.members[0]
  const base = `/organizations/${orga.id}/memberships/${membre.id}`

  // ---------- Comptes ----------
  const config = await get(`${base}/cashflow/configuration`)
  const comptesBudget = new Set(config.accounts.map((a) => a.id))
  const comptes = await get(`${base}/holdings_accounts?period=1y&with_holdings=true`)
  const genre = (a) => {
    const t = a.holdings_account_type ?? {}
    if (t.account_subtype === 'precious_metal') return 'metaux'
    return { checking: 'courant', savings: 'epargne', investment: 'investissement', crypto: 'crypto',
      real_estate: 'immobilier', loan: 'pret' }[t.account_type] ?? 'autre'
  }
  const accounts = comptes.map((a) => {
    const kind = genre(a)
    const valeur = Number(a.display_balance ?? a.balance ?? 0)
    const inst = a.institution?.name ?? a.bank?.name ?? null
    return {
      external_id: a.id,
      name: a.name,
      institution: inst === 'Default' ? null : inst,
      kind,
      subtype: a.holdings_account_type?.account_subtype ?? null,
      // Compte joint (« M OU MME… ») = commun ; le reste à Joffrey. Réglable ensuite dans Horizon.
      owner: /\bOU\b/.test(a.name) ? 'commun' : 'joffrey',
      in_budget: comptesBudget.has(a.id),
      balance: kind === 'pret' ? -Math.abs(valeur) : valeur,
    }
  })

  // ---------- Positions ----------
  const classeTitre = (nom) => {
    if (/silver|argent/i.test(nom)) return 'argent'
    if (/gold|\bor\b|miners/i.test(nom)) return 'or'
    if (/energy|énergie|energies|oil|pétrol/i.test(nom)) return 'energie'
    if (/bond|oblig|government|treasury|govt/i.test(nom)) return 'obligations'
    return 'actions'
  }
  const holdings = []
  const pos = (a, h, type, name, code, asset_class) => holdings.push({
    external_id: `${type}:${h.id}`, account_external_id: a.id, name: name ?? '?', code: code ?? null,
    quantity: h.quantity ?? null, value: Number(h.display_current_value ?? h.current_value ?? 0),
    buy_value: h.display_buying_value ?? h.buying_value ?? null, asset_class,
  })
  for (const a of comptes) {
    for (const h of a.securities ?? []) {
      const s = h.security ?? h.valuable ?? {}
      pos(a, h, 'sec', s.name, s.isin ?? s.symbol, classeTitre(s.name ?? ''))
    }
    for (const h of a.cryptos ?? []) { const c = h.crypto ?? h.valuable ?? {}; pos(a, h, 'cry', c.name, c.code ?? c.symbol, 'crypto') }
    for (const h of a.precious_metals ?? []) {
      const p = h.precious_metal ?? h.valuable ?? {}
      pos(a, h, 'met', p.name, null, /silver|argent/i.test(`${p.metal} ${p.name}`) ? 'argent' : 'or')
    }
    for (const h of a.fiats ?? []) { const f = h.fiat ?? h.valuable ?? {}; pos(a, h, 'fia', f.name ?? f.code, f.code, 'liquidites') }
    for (const h of a.real_estates ?? []) pos(a, h, 'imm', h.valuable?.name ?? a.name, null, 'immobilier')
    for (const k of ['generic_assets', 'scpis', 'fonds_euro', 'startups', 'crowdlendings']) {
      for (const h of a[k] ?? []) pos(a, h, k.slice(0, 3), h.valuable?.name ?? h.name ?? k, null, k === 'scpis' ? 'immobilier' : 'autre')
    }
  }

  // ---------- Catégories → lignes du budget ----------
  const FR = {
    auto_and_transport: 'Auto & transport', bills_and_utilities: 'Factures & services', business_and_work: 'Professionnel',
    cash_and_checks: 'Espèces & chèques', food_and_beverage: 'Alimentation & boissons', income: 'Revenus',
    leasure_and_entertainment: 'Loisirs & divertissements', investment: 'Investissements', healthcare: 'Santé',
    refunds: 'Remboursements', taxes: 'Impôts & taxes', transfer: 'Virements', personal_and_home_essentials: 'Besoins essentiels',
    unknown: 'Non catégorisé', fees: 'Frais bancaires',
    fuel: 'Carburant', repairs: 'Entretien & réparations', public_transport: 'Transports en commun', taxi: 'Taxi',
    parking: 'Parking', insurance: 'Assurance', car_rental: 'Location de voiture', plane_tickets: "Billets d'avion",
    train_tickets: 'Billets de train', tolls: 'Péages', car_wash: 'Lavage', electricity: 'Électricité', water: 'Eau',
    internet: 'Internet', mobile_phone: 'Téléphone mobile', heating: 'Chauffage', trash_and_recycling: 'Ordures',
    bills_subscriptions: 'Abonnements', withdrawal: 'Retrait', check_deposit: 'Dépôt de chèque', cash_deposit: "Dépôt d'espèces",
    groceries: 'Courses alimentaires', dining_out: 'Restaurants', fast_food: 'Restauration rapide', alcohol_and_bars: 'Bars',
    coffee_shop: 'Café', snacks: 'Snacks', salary_income: 'Salaire', bonuses: 'Primes', investments: 'Revenus de placements',
    gift: 'Dons reçus', rental_income: 'Loyers perçus', movie_and_theater: 'Cinéma & théâtre', sports_and_recreation: 'Sport',
    hobbies: 'Loisirs', subscriptions: 'Abonnements', vacations: 'Vacances', art_and_museum: 'Musées', bonds: 'Obligations',
    stocks: 'Actions', real_estates: 'Immobilier', retirement: 'Retraite', cryptos: 'Cryptos', safety_net: 'Épargne de précaution',
    product_returns: 'Retours produits', tax_refunds: "Remboursements d'impôts", warranty_claims: 'Garanties',
    insurance_payouts: "Indemnités d'assurance", income_taxes: 'Impôt sur le revenu', vat: 'TVA', property_taxes: 'Taxe foncière',
    capital_gain_taxes: 'Impôt sur les plus-values', business_taxes: 'Impôts professionnels', social_contributions: 'Prélèvements sociaux',
    internal_transfer: 'Virement interne', external_transfer: 'Virement externe', gifts_transfer: 'Virement cadeau',
    bill_payment: 'Paiement de facture', international_transfer: 'Virement international', tobacco: 'Tabac', rent: 'Loyer',
    supplies: 'Fournitures', personal_care: 'Soins personnels', clothing: 'Vêtements', education: 'Éducation',
    childcare: "Garde d'enfants", student_housing: 'Logement étudiant', tuition: 'Frais de scolarité', personal_gifts: 'Cadeaux',
    pets: 'Animaux', bank_fees: 'Frais bancaires', late_fees: 'Pénalités', service_charge: 'Frais de service',
    doctor_visit: 'Médecin', dentist_visit: 'Dentiste', medication: 'Médicaments', health_insurance: 'Mutuelle',
    medical_equipment: 'Matériel médical', optician: 'Opticien',
  }
  const libelle = (n) => FR[n] ?? (/^[a-z_]+$/.test(n) ? (n[0].toUpperCase() + n.slice(1)).replace(/_/g, ' ') : n.trim())
  // Ligne de budget par défaut (posée à la création seulement ; modifiable dans Horizon).
  const LIGNE = {
    'Frais fixe': 'Frais fixe', Courses: 'Courses', 'Travaux & Aménagement': 'Aménagement', 'Épargne Vacances': 'Épargne vacances',
    Vacances: 'Vacances', investment: 'Épargne avenir', "Epargne d'urgence": 'Matelas sécurité', Dons: 'Dons',
    'Dépenses exceptionnelles': 'Dépenses exceptionnelles', 'Dépenses du mois': 'Dépenses courantes', Achats: 'Dépenses courantes',
    bills_and_utilities: 'Frais fixe', taxes: 'Frais fixe', fees: 'Frais fixe',
    food_and_beverage: 'Dépenses courantes', auto_and_transport: 'Dépenses courantes', leasure_and_entertainment: 'Dépenses courantes',
    personal_and_home_essentials: 'Dépenses courantes', healthcare: 'Dépenses courantes', cash_and_checks: 'Dépenses courantes',
    business_and_work: 'Dépenses courantes',
  }
  // Sous-catégories qui ne suivent pas la ligne de leur parent.
  const LIGNE_SOUS = { groceries: 'Courses', vacations: 'Vacances', safety_net: 'Matelas sécurité' }
  const ROLE = { income: 'revenu', refunds: 'revenu', transfer: 'hors_budget' }
  const parId = new Map(config.categories.map((c) => [c.id, c]))
  const categories = []
  const vues = new Set()
  const ajouteCat = (c, parent) => {
    if (vues.has(c.id)) return
    vues.add(c.id)
    const nom = c.name.trim()
    const racine = parent ? parent.name.trim() : nom
    categories.push({
      external_id: String(c.id),
      parent_external_id: parent ? String(parent.id) : null,
      name: libelle(nom),
      role: ROLE[racine] ?? 'depense',
      line: parent ? (LIGNE_SOUS[nom] ?? null) : (LIGNE[nom] ?? null),
    })
  }
  for (const c of config.categories) {
    const parent = c.is_subcategory ? parId.get(c.main_category_id) ?? null : null
    if (parent) ajouteCat(parent, null)
    ajouteCat(c, parent)
    for (const s of c.subcategories ?? []) ajouteCat(s, c)
  }

  // ---------- Opérations ----------
  const depuis = window.__HORIZON_DEPUIS ?? null
  const transactions = []
  const dejaVu = new Set()
  for (let page = 1; page < 500; page++) {
    const lot = await get(`${base}/transactions?page=${page}&per_page=200`)
    if (!lot?.length) break
    for (const t of lot) {
      const date = String(t.date).slice(0, 10)
      if (depuis && date < depuis) continue
      if (dejaVu.has(t.id) || !t.account?.id) continue
      dejaVu.add(t.id)
      const cat = t.subcategory ?? t.category
      if (t.subcategory && t.category) ajouteCat(t.category, null)
      if (cat) ajouteCat(cat, t.subcategory ? t.category : null)
      transactions.push({
        external_id: String(t.id), account_external_id: t.account.id, date,
        amount: Number(t.display_value ?? t.value), label: (t.simplified_name || t.name || '').trim(),
        category_external_id: cat ? String(cat.id) : null,
        internal: !!t.is_internal_transfer, excluded: t.include_in_analysis === false,
      })
    }
    // Les pages vont du plus récent au plus ancien : on s'arrête une fois la date dépassée.
    if (depuis && lot.every((t) => String(t.date).slice(0, 10) < depuis)) break
  }

  // ---------- Historique du patrimoine ----------
  const serie = async (type) => {
    const r = await get(`${base}/holdings_accounts/timeseries?period=all&timeseries_type=sum&wealth_type=${type}`)
    return new Map((r?.[0]?.timeseries ?? []).map((p) => [String(p[0]).slice(0, 10), Number(p[1])]))
  }
  const [net, brut] = await Promise.all([serie('net'), serie('gross')])
  const networth = [...net].map(([date, v]) => ({ date, net: v, gross: brut.get(date) ?? null }))

  // Finary garde des comptes vides (anciens métaux, exchanges fermés…) : on ne
  // garde que ceux qui ont une valeur, des positions ou des opérations.
  const actifs = new Set([...transactions.map((t) => t.account_external_id), ...holdings.map((h) => h.account_external_id)])
  const comptesUtiles = accounts.filter((a) => a.balance !== 0 || actifs.has(a.external_id))

  const payload = { source: 'finary', generated_at: new Date().toISOString(), accounts: comptesUtiles, categories, transactions, holdings, networth }
  const fichier = `finary-${new Date().toISOString().slice(0, 10)}.json`
  // `window.__HORIZON_SANS_FICHIER = true` : essai à blanc, rien n'est téléchargé.
  if (!window.__HORIZON_SANS_FICHIER) {
    const lien = document.createElement('a')
    lien.href = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' }))
    lien.download = fichier
    document.body.appendChild(lien)
    lien.click()
    lien.remove()
  }

  const dates = transactions.map((t) => t.date).sort()
  return {
    fichier: window.__HORIZON_SANS_FICHIER ? null : fichier, octets: JSON.stringify(payload).length, comptes: comptesUtiles.length,
    comptes_budget: comptesUtiles.filter((a) => a.in_budget).length, categories: categories.length, operations: transactions.length,
    du: dates[0] ?? null, au: dates.at(-1) ?? null, positions: holdings.length, points_patrimoine: networth.length,
    sans_categorie: transactions.filter((t) => !t.category_external_id).length,
    signe: { sorties: transactions.filter((t) => t.amount < 0).length, entrees: transactions.filter((t) => t.amount > 0).length },
  }
})()
