import { useEffect, useState } from 'react'
import { Lock, WifiOff } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { copieFinances } from '../../lib/horsLigne/copie'
import { MotDePasseIncorrect } from '../../lib/horsLigne/chiffrement'

const dateHeure = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

/** Hors ligne, Finances pas encore chargées : on propose la copie chiffrée de l'appareil.
 *  Le mot de passe ne sert qu'à la déchiffrer, ici, sans réseau ; il n'est gardé nulle part. */
export function CopieHorsLigne() {
  const uid = useHorizon((s) => s.session?.user.id)
  const ouvrir = useHorizon((s) => s.ouvrirFinancesHorsLigne)
  const [copie, setCopie] = useState<string | null | undefined>(undefined)
  const [mdp, setMdp] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if (!uid) return
    void copieFinances(uid).then((c) => setCopie(c?.at ?? null))
  }, [uid])

  const valider = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mdp || occupe) return
    setOccupe(true); setErreur(null)
    try {
      if (!(await ouvrir(mdp))) setErreur('La copie est introuvable sur cet appareil.')
    } catch (err) {
      setErreur(err instanceof MotDePasseIncorrect ? 'Mot de passe incorrect.' : `Copie illisible : ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setOccupe(false); setMdp('')
    }
  }

  if (copie === undefined) return <p className="pt-8 text-center text-sm text-ink-3">Recherche de la copie hors ligne…</p>

  return (
    <div className="mx-auto mt-8 max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm">
      <p className="flex items-center gap-2 font-medium text-ink"><WifiOff size={16} className="text-ink-3" /> Finances hors ligne</p>
      {copie === null ? (
        <p className="mt-2 text-ink-2">
          Pas de copie des Finances sur cet appareil. Pour en avoir une, active-la en ligne dans
          Paramètres → « Hors ligne ».
        </p>
      ) : (
        <form onSubmit={(e) => void valider(e)} className="mt-2 space-y-3">
          <p className="text-ink-2">
            Copie chiffrée du {dateHeure(copie)}. Ton mot de passe Horizon l'ouvre, en lecture seule.
          </p>
          <input type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} autoComplete="current-password"
            placeholder="Mot de passe Horizon" className="field w-full" autoFocus aria-label="Mot de passe Horizon" />
          {erreur && <p className="text-[#ff8a8a]">{erreur}</p>}
          <button type="submit" disabled={!mdp || occupe} className="btn-sun flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 disabled:opacity-50">
            <Lock size={14} /> {occupe ? 'Déchiffrement…' : 'Ouvrir la copie'}
          </button>
        </form>
      )}
    </div>
  )
}
