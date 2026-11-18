// ================================================================
// Hors ligne — file des « petites actions » faites sans réseau.
//
// Cocher une course, une tâche, une habitude, noter une séance : ces gestes
// ne doivent jamais dépendre du réseau. Ils sont appliqués tout de suite à
// l'écran, gardés ici (localStorage), puis envoyés dans l'ordre au retour du
// réseau. Le reste des modifications demande le réseau (pas de conflits à
// arbitrer avec l'ordinateur).
//
// Tout ce qui suit est pur (sans réseau ni store) : testé dans file.test.ts.
// ================================================================

export type OpHorsLigne = 'insert' | 'update' | 'delete' | 'upsert'

export interface ActionHorsLigne {
  id: string
  table: string
  op: OpHorsLigne
  /** Ligne visée (pour une création : l'id choisi sur l'appareil). */
  rowId: string
  /** Ce qui sera envoyé à Supabase. */
  values: Record<string, unknown>
  /** Champs d'affichage seulement (valeurs par défaut d'une ligne créée hors ligne), jamais envoyés. */
  locale?: Record<string, unknown>
  at: string
}

/** Champs d'une tâche qu'on peut changer hors ligne : la cocher, la déplacer, l'épingler. */
const CHAMPS_TACHE = new Set(['status', 'done_at', 'scheduled_date', 'ideal_date', 'home_pinned', 'home_hidden', 'sort_order'])

/** Ce qui peut attendre le réseau. Tout le reste est refusé hors ligne (avec un message). */
export function actionPermise(table: string, op: OpHorsLigne, values: Record<string, unknown> = {}): boolean {
  switch (table) {
    case 'shopping_items':
    case 'habit_logs':
      return op !== 'upsert'
    case 'tasks':
      return op === 'update' && Object.keys(values).length > 0 && Object.keys(values).every((k) => CHAMPS_TACHE.has(k))
    case 'training_sessions':
      return op === 'upsert' || op === 'delete'
    default:
      return false
  }
}

/** Ajoute une action à la file en la fusionnant avec ce qui attend déjà pour la même ligne :
 *  la file reste courte et ne rejoue jamais un état intermédiaire inutile. */
export function ajouterAction(file: ActionHorsLigne[], a: ActionHorsLigne, envoi?: string | null): ActionHorsLigne[] {
  // L'action en cours d'envoi (`envoi`) est figée : la modifier ferait perdre le
  // geste qui arrive pendant l'envoi (elle sera retirée de la file une fois reçue).
  const memeLigne = (x: ActionHorsLigne) => x.table === a.table && x.rowId === a.rowId && x.id !== envoi
  const creation = file.find((x) => memeLigne(x) && x.op === 'insert')
  if (a.op === 'delete') {
    // Jamais arrivée au serveur : on oublie la ligne, rien à envoyer.
    if (creation) return file.filter((x) => !memeLigne(x))
    return [...file.filter((x) => !memeLigne(x)), a]
  }
  if (a.op === 'update') {
    if (creation) {
      return file.map((x) => (x === creation ? { ...x, values: { ...x.values, ...a.values } } : x))
    }
    const derniere = [...file].reverse().find(memeLigne)
    if (derniere?.op === 'update') {
      return file.map((x) => (x === derniere ? { ...x, values: { ...x.values, ...a.values }, at: a.at } : x))
    }
    return [...file, a]
  }
  if (a.op === 'upsert') return [...file.filter((x) => !memeLigne(x)), a]
  return [...file, a]
}

/** Rejoue la file sur des lignes chargées : l'écran montre l'état voulu même
 *  si le serveur ne l'a pas encore reçu (après un rechargement, par exemple). */
export function appliquerActions<T extends { id: string }>(rows: T[], table: string, file: ActionHorsLigne[]): T[] {
  let res = rows
  for (const a of file) {
    if (a.table !== table) continue
    if (a.op === 'delete') res = res.filter((r) => r.id !== a.rowId)
    else if (a.op === 'update') res = res.map((r) => (r.id === a.rowId ? { ...r, ...a.values } : r))
    else {
      const ligne = { ...a.locale, ...a.values } as unknown as T
      res = res.some((r) => r.id === a.rowId)
        ? res.map((r) => (r.id === a.rowId ? { ...r, ...ligne } : r))
        : [...res, ligne]
    }
  }
  return res
}

/** Nouvelle action, horodatée. */
export function nouvelleAction(table: string, op: OpHorsLigne, rowId: string, values: Record<string, unknown>,
  locale?: Record<string, unknown>): ActionHorsLigne {
  return { id: `hl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, table, op, rowId, values, locale, at: new Date().toISOString() }
}

// ---- Persistance sur l'appareil ----

const CLE = 'horizon.horsligne.file'
let enVol: string | null = null
/** L'action en cours d'envoi au serveur (voir `ajouterAction`). */
export function marquerEnvoi(id: string | null): void { enVol = id }

export function lireFile(): ActionHorsLigne[] {
  try {
    const brut = localStorage.getItem(CLE)
    const liste: unknown = brut ? JSON.parse(brut) : []
    return Array.isArray(liste) ? (liste as ActionHorsLigne[]) : []
  } catch { return [] }
}

export function ecrireFile(file: ActionHorsLigne[]): void {
  try {
    if (file.length) localStorage.setItem(CLE, JSON.stringify(file))
    else localStorage.removeItem(CLE)
  } catch { /* stockage indisponible */ }
}

/** Ajoute une action à la file de l'appareil ; renvoie la file à jour. */
export function enfiler(a: ActionHorsLigne): ActionHorsLigne[] {
  const file = ajouterAction(lireFile(), a, enVol)
  ecrireFile(file)
  return file
}

/** Le réseau est-il manifestement absent ? (navigator.onLine peut mentir dans
 *  l'autre sens : « en ligne » sans connexion réelle — l'échec de la requête le dira.) */
export const reseauAbsent = () => typeof navigator !== 'undefined' && navigator.onLine === false
