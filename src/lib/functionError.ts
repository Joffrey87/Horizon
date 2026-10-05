// ================================================================
// Erreurs des fonctions Edge, en clair.
//
// `supabase.functions.invoke` ne renvoie, pour toute réponse non-2xx, que le
// message générique « Edge Function returned a non-2xx status code ». La vraie
// cause (crédit épuisé, clé invalide…) est dans le corps de la réponse, que
// l'on lit ici — sans quoi une panne reste un mystère.
// ================================================================

/** Traduit le message brut d'une fonction (ou d'Anthropic) en phrase claire.
 *  Un message inconnu est rendu tel quel : mieux vaut du brut que du faux. */
export function traduireErreurIA(brut: string): string {
  if (/credit balance is too low|plans? (?:&|and) billing/i.test(brut)) {
    return 'Crédit API Anthropic épuisé : à recharger sur console.anthropic.com (Billing). Rien n’est perdu côté Horizon.'
  }
  if (/ANTHROPIC_API_KEY manquante|invalid x-api-key|authentication_error/i.test(brut)) {
    return 'Clé API Anthropic absente ou invalide (secret ANTHROPIC_API_KEY de la fonction, côté Supabase).'
  }
  if (/rate_limit|Anthropic 429/i.test(brut)) {
    return 'Limite de débit Anthropic atteinte : réessaie dans une minute.'
  }
  if (/overloaded|Anthropic 529/i.test(brut)) {
    return 'L’API Anthropic est surchargée : réessaie dans un instant.'
  }
  if (/non authentifié/i.test(brut)) {
    return 'Session expirée : reconnecte-toi.'
  }
  return brut
}

/** Message lisible d'une erreur renvoyée par `supabase.functions.invoke`.
 *  Lit le corps JSON `{ error }` de la réponse quand il existe. */
export async function messageFonction(error: unknown): Promise<string> {
  const ctx = (error as { context?: unknown } | null)?.context
  let brut = ''
  if (ctx instanceof Response) {
    try {
      const texte = await ctx.text()
      try {
        const corps = JSON.parse(texte) as { error?: unknown }
        brut = typeof corps?.error === 'string' ? corps.error : texte
      } catch { brut = texte }
    } catch { /* corps déjà lu ou illisible */ }
  }
  if (!brut) brut = error instanceof Error ? error.message : String(error)
  return traduireErreurIA(brut)
}
