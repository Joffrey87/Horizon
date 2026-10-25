import { useEffect, useRef, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { useHorizon } from '../lib/store'
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

  return (
    <div className="rise space-y-2">
      <div className="flex flex-col gap-2 md:flex-row md:gap-4">
        {/* Menu des prières : une rangée défilante compacte sur téléphone, une colonne à gauche sur ordinateur. */}
        <nav aria-label="Prières" className="flex flex-row items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:w-56 md:shrink-0 md:flex-col md:items-stretch md:overflow-visible">
          {liste.map((p) => (
            <button key={p.id} onClick={() => setChoix(p.id)} data-testid="priere-menu"
              className={`shrink-0 rounded-lg border px-2.5 py-1 text-left text-sm transition-colors max-md:whitespace-nowrap ${
                courante?.id === p.id ? 'border-sun/50 bg-sun/10 text-ink' : 'border-line text-ink-2 hover:bg-panel-2 hover:text-ink'}`}>
              {p.titre}
            </button>
          ))}
          <button onClick={() => setEdition('nouvelle')} title="Ajouter une prière" aria-label="Ajouter une prière"
            className="btn-ghost flex shrink-0 items-center gap-1 rounded-lg border border-dashed border-line px-2.5 py-1 text-sm">
            <Plus size={14} /> <span className="max-md:hidden">Ajouter</span>
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
