import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, Inbox, ListTodo } from 'lucide-react'
import { useHorizon } from '../lib/store'
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
  const champ = useRef<HTMLTextAreaElement>(null)

  // Partage Android : « titre », « texte » et « url » arrivent en paramètres.
  useEffect(() => {
    const partage = [params.get('title'), params.get('text'), params.get('url')]
      .filter((v): v is string => !!v?.trim())
      .join(' — ')
    if (partage) setTitle(partage)
  }, [params])

  const domaine = domainId || s.domains[0]?.id
  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault()
    const texte = title.trim()
    if (!texte || !domaine || busy) return
    setBusy(true)
    const cree = kind === 'idee'
      ? await s.insert('ideas', { title: texte, domain_id: domaine, status: 'active' })
      : await s.insert('tasks', { title: texte, domain_id: domaine, status: 'a_faire' })
    setBusy(false)
    // En cas d'échec, on NE VIDE PAS le champ : la pensée capturée ne doit pas
    // se perdre. L'erreur s'affiche déjà dans le bandeau du Shell.
    if (!cree) return
    setSaved(texte)
    setTitle('')
  }

  const encore = () => { setSaved(null); setTimeout(() => champ.current?.focus(), 0) }

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

      {saved ? (
        <Card className="space-y-3">
          <p className="flex items-start gap-2 text-sm text-[#4cc79a]">
            <Check size={16} className="mt-0.5 shrink-0" />
            <span className="min-w-0 text-ink">« {saved} » est dans « À trier ».</span>
          </p>
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
          </form>
        </Card>
      )}
    </div>
  )
}
