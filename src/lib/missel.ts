// ================================================================
// Missel de 1962 (forme extraordinaire) : le jour liturgique et ses propres.
//
// Le jour est déterminé par la LITURGIE, pas par la date : un dimanche est le
// « 14e dimanche après la Pentecôte », une fête prend le pas sur le dimanche,
// et les lectures suivent le jour ainsi obtenu.
//
// La fonction Edge `missel` fait le travail (calendrier + propres en français) ;
// ici on ne garde qu'un cache local, comme pour les lectures AELF.
// ================================================================

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { misselDayName } from './logic'
import type { MassReading } from './aelf'

export interface MisselLecture {
  /** Référence du missel, ex. « Matt 6:24-33 ». */
  ref: string
  /** Incipit latin, ex. « Sequéntia ++ sancti Evangélii secúndum Matthaeum. » */
  incipit: string
  texte: string
}

export interface MisselDay {
  date: string
  /** Identifiant du calendrier, ex. `tempora:Pent14-0:2:g`. */
  id: string
  /** Clé du propre, ex. `Pent14-0` ou `08-15`. */
  cle: string
  titreEn: string
  titreLatin: string
  /** 1 = fête de 1re classe … 4 = férie. */
  rang: number | null
  langue: 'fr' | 'la'
  epitre: MisselLecture | null
  evangile: MisselLecture | null
}

const CACHE_KEY = (date: string) => `horizon.missel.${date}`
const CACHE_PREFIX = 'horizon.missel.'
const CACHE_DAYS = 14

/** Purge les jours trop anciens : le cache ne doit pas grossir sans fin. */
function pruneCache(today: string): void {
  try {
    const limit = new Date(`${today}T12:00:00Z`)
    limit.setUTCDate(limit.getUTCDate() - CACHE_DAYS)
    const floor = limit.toISOString().slice(0, 10)
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(CACHE_PREFIX) && key.slice(CACHE_PREFIX.length) < floor) {
        localStorage.removeItem(key)
      }
    }
  } catch { /* stockage indisponible */ }
}

/** Nom du jour en français ; à défaut, le nom latin de la fête, puis l'anglais. */
export function misselTitre(jour: MisselDay | null): string {
  if (!jour) return ''
  return misselDayName(jour.cle) ?? (jour.titreLatin || jour.titreEn)
}

/** Le propre du jour selon le missel de 1962 (avec cache local par date). */
export async function fetchMissel(date: string): Promise<MisselDay> {
  const cached = localStorage.getItem(CACHE_KEY(date))
  if (cached) {
    try { return JSON.parse(cached) as MisselDay } catch { /* cache corrompu */ }
  }
  const { data, error } = await supabase.functions.invoke('missel', { body: { date } })
  if (error) throw error
  const jour = data as MisselDay & { error?: string }
  if (jour?.error) throw new Error(jour.error)
  if (!jour?.evangile && !jour?.epitre) throw new Error('propre du jour introuvable')
  try { localStorage.setItem(CACHE_KEY(date), JSON.stringify(jour)) } catch { /* quota */ }
  pruneCache(date)
  return jour
}

/** Adapte une lecture du missel à la forme attendue par la page Écritures.
 *  « lecture1 » = l'épître ; elle retombe sur l'évangile si le propre n'en a pas. */
export function misselReading(jour: MisselDay | null, kind: 'evangile' | 'lecture1'): MassReading | undefined {
  if (!jour) return undefined
  const choisie = kind === 'lecture1' ? (jour.epitre ?? jour.evangile) : (jour.evangile ?? jour.epitre)
  if (!choisie) return undefined
  const estEvangile = choisie === jour.evangile
  return {
    type: estEvangile ? 'evangile' : 'lecture_1',
    ref: choisie.ref,
    title: choisie.incipit,
    text: choisie.texte,
  }
}

/** Charge le propre du jour (avec cache localStorage). */
export function useMisselOfDay(date: string) {
  const [jour, setJour] = useState<MisselDay | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivant = true
    setLoading(true); setError(null)
    fetchMissel(date)
      .then((d) => { if (vivant) setJour(d) })
      .catch((e) => { if (vivant) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (vivant) setLoading(false) })
    return () => { vivant = false }
  }, [date])

  return { jour, loading, error }
}
