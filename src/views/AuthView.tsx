import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { wallpaperOfDay } from '../lib/logic'

// Correspondance prénom -> email, fournie par VITE_LOGIN_MAP (hors dépôt public) :
// l'adresse n'est jamais affichée, on choisit seulement qui se connecte.
const LOGIN_MAP: Record<string, string> = (() => {
  try { return JSON.parse(import.meta.env.VITE_LOGIN_MAP ?? '{}') } catch { return {} }
})()

/** Les deux accès de l'écran de connexion. */
const PERSONNES = ['Joffrey', 'Honorine'] as const
type Personne = (typeof PERSONNES)[number]

const emailDe = (p: Personne): string | null => LOGIN_MAP[p.toLowerCase()] ?? null
/** « de Joffrey », « d’Honorine ». */
const de = (p: string) => (/^[aeiouyh]/i.test(p) ? `d’${p}` : `de ${p}`)

/** Espace entre la majuscule manuscrite et la suite du prénom, réglé à l'œil pour chaque lettre (px). */
const ECART: Record<Personne, number> = { Joffrey: 2, Honorine: 1 }

// Dernier accès choisi sur cet appareil (simple commodité, sans garantie).
const CLE_CHOIX = 'horizon.connexion.personne'
const choixMemorise = (): Personne | null => {
  try {
    const v = localStorage.getItem(CLE_CHOIX)
    return PERSONNES.find((p) => p === v) ?? null
  } catch { return null }
}

export function AuthView() {
  const [personne, setPersonne] = useState<Personne | null>(() => {
    const p = choixMemorise()
    return p && emailDe(p) ? p : null
  })
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const email = personne ? emailDe(personne) : null

  const choisir = (p: Personne) => {
    setPersonne(p); setPassword(''); setError(null); setNotice(null)
    try { localStorage.setItem(CLE_CHOIX, p) } catch { /* sans mémoire, tant pis */ }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setBusy(true); setError(null); setNotice(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError('Mot de passe incorrect.')
  }

  const forgot = async () => {
    if (!email) return
    setBusy(true); setError(null); setNotice(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    setBusy(false)
    if (error) setError(error.message)
    else setNotice('Un e-mail vient de t’être envoyé pour définir un nouveau mot de passe.')
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      {/* fond : le paysage Horizon, repris en petit derrière la carte */}
      <img src={wallpaperOfDay()} alt="" aria-hidden
        className="absolute inset-0 h-full w-full scale-105 object-cover blur-[2px]" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/45 to-black/70" />

      <div className="card rise relative w-full max-w-sm border-white/10 bg-black/45 p-8 text-center backdrop-blur-xl">
        {/* logo Horizon */}
        <span className="mx-auto mb-5 block h-24 w-24 overflow-hidden rounded-full ring-1 ring-white/15">
          <img src="/logo.png" alt="Horizon" className="h-full w-full object-cover"
            style={{ transform: 'scale(2.1)', transformOrigin: '50% 41%' }} />
        </span>

        <h1 className="text-2xl font-bold tracking-[0.25em] text-white">HORIZON</h1>
        <p className="mb-6 mt-1 text-xs uppercase tracking-widest text-white/60">Tableau de bord personnel</p>

        {/* Qui se connecte ? Deux accès, l'adresse e-mail reste cachée. */}
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Qui se connecte ?">
          {PERSONNES.map((p) => {
            const actif = personne === p
            return (
              <button key={p} type="button" role="radio" aria-checked={actif} aria-label={p} onClick={() => choisir(p)}
                className={`flex items-baseline justify-center rounded-xl border px-3 pb-4 pt-2 transition-colors ${
                  actif ? 'border-sun-soft/70 bg-white/10 text-white' : 'border-white/15 text-white/75 hover:border-white/30 hover:text-white'}`}>
                {/* La majuscule manuscrite (police Champignon) enchaîne sur la suite du prénom
                    en écriture normale, sur la même ligne de base. */}
                <span aria-hidden className={`font-['Champignon',cursive] text-5xl leading-none ${actif ? 'text-sun-soft' : 'text-sun-soft/75'}`}>
                  {p[0]}
                </span>
                <span aria-hidden className="text-lg tracking-wide" style={{ marginLeft: ECART[p] }}>{p.slice(1)}</span>
              </button>
            )
          })}
        </div>

        {personne && !email && (
          <p className="mt-5 text-xs text-white/70">
            L’accès {de(personne)} n’est pas encore ouvert : il le sera bientôt.
          </p>
        )}

        {personne && email && (
          <form onSubmit={submit} className="mt-5 space-y-3 text-left">
            {/* Champ caché pour que le navigateur associe le mot de passe au bon compte. */}
            <input type="text" value={email} readOnly hidden autoComplete="username" />
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe" minLength={6} autoComplete="current-password" autoFocus
              className="field w-full" />
            <button type="submit" disabled={busy} className="btn-sun w-full py-2.5 disabled:opacity-60">
              {busy ? '…' : 'Se connecter'}
            </button>
            {error && <p className="text-xs text-[#ec7f97]">{error}</p>}
            {notice && <p className="text-xs text-sun-soft">{notice}</p>}
            <p className="pt-1 text-center text-xs text-white/60">
              <button type="button" onClick={forgot} disabled={busy} className="hover:text-white">Mot de passe oublié ?</button>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
