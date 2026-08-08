import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { wallpaperOfDay } from '../lib/logic'

type Mode = 'signin' | 'signup'

// Correspondance prénom -> email, fournie par VITE_LOGIN_MAP (hors dépôt public).
const LOGIN_MAP: Record<string, string> = (() => {
  try { return JSON.parse(import.meta.env.VITE_LOGIN_MAP ?? '{}') } catch { return {} }
})()

/** Résout un prénom en email. Accepte aussi un email tapé directement. */
function resolveEmail(input: string): string | null {
  const v = input.trim().toLowerCase()
  if (!v) return null
  if (LOGIN_MAP[v]) return LOGIN_MAP[v]
  if (v.includes('@')) return v
  return null
}

export function AuthView() {
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = resolveEmail(name)
    if (!email) { setError('Prénom inconnu.'); return }
    setBusy(true); setError(null); setNotice(null)
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setBusy(false)
      if (error) setError('Prénom ou mot de passe incorrect.')
    } else {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: window.location.origin },
      })
      setBusy(false)
      if (error) setError(error.message)
      else if (!data.session) setNotice('Compte créé. Vérifie ta boîte mail pour confirmer, puis connecte-toi.')
    }
  }

  const forgot = async () => {
    const email = resolveEmail(name)
    if (!email) { setError('Entre d\'abord ton prénom ci-dessus, puis reclique.'); return }
    setBusy(true); setError(null); setNotice(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    setBusy(false)
    if (error) setError(error.message)
    else setNotice('Un email vient de t\'être envoyé pour définir un nouveau mot de passe.')
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

        <form onSubmit={submit} className="space-y-3 text-left">
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Ton prénom" autoComplete="username" autoFocus
            className="field w-full" />
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe" minLength={6}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            className="field w-full" />

          <button type="submit" disabled={busy} className="btn-sun w-full py-2.5 disabled:opacity-60">
            {busy ? '…' : mode === 'signin' ? 'Se connecter' : 'Créer mon compte'}
          </button>

          {error && <p className="text-xs text-[#ec7f97]">{error}</p>}
          {notice && <p className="text-xs text-sun-soft">{notice}</p>}
        </form>

        <div className="mt-5 space-y-2 text-xs text-white/60">
          {mode === 'signin' ? (
            <>
              <button onClick={forgot} disabled={busy} className="hover:text-white">
                Mot de passe oublié ?
              </button>
              <p>
                Pas encore de compte ?{' '}
                <button onClick={() => { setMode('signup'); setError(null); setNotice(null) }}
                  className="text-sun-soft hover:underline">Créer un compte</button>
              </p>
            </>
          ) : (
            <p>
              Déjà un compte ?{' '}
              <button onClick={() => { setMode('signin'); setError(null); setNotice(null) }}
                className="text-sun-soft hover:underline">Se connecter</button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
