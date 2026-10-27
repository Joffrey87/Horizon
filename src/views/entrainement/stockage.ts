// ================================================================
// Entraînement — historique des séances (table training_sessions) et
// statistiques pures (dernière performance, records, tonnage).
// En mode démo, demo-main.tsx remplace le stockage par une version en mémoire.
// ================================================================
import { supabase } from '../../lib/supabase'
import { useHorizon } from '../../lib/store'
import type { SeanceId } from './programme'

export interface SerieFaite {
  exerciceId: string
  exerciceNom: string
  numero: number
  cote?: 'gauche' | 'droit'
  cible: string
  kg?: number
  reps?: number
  secondes?: number
}

export interface SeanceFaite {
  id: string
  seance: SeanceId
  debut: string
  fin: string
  dureeSec: number
  notes: string
  series: SerieFaite[]
}

export interface StockageEntrainement {
  lister(): Promise<SeanceFaite[]>
  enregistrer(s: SeanceFaite): Promise<void>
  supprimer(id: string): Promise<void>
}

interface Ligne {
  id: string
  session_type: SeanceId
  started_at: string
  ended_at: string
  duration_sec: number
  notes: string | null
  sets: SerieFaite[] | null
}

const TABLE = 'training_sessions'

export const stockageSupabase: StockageEntrainement = {
  async lister() {
    const { data, error } = await supabase.from(TABLE).select('*').order('started_at', { ascending: false })
    if (error) throw new Error(error.message)
    return ((data ?? []) as Ligne[]).map((l) => ({
      id: l.id,
      seance: l.session_type,
      debut: l.started_at,
      fin: l.ended_at,
      dureeSec: l.duration_sec,
      notes: l.notes ?? '',
      series: l.sets ?? [],
    }))
  },
  async enregistrer(s) {
    const uid = useHorizon.getState().session?.user.id
    if (!uid) throw new Error('session expirée, reconnectez-vous')
    const { error } = await supabase.from(TABLE).upsert({
      id: s.id,
      user_id: uid,
      session_type: s.seance,
      started_at: s.debut,
      ended_at: s.fin,
      duration_sec: s.dureeSec,
      notes: s.notes || null,
      sets: s.series,
    })
    if (error) throw new Error(error.message)
  },
  async supprimer(id) {
    const { error } = await supabase.from(TABLE).delete().eq('id', id)
    if (error) throw new Error(error.message)
  },
}

/** Stockage volatil (mode démo) : rien ne survit au rechargement. */
export function stockageMemoire(): StockageEntrainement {
  let seances: SeanceFaite[] = []
  return {
    async lister() { return [...seances].sort((a, b) => b.debut.localeCompare(a.debut)) },
    async enregistrer(s) { seances = [s, ...seances.filter((x) => x.id !== s.id)] },
    async supprimer(id) { seances = seances.filter((x) => x.id !== id) },
  }
}

let courant: StockageEntrainement = stockageSupabase
export const stockageEntrainement = () => courant
export function utiliserStockageEntrainement(s: StockageEntrainement) { courant = s }

// ---- Séance en cours : gardée sur l'appareil pour reprendre après une fermeture ----

export interface SaisieSerie {
  kg?: number
  reps?: number
  secondes?: number
  faite?: boolean
  passee?: boolean
}

export interface SeanceEnCours {
  id: string
  seance: SeanceId
  debut: number
  index: number
  phase: 'effort' | 'repos'
  /** Fin du repos en cours (horodatage ms). */
  finRepos?: number | null
  saisies: Record<string, SaisieSerie>
}

const CLE_EN_COURS = 'horizon.entrainement.encours'

export function lireEnCours(): SeanceEnCours | null {
  try {
    const brut = localStorage.getItem(CLE_EN_COURS)
    return brut ? (JSON.parse(brut) as SeanceEnCours) : null
  } catch {
    return null
  }
}

export function ecrireEnCours(s: SeanceEnCours | null) {
  try {
    if (s) localStorage.setItem(CLE_EN_COURS, JSON.stringify(s))
    else localStorage.removeItem(CLE_EN_COURS)
  } catch { /* stockage indisponible */ }
}

// ---- Statistiques (pures) ----

/** 1RM estimé (formule d'Epley). */
export const unRm = (kg: number, reps: number) => (reps <= 1 ? kg : kg * (1 + reps / 30))

/** Dernière performance sur la même série (l'historique est trié du plus récent au plus ancien). */
export function dernierePerf(historique: SeanceFaite[], exerciceId: string, numero: number, cote?: string) {
  for (const s of historique) {
    const trouvee = s.series.find((x) => x.exerciceId === exerciceId && x.numero === numero && x.cote === cote)
    if (trouvee) return trouvee
  }
  return undefined
}

export interface Record_ {
  exerciceId: string
  exerciceNom: string
  kg: number
  reps: number
  unRm: number
  date: string
}

/** Meilleure série de chaque exercice, au sens du 1RM estimé. */
export function records(historique: SeanceFaite[]): Record_[] {
  const meilleurs = new Map<string, Record_>()
  for (const s of historique) {
    for (const x of s.series) {
      if (x.kg == null || !x.reps || x.kg <= 0) continue
      const est = unRm(x.kg, x.reps)
      const actuel = meilleurs.get(x.exerciceId)
      if (!actuel || est > actuel.unRm) {
        meilleurs.set(x.exerciceId, { exerciceId: x.exerciceId, exerciceNom: x.exerciceNom, kg: x.kg, reps: x.reps, unRm: est, date: s.debut })
      }
    }
  }
  return [...meilleurs.values()]
}

export const tonnage = (series: SerieFaite[]) => series.reduce((t, x) => t + (x.kg ?? 0) * (x.reps ?? 0), 0)
