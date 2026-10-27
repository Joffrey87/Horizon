// ================================================================
// Compte à rebours calé sur l'horloge (pas sur les ticks : il reste juste
// si l'onglet passe en arrière-plan), avec bips 3-2-1 et vibration à la fin.
// ================================================================
import { useCallback, useEffect, useRef, useState } from 'react'

let audio: AudioContext | null = null

/** À appeler dans un geste (clic) : sans ça, iOS n'autorise pas le son. */
export function amorcerSon() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audio ??= new Ctx()
    if (audio.state === 'suspended') void audio.resume()
  } catch { /* pas de son disponible */ }
}

function bip(freq = 880, duree = 0.15, volume = 0.25) {
  if (!audio) return
  try {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.frequency.value = freq
    gain.gain.setValueAtTime(volume, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duree)
    osc.connect(gain).connect(audio.destination)
    osc.start()
    osc.stop(audio.currentTime + duree)
  } catch { /* ignoré */ }
}

const vibrer = (motif: number[]) => {
  try { navigator.vibrate?.(motif) } catch { /* ignoré */ }
}

export function useCompteARebours(surFin: () => void) {
  const [finA, setFinA] = useState<number | null>(null)
  const [enPause, setEnPause] = useState<number | null>(null)
  const [total, setTotal] = useState(0)
  const [maintenant, setMaintenant] = useState(() => Date.now())
  const surFinRef = useRef(surFin)
  const finRef = useRef(finA)
  const pauseRef = useRef(enPause)
  const dernierBip = useRef<number | null>(null)
  useEffect(() => {
    surFinRef.current = surFin
    finRef.current = finA
    pauseRef.current = enPause
  })

  useEffect(() => {
    if (finA == null || enPause != null) return
    const id = window.setInterval(() => setMaintenant(Date.now()), 200)
    return () => window.clearInterval(id)
  }, [finA, enPause])

  useEffect(() => {
    if (finA == null || enPause != null) return
    const reste = finA - maintenant
    const s = Math.ceil(reste / 1000)
    if (s > 0 && s <= 3 && dernierBip.current !== s) {
      dernierBip.current = s
      bip(660, 0.08)
    }
    if (reste <= 0) {
      setFinA(null)
      bip(990, 0.4, 0.35)
      vibrer([250, 100, 250])
      surFinRef.current()
    }
  }, [maintenant, finA, enPause])

  const demarrer = useCallback((secondes: number) => {
    dernierBip.current = null
    const t = Date.now()
    setMaintenant(t)
    setEnPause(null)
    setTotal(secondes)
    setFinA(t + secondes * 1000)
  }, [])

  const pause = useCallback(() => {
    const f = finRef.current
    if (f != null && pauseRef.current == null) setEnPause(Math.max(0, f - Date.now()))
  }, [])

  const reprendre = useCallback(() => {
    const p = pauseRef.current
    if (p == null) return
    const t = Date.now()
    setMaintenant(t)
    setFinA(t + p)
    setEnPause(null)
  }, [])

  const ajouter = useCallback((secondes: number) => {
    setTotal((x) => x + secondes)
    setEnPause((p) => (p != null ? p + secondes * 1000 : p))
    setFinA((f) => (f != null ? f + secondes * 1000 : f))
  }, [])

  const arreter = useCallback(() => {
    setFinA(null)
    setEnPause(null)
  }, [])

  const resteMs = enPause ?? (finA != null ? Math.max(0, finA - maintenant) : 0)
  return {
    actif: finA != null,
    enPause: enPause != null,
    resteSec: Math.ceil(resteMs / 1000),
    totalSec: total,
    demarrer,
    pause,
    reprendre,
    ajouter,
    arreter,
  }
}

export type CompteARebours = ReturnType<typeof useCompteARebours>

/** 75 → « 1:15 » ; 4500 → « 1 h 15 ». */
export const chrono = (sec: number) => {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`
}
