// Paramètres → partage d'onglets avec un autre compte (ex. Honorine).
// La base applique le partage (policies RLS) : ici on le règle, on le valide,
// et on le vérifie avec l'aperçu « Voir comme… ».
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, Trash2, Check, Pause } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useHorizon } from '../lib/store'
import { ONGLETS_PARTAGE, pageAccueil, type OngletPartage } from '../lib/partage'
import type { Partage } from '../lib/types'
import { Card } from './ui'

export function PartageCard() {
  const moi = useHorizon((s) => s.session?.user.id)
  const tous = useHorizon((s) => s.partages)
  const partages = useMemo(() => tous.filter((p) => p.owner_id === moi), [tous, moi])
  const loadAll = useHorizon((s) => s.loadAll)
  const [prenom, setPrenom] = useState('Honorine')
  const [email, setEmail] = useState('')

  const ecrire = async (fn: () => PromiseLike<{ error: { message: string } | null }>, quoi: string) => {
    const { error } = await fn()
    if (error) useHorizon.setState({ error: `${quoi} : ${error.message}` })
    await loadAll()
  }
  const creer = () => {
    const e = email.trim().toLowerCase()
    if (!moi || !e.includes('@')) return
    void ecrire(() => supabase.from('partages').insert({
      owner_id: moi, member_email: e, member_name: prenom.trim() || null, onglets: ['finances', 'temps'],
    }), 'Partage non créé')
    setEmail('')
  }

  return (
    <Card title="Partage avec un proche">
      <p className="mb-3 text-sm text-ink-2">
        Ouvre certains onglets à un autre compte. C’est la base de données qui applique le partage : rien d’autre ne lui est
        envoyé. Temps est en lecture seule ; dans Finances (budget, bilan, patrimoine), elle peut ranger les opérations si tu
        le permets.
      </p>
      {partages.map((p) => <LignePartage key={p.id} p={p} ecrire={ecrire} />)}
      {partages.length === 0 && (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Prénom" className="field !py-1.5 text-sm" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Son e-mail (celui de son inscription)"
              type="email" className="field !py-1.5 text-sm" onKeyDown={(e) => { if (e.key === 'Enter') creer() }} />
            <button onClick={creer} className="btn-sun px-4 py-1.5 text-sm">Préparer le partage</button>
          </div>
          <p className="text-xs text-ink-3">Elle crée ensuite son compte avec cet e-mail (« Créer un compte ») ; tu valides son accès ici.</p>
        </div>
      )}
    </Card>
  )
}

function LignePartage({ p, ecrire }: { p: Partage; ecrire: (fn: () => PromiseLike<{ error: { message: string } | null }>, quoi: string) => Promise<void> }) {
  const projects = useHorizon((s) => s.projects)
  const setApercu = useHorizon((s) => s.setApercu)
  const navigate = useNavigate()
  const nom = p.member_name || p.member_email
  const maj = (valeurs: Partial<Partage>) => ecrire(() => supabase.from('partages').update(valeurs).eq('id', p.id), 'Partage non enregistré')
  const basculerOnglet = (o: OngletPartage) =>
    void maj({ onglets: p.onglets.includes(o) ? p.onglets.filter((x) => x !== o) : [...p.onglets, o] })
  const basculerProjet = (id: string) => void maj({
    temps_projets_masques: p.temps_projets_masques.includes(id)
      ? p.temps_projets_masques.filter((x) => x !== id) : [...p.temps_projets_masques, id],
  })
  const statut = !p.member_id
    ? { texte: `En attente de son inscription avec ${p.member_email}`, ton: 'text-ink-3' }
    : p.actif ? { texte: 'Accès actif', ton: 'text-[#4cc79a]' } : { texte: 'Inscrite : accès à valider', ton: 'text-[#eda145]' }

  return (
    <div className="space-y-3 rounded-xl border border-line/70 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{nom}</span>
        <span className={`text-xs ${statut.ton}`}>{statut.texte}</span>
        <span className="ml-auto flex flex-wrap gap-1.5">
          {p.member_id && !p.actif && (
            <button onClick={() => void maj({ actif: true })} className="btn-sun flex items-center gap-1 px-3 py-1 text-xs">
              <Check size={13} /> Valider l’accès
            </button>
          )}
          {p.actif && (
            <button onClick={() => void maj({ actif: false })} className="btn-ghost flex items-center gap-1 px-2 py-1 text-xs">
              <Pause size={13} /> Suspendre
            </button>
          )}
          <button onClick={async () => { await setApercu(p.id); navigate(pageAccueil({ ...p, actif: true }) ?? '/') }}
            className="btn-ghost flex items-center gap-1 px-2 py-1 text-xs">
            <Eye size={13} /> Voir comme {p.member_name || 'elle'}
          </button>
          <button onClick={() => { if (confirm(`Supprimer le partage avec ${nom} ?`)) void ecrire(() => supabase.from('partages').delete().eq('id', p.id), 'Partage non supprimé') }}
            className="btn-ghost p-1.5" aria-label="Supprimer le partage"><Trash2 size={13} /></button>
        </span>
      </div>

      <div className="flex flex-wrap gap-4">
        <span className="text-xs text-ink-3">Onglets :</span>
        {ONGLETS_PARTAGE.map((o) => (
          <label key={o.cle} className="flex items-center gap-1.5">
            <input type="checkbox" checked={p.onglets.includes(o.cle)} onChange={() => basculerOnglet(o.cle)} /> {o.label}
          </label>
        ))}
      </div>

      {p.onglets.includes('finances') && (
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={p.finances_classer} onChange={() => void maj({ finances_classer: !p.finances_classer })} />
          Finances : peut ranger les opérations (catégorie, titulaire, intitulé)
        </label>
      )}

      {p.onglets.includes('temps') && (
        <div className="space-y-2">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={p.temps_taches_masquees} onChange={() => void maj({ temps_taches_masquees: !p.temps_taches_masquees })} />
            Temps : évènements seulement (mes tâches restent cachées)
          </label>
          <details className="rounded-lg border border-line/60 px-3 py-2">
            <summary className="cursor-pointer text-xs text-ink-2">
              Projets cachés dans Temps ({p.temps_projets_masques.length}) — ni le projet ni ses évènements ne lui sont envoyés
            </summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {[...projects].sort((a, b) => a.title.localeCompare(b.title, 'fr')).map((pr) => (
                <li key={pr.id}>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={p.temps_projets_masques.includes(pr.id)} onChange={() => basculerProjet(pr.id)} />
                    {pr.title}
                  </label>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  )
}
