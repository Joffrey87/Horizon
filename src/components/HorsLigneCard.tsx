import { useCallback, useEffect, useState } from 'react'
import { Lock, LockOpen } from 'lucide-react'
import { donneesFinances, useHorizon } from '../lib/store'
import { supabase } from '../lib/supabase'
import { activerCopieFinances, clesFinances, copieFinances, desactiverCopieFinances, enregistrerCopieFinances, lireCopie } from '../lib/horsLigne/copie'
import { Card } from './ui'

const quand = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '—'

/** Paramètres → « Hors ligne » : ce que l'appareil garde, et la copie chiffrée des Finances (par appareil). */
export function HorsLigneCard() {
  const uid = useHorizon((s) => s.session?.user.id)
  const email = useHorizon((s) => s.session?.user.email)
  const enAttente = useHorizon((s) => s.actionsEnAttente)
  const horsLigne = useHorizon((s) => s.horsLigne)
  const [copie, setCopie] = useState<string | null>(null)
  const [fin, setFin] = useState<{ active: boolean; at: string | null }>({ active: false, at: null })
  const [mdp, setMdp] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const relire = useCallback(async () => {
    if (!uid) return
    const [c, cles, cf] = await Promise.all([lireCopie(uid), clesFinances(uid), copieFinances(uid)])
    setCopie(c?.at ?? null)
    setFin({ active: !!cles, at: cf?.at ?? null })
  }, [uid])
  useEffect(() => { void relire() }, [relire])

  const activer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uid || !email || !mdp || occupe) return
    setOccupe(true); setMsg(null)
    try {
      // On vérifie le mot de passe : une faute de frappe rendrait la copie impossible à ouvrir.
      const { error } = await supabase.auth.signInWithPassword({ email, password: mdp })
      if (error) { setMsg(/invalid/i.test(error.message) ? 'Mot de passe incorrect.' : `Vérification impossible : ${error.message}`); return }
      if (!(await activerCopieFinances(uid, mdp))) { setMsg("Cet appareil n'a pas pu garder la copie (stockage indisponible)."); return }
      const s = useHorizon.getState()
      if (s.finLoaded && !s.finCopieDu) {
        await enregistrerCopieFinances(uid, donneesFinances(s))
      } else {
        await s.loadFinances(true)
      }
      setMsg('Copie activée sur cet appareil.')
    } finally {
      setMdp(''); setOccupe(false); void relire()
    }
  }

  const desactiver = async () => {
    if (!uid) return
    await desactiverCopieFinances(uid)
    setMsg('Copie des Finances effacée de cet appareil.')
    void relire()
  }

  return (
    <Card title="Hors ligne">
      <p className="text-sm text-ink-2">
        Installé sur le téléphone, Horizon s'ouvre sans réseau avec la dernière copie de tes données
        (copie du {quand(copie)}). Cocher une course, une tâche, une habitude ou noter une séance
        attend le retour du réseau ; le reste demande le réseau.
      </p>
      {enAttente > 0 && (
        <p className="mt-2 text-xs text-sun-soft">
          {enAttente} action{enAttente > 1 ? 's' : ''} faite{enAttente > 1 ? 's' : ''} hors ligne en attente d'envoi.
        </p>
      )}

      <div className="mt-4 border-t border-white/10 pt-3">
        <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
          {fin.active ? <Lock size={14} className="text-sun-soft" /> : <LockOpen size={14} className="text-ink-3" />}
          Finances sur cet appareil
        </p>
        {fin.active ? (
          <>
            <p className="mt-1 text-xs text-ink-3">
              Copie chiffrée, rafraîchie à chaque ouverture des Finances (dernière : {quand(fin.at)}).
              Hors ligne, elle s'ouvre avec le mot de passe Horizon donné à l'activation. Si tu changes de
              mot de passe, réactive-la.
            </p>
            <button onClick={() => void desactiver()} className="btn-ghost mt-2 px-2 py-1 text-xs text-ink-3 hover:text-[#ec7f97]">
              Effacer la copie de cet appareil
            </button>
          </>
        ) : (
          <form onSubmit={(e) => void activer(e)} className="mt-1 space-y-2">
            <p className="text-xs text-ink-3">
              Pas de copie pour l'instant. Activée, elle est chiffrée sur l'appareil et ne se lit qu'avec
              ton mot de passe Horizon, qui n'est enregistré nulle part.
            </p>
            <div className="flex gap-2">
              <input type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} autoComplete="current-password"
                placeholder="Mot de passe Horizon" aria-label="Mot de passe Horizon" className="field min-w-0 flex-1" disabled={horsLigne} />
              <button type="submit" disabled={!mdp || occupe || horsLigne} className="btn-sun shrink-0 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50">
                {occupe ? 'Chiffrement…' : 'Activer'}
              </button>
            </div>
            {horsLigne && <p className="text-xs text-ink-3">L'activation demande le réseau (vérification du mot de passe).</p>}
          </form>
        )}
        {msg && <p className="mt-2 text-xs text-ink-2">{msg}</p>}
      </div>
    </Card>
  )
}
