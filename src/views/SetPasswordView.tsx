import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useHorizon } from '../lib/store'

export function SetPasswordView() {
  const clearRecovery = useHorizon((s) => s.clearRecovery)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(error.message)
    else clearRecovery()
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <img src="/horizon-bg.jpg" alt="" aria-hidden
        className="absolute inset-0 h-full w-full scale-105 object-cover blur-[2px]" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/45 to-black/70" />

      <div className="card rise relative w-full max-w-sm border-white/10 bg-black/45 p-8 text-center backdrop-blur-xl">
        <h1 className="text-2xl font-bold tracking-[0.25em] text-white">HORIZON</h1>
        <p className="mb-6 mt-1 text-xs uppercase tracking-widest text-white/60">Nouveau mot de passe</p>

        <form onSubmit={submit} className="space-y-3">
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Choisis un mot de passe" minLength={6} autoComplete="new-password" autoFocus
            className="field w-full" />
          <button type="submit" disabled={busy} className="btn-sun w-full py-2.5 disabled:opacity-60">
            {busy ? '…' : 'Enregistrer et entrer'}
          </button>
          {error && <p className="text-xs text-[#ec7f97]">{error}</p>}
        </form>
      </div>
    </div>
  )
}
