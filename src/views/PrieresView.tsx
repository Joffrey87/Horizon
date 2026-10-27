import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Pencil, Plus } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { useGlisserLateral } from '../lib/useGlisserLateral'
import { Card, Modal } from '../components/ui'

/** Page Prières : un petit menu des prières (en haut sur téléphone, à gauche sur ordinateur) et la prière choisie à droite.
 *  Les textes sont personnels : ils vivent dans la base (un layout `charite-prieres`), jamais dans le dépôt public. */
const PROJECTION = 'charite-prieres'

interface Priere { id: string; titre: string; texte: string }

const lire = (data: unknown): Priere[] => {
  const p = (data as { prieres?: Priere[] } | undefined)?.prieres
  return Array.isArray(p) ? p : []
}

export function PrieresView() {
  const layout = useHorizon((s) => s.layouts.find((l) => l.projection === PROJECTION))
  const [liste, setListe] = useState<Priere[]>(() => lire(layout?.data))
  const [choix, setChoix] = useState<string | null>(null)
  const [edition, setEdition] = useState<Priere | 'nouvelle' | null>(null)
  const modifie = useRef(false)
  const file = useRef<Promise<void>>(Promise.resolve())
  useEffect(() => { if (!modifie.current) setListe(lire(layout?.data)) }, [layout])

  const ecrire = (suivant: Priere[]) => {
    modifie.current = true
    setListe(suivant)
    file.current = file.current.then(async () => {
      const s = useHorizon.getState()
      const cur = s.layouts.find((l) => l.projection === PROJECTION)
      const data = { ...(cur?.data ?? {}), prieres: suivant }
      if (cur) await s.update('layouts', cur.id, { data, updated_at: new Date().toISOString() })
      else await s.insert('layouts', { name: 'Prières', projection: PROJECTION, is_default: false, data })
    })
  }

  const courante = liste.find((p) => p.id === choix) ?? liste[0]
  const [listeOuverte, setListeOuverte] = useState(false)
  // Téléphone : glisser de côté n'importe où sur la page = prière suivante / précédente.
  const rang = courante ? liste.indexOf(courante) : -1
  const voisine = (pas: number) => { const p = liste[rang + pas]; return p ? () => setChoix(p.id) : null }
  const glisser = useGlisserLateral(voisine(-1), voisine(1))

  return (
    <div className="rise min-h-[75vh] space-y-2" {...glisser}>
      <div className="flex flex-col gap-2 md:flex-row md:gap-4">
        {/* Menu des prières : un bouton-liste déroulant sur téléphone, une colonne à gauche sur ordinateur.
             */}
        <nav aria-label="Prières" className="relative flex flex-col gap-1.5 md:w-56 md:shrink-0">
          <div className="flex gap-1.5 md:hidden">
            <button onClick={() => setListeOuverte((o) => !o)} aria-expanded={listeOuverte} data-testid="priere-liste"
              className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-sun/50 bg-sun/10 px-2.5 py-1.5 text-left text-sm">
              <span className="min-w-0 truncate font-medium">{courante?.titre ?? 'Prières'}</span>
              <ChevronDown size={16} className={`shrink-0 transition-transform ${listeOuverte ? 'rotate-180' : ''}`} />
            </button>
            <button onClick={() => setEdition('nouvelle')} title="Ajouter une prière" aria-label="Ajouter une prière"
              className="btn-ghost flex shrink-0 items-center gap-1 rounded-lg border border-dashed border-line px-2.5 py-1 text-sm">
              <Plus size={14} /> Ajouter
            </button>
          </div>
          <div className={`${listeOuverte ? 'flex' : 'hidden'} flex-col gap-1 max-md:rounded-lg max-md:border max-md:border-line max-md:bg-panel max-md:p-1.5 md:flex`}>
            {liste.map((p) => (
              <button key={p.id} onClick={() => { setChoix(p.id); setListeOuverte(false) }} data-testid="priere-menu"
                className={`rounded-lg border px-2.5 py-1 text-left text-sm transition-colors ${
                  courante?.id === p.id ? 'border-sun/50 bg-sun/10 text-ink' : 'border-line text-ink-2 hover:bg-panel-2 hover:text-ink'}`}>
                {p.titre}
              </button>
            ))}
          </div>
          <button onClick={() => setEdition('nouvelle')} title="Ajouter une prière" aria-label="Ajouter une prière"
            className="btn-ghost flex items-center justify-center gap-1 rounded-lg border border-dashed border-line px-2.5 py-1 text-sm max-md:hidden">
            <Plus size={14} /> Ajouter
          </button>
        </nav>

        <div className="min-w-0 flex-1">
          {courante ? (
            <Card className="!border-[#5a4a36]/60 !bg-[#352d23] !p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <h2 className="text-base font-semibold">{courante.titre}</h2>
                <button onClick={() => setEdition(courante)} className="btn-ghost shrink-0 p-1.5" aria-label="Modifier la prière" title="Modifier">
                  <Pencil size={14} />
                </button>
              </div>
              <p data-testid="priere-texte" className="whitespace-pre-line text-[15px] leading-relaxed text-ink">{courante.texte}</p>
            </Card>
          ) : (
            <Card><p className="py-4 text-center text-sm text-ink-3">Aucune prière pour l’instant. Ajoute-en une avec « + ».</p></Card>
          )}
        </div>
      </div>

      {edition && (
        <FormulairePriere priere={edition === 'nouvelle' ? null : edition} onClose={() => setEdition(null)}
          onSave={(p) => {
            ecrire(liste.some((x) => x.id === p.id) ? liste.map((x) => (x.id === p.id ? p : x)) : [...liste, p])
            setChoix(p.id); setEdition(null)
          }}
          onDelete={edition !== 'nouvelle' ? () => {
            if (confirm(`Supprimer « ${edition.titre} » ?`)) { ecrire(liste.filter((x) => x.id !== edition.id)); setChoix(null); setEdition(null) }
          } : undefined} />
      )}
    </div>
  )
}

function FormulairePriere({ priere, onClose, onSave, onDelete }: {
  priere: Priere | null; onClose: () => void; onSave: (p: Priere) => void; onDelete?: () => void
}) {
  const [titre, setTitre] = useState(priere?.titre ?? '')
  const [texte, setTexte] = useState(priere?.texte ?? '')
  const valider = (e: React.FormEvent) => {
    e.preventDefault()
    if (!titre.trim() || !texte.trim()) return
    onSave({ id: priere?.id ?? crypto.randomUUID(), titre: titre.trim(), texte: texte.replace(/\s+$/, '') })
  }
  return (
    <Modal open onClose={onClose} title={priere ? 'Modifier la prière' : 'Nouvelle prière'} compact>
      <form onSubmit={valider} className="space-y-3">
        <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Titre" className="field w-full" autoFocus required />
        <textarea value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Texte de la prière" rows={12} className="field w-full text-sm" required />
        <div className="flex items-center justify-between gap-2">
          {onDelete ? <button type="button" onClick={onDelete} className="btn-ghost px-3 py-1.5 text-sm text-[#ff6b6b]">Supprimer</button> : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost px-3 py-1.5 text-sm">Annuler</button>
            <button type="submit" className="btn-sun px-4 py-1.5 text-sm">Enregistrer</button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
