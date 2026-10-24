// ================================================================
// Partage d'onglets avec un autre compte (ex. Honorine) — règles pures.
//
// La sécurité est dans la base (policies RLS de la migration « partages ») :
// le membre ne REÇOIT que ce qui est partagé. Ces règles servent à l'écran :
// menu limité, lecture seule, et l'aperçu « Voir comme… » du propriétaire,
// qui applique ici le même filtre que la base.
// ================================================================
import type { Partage, Project, Task } from './types'

export type OngletPartage = 'finances' | 'temps'

export const ONGLETS_PARTAGE: { cle: OngletPartage; label: string; route: string }[] = [
  { cle: 'finances', label: 'Finances', route: '/finances' },
  { cle: 'temps', label: 'Agenda', route: '/temps' },
]

/** Pages de Finances ouvertes au partage (résumé, budget, bilan, patrimoine). */
export const FINANCES_PARTAGEES = ['/finances', '/finances/budget', '/finances/bilan', '/finances/patrimoine']

/** Tables qu'un membre peut modifier (s'il peut ranger les opérations). */
const MODIFIABLES = ['fin_transactions', 'fin_labels', 'fin_groups', 'fin_merchant_alias']

/** La vue partagée en cours : celle reçue (membre), sinon l'aperçu du propriétaire. */
export function vueActive(opts: { partages: Partage[]; moi: string | null; apercu: string | null }): Partage | null {
  const recu = opts.partages.find((p) => p.member_id === opts.moi && p.owner_id !== opts.moi)
  if (recu) return recu
  return opts.apercu ? opts.partages.find((p) => p.id === opts.apercu) ?? null : null
}

/** Une page est-elle accessible dans cette vue ? */
export function routeAutorisee(chemin: string, vue: Partage): boolean {
  if (!vue.actif) return false
  if (vue.onglets.includes('temps') && (chemin === '/temps' || chemin.startsWith('/temps/'))) return true
  if (vue.onglets.includes('finances')) return FINANCES_PARTAGEES.includes(chemin.replace(/\/$/, '') || '/')
  return false
}

/** Première page à ouvrir dans cette vue. */
export function pageAccueil(vue: Partage): string | null {
  if (!vue.actif) return null
  return ONGLETS_PARTAGE.find((o) => vue.onglets.includes(o.cle))?.route ?? null
}

/** Écriture permise dans cette vue ? (le reste est en lecture seule) */
export function ecriturePermise(table: string, vue: Partage | null): boolean {
  if (!vue) return true
  return vue.actif && vue.onglets.includes('finances') && vue.finances_classer && MODIFIABLES.includes(table)
}

/** Tâches de Temps visibles : jamais un projet masqué ; seulement les évènements si les tâches sont masquées. */
export function tachesVisibles(tasks: Task[], vue: Partage): Task[] {
  const masques = new Set(vue.temps_projets_masques)
  return tasks.filter((t) => (!t.project_id || !masques.has(t.project_id)) && (!vue.temps_taches_masquees || t.is_task === false))
}

export function projetsVisibles(projects: Project[], vue: Partage): Project[] {
  const masques = new Set(vue.temps_projets_masques)
  return projects.filter((p) => !masques.has(p.id))
}
