import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function AuthView() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div className="sunrise-veil flex min-h-screen items-center justify-center p-6">
      <div className="card rise w-full max-w-sm p-8 text-center">
        <div className="mx-auto mb-4 h-14 w-14">
          <img src="/favicon.svg" alt="" className="h-full w-full" />
        </div>
        <h1 className="text-2xl font-bold tracking-[0.25em]">HORIZON</h1>
        <p className="mb-6 mt-1 text-xs uppercase tracking-widest text-ink-3">Tableau de bord personnel</p>

        {sent ? (
          <p className="text-sm text-ink-2">
            Un lien de connexion vient d'être envoyé à <span className="text-sun-soft">{email}</span>.
            Ouvre-le pour entrer dans ton cockpit.
          </p>
        ) : (
          <form onSubmit={send} className="space-y-3">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="ton@email.fr" className="field text-center" autoFocus />
            <button type="submit" disabled={busy} className="btn-sun w-full py-2.5 disabled:opacity-60">
              {busy ? 'Envoi…' : 'Recevoir mon lien de connexion'}
            </button>
            {error && <p className="text-xs text-[#ec7f97]">{error}</p>}
            <p className="text-xs text-ink-3">Sans mot de passe : un lien magique par email.</p>
          </form>
        )}
      </div>
    </div>
  )
}
