import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, CloudOff, Inbox, ListTodo, RefreshCw } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { dernierDomaine, echecReseau, empiler, memoriserDomaine } from '../lib/capture'
import { Card, DomainDot, Seg } from '../components/ui'

/** Page de capture, pensée pour le téléphone : un champ, un geste, c'est parti.
 *
 *  Elle est la cible du raccourci « Capturer » et du partage Android (voir
 *  `public/manifest.webmanifest`) : un texte partagé depuis n'importe quelle
 *  app arrive ici pré-rempli.
 *
 *  Rien n'est priorisé à la capture : sans importance ni urgence, l'élément
 *  tombe dans la colonne « À trier » de Priorités. C'est tout l'intérêt —
 *  se vider la tête maintenant, décider plus tard. */
export function CaptureView() {
  const s = useHorizon()
  const [params] = useSearchParams()
  const [kind, setKind] = useState<'idee' | 'tache'>('idee')
  const [title, setTitle] = useState('')
  const [domainId, setDomainId] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [horsLigne, setHorsLigne] = useState(false)
  const champ = useRef<HTMLTextAreaElement>(null)

  // Partage Android : « titre », « texte » et « url » arrivent en paramètres.
  useEffect(() => {
    const partage = [params.get('title'), params.get('text'), params.get('url')]
      .filter((v): v is string => !!v?.trim())
      .join(' — ')
    if (partage) setTitle(partage)
  }, [params])

  // Hors ligne, l'app n'a pas pu charger ses domaines : on retombe sur le
  // dernier utilisé, mémorisé localement. Capturer ne doit jamais être bloqué.
  const domaine = domainId || s.domains[0]?.id || dernierDomaine() || ''
  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault()
    const texte = title.trim()
    if (!texte || !domaine || busy) return
    setBusy(true)
    const cree = kind === 'idee'
      ? await s.insert('ideas', { title: texte, domain_id: domaine, status: 'active' })
      : await s.insert('tasks', { title: texte, domain_id: domaine, status: 'a_faire' })
    setBusy(false)

    if (cree) {
      memoriserDomaine(domaine)
      setHorsLigne(false); setSaved(texte); setTitle('')
      return
    }
    // Réseau absent : on met de côté sur l'appareil, ce sera renvoyé tout seul.
    // `s.error` est l'instantané du rendu — encore vide ici, puisque l'échec
    // vient d'être enregistré. On relit donc l'état frais du store.
    const erreur = useHorizon.getState().error
    if (echecReseau(erreur) && empiler({ kind, title: texte, domain_id: domaine })) {
      memoriserDomaine(domaine)
      s.clearError() // ce n'est pas une perte : inutile d'alarmer
      s.refreshEnAttente()
      setHorsLigne(true); setSaved(texte); setTitle('')
      return
    }
    // Vrai refus (droits, validation) : on NE VIDE PAS le champ, la pensée
    // capturée ne doit pas se perdre. L'erreur s'affiche dans le bandeau.
  }

  const encore = () => { setSaved(null); setHorsLigne(false); setTimeout(() => champ.current?.focus(), 0) }

  return (
    <div className="rise mx-auto max-w-xl space-y-4 pt-4">
      <header className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sun/15 text-sun">
          <Inbox size={18} />
        </span>
        <div>
          <h1 className="text-xl font-semibold">Capturer</h1>
          <p className="text-xs text-ink-3">Vide-toi la tête. Le tri se fera dans Priorités.</p>
        </div>
      </header>

      {s.enAttente > 0 && (
        <Card className="flex items-center gap-2 !py-2.5">
          <CloudOff size={15} className="shrink-0 text-[#eda145]" />
          <p className="min-w-0 flex-1 text-xs text-ink-2">
            {s.enAttente} capture{s.enAttente > 1 ? 's' : ''} en attente sur l’appareil.
          </p>
          <button onClick={() => void s.flushCaptures()}
            className="btn-ghost flex shrink-0 items-center gap-1 px-2 py-1 text-xs">
            <RefreshCw size={12} /> Envoyer
          </button>
        </Card>
      )}

      {saved ? (
        <Card className="space-y-3">
          {horsLigne ? (
            <p className="flex items-start gap-2 text-sm text-[#eda145]">
              <CloudOff size={16} className="mt-0.5 shrink-0" />
              <span className="min-w-0 text-ink">
                « {saved} » est conservé sur l’appareil. Sans réseau pour l’instant :
                il partira dans Horizon tout seul à la reconnexion.
              </span>
            </p>
          ) : (
            <p className="flex items-start gap-2 text-sm text-[#4cc79a]">
              <Check size={16} className="mt-0.5 shrink-0" />
              <span className="min-w-0 text-ink">« {saved} » est dans « À trier ».</span>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button onClick={encore} className="btn-sun px-4 py-2 text-sm">Noter autre chose</button>
            <Link to="/priorites" className="btn-ghost flex items-center gap-1.5 px-4 py-2 text-sm">
              <ListTodo size={15} /> Aller trier
            </Link>
          </div>
        </Card>
      ) : (
        <Card>
          <form onSubmit={enregistrer} className="space-y-3">
            <textarea ref={champ} autoFocus value={title} rows={3}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void enregistrer(e) }}
              placeholder="Ce que tu as en tête…"
              className="field w-full resize-none text-base" />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Seg value={kind} onChange={setKind} options={[
                { value: 'idee', label: 'Idée' },
                { value: 'tache', label: 'Tâche' },
              ]} />
              <span className="text-[11px] text-ink-3">
                {kind === 'idee' ? 'À garder, sans engagement.' : 'Quelque chose à faire.'}
              </span>
            </div>

            {s.domains.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {s.domains.map((d) => (
                  <button type="button" key={d.id} onClick={() => setDomainId(d.id)}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      domaine === d.id ? 'border-sun/60 bg-sun/10 text-ink' : 'border-line-2 text-ink-3'
                    }`}>
                    <DomainDot color={d.color} size={7} />
                    {d.name}
                  </button>
                ))}
              </div>
            )}

            <button type="submit" disabled={!title.trim() || !domaine || busy}
              className="btn-sun w-full py-3 text-base disabled:opacity-50">
              {busy ? 'Enregistrement…' : 'Conserver'}
            </button>
            {!domaine && (
              <p className="text-xs text-ink-3">Crée d’abord un domaine dans « Domaines &amp; objectifs ».</p>
            )}
            {s.domains.length === 0 && domaine && (
              <p className="text-xs text-ink-3">Hors ligne : le dernier domaine utilisé sera appliqué.</p>
            )}
          </form>
        </Card>
      )}
    </div>
  )
}
