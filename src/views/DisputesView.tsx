import { useEffect, useRef, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { todayIso } from '../lib/logic'
import { Card, Modal } from '../components/ui'

/** Page Dispute : la liste (titre + date, la plus récente d'abord) et le détail de celle choisie.
 *  Le contenu est personnel : il vit dans la base (un layout `discussions-disputes`), jamais dans le dépôt public. */
const PROJECTION = 'discussions-disputes'

interface Dispute { id: string; titre: string; date: string; contenu: string }

const lire = (data: unknown): Dispute[] => {
  const d = (data as { disputes?: Dispute[] } | undefined)?.disputes
  return Array.isArray(d) ? d : []
}

const trier = (l: Dispute[]) => [...l].sort((a, b) => b.date.localeCompare(a.date))

const dateLongue = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function DisputesView() {
  const layout = useHorizon((s) => s.layouts.find((l) => l.projection === PROJECTION))
  const [liste, setListe] = useState<Dispute[]>(() => lire(layout?.data))
  const [choix, setChoix] = useState<string | null>(null)
  const [edition, setEdition] = useState<Dispute | 'nouvelle' | null>(null)
  const modifie = useRef(false)
  const file = useRef<Promise<void>>(Promise.resolve())
  useEffect(() => { if (!modifie.current) setListe(lire(layout?.data)) }, [layout])

  const ecrire = (suivant: Dispute[]) => {
    modifie.current = true
    setListe(suivant)
    file.current = file.current.then(async () => {
      const s = useHorizon.getState()
      const cur = s.layouts.find((l) => l.projection === PROJECTION)
      const data = { ...(cur?.data ?? {}), disputes: suivant }
      if (cur) await s.update('layouts', cur.id, { data, updated_at: new Date().toISOString() })
      else await s.insert('layouts', { name: 'Disputes', projection: PROJECTION, is_default: false, data })
    })
  }

  const triees = trier(liste)
  const courante = triees.find((d) => d.id === choix) ?? triees[0]

  return (
    <div className="rise space-y-2">
      <div className="flex flex-col gap-2 md:flex-row md:gap-4">
        <nav aria-label="Disputes" className="flex flex-col gap-1.5 md:w-72 md:shrink-0">
          {triees.map((d) => (
            <button key={d.id} onClick={() => setChoix(d.id)} data-testid="dispute-menu"
              className={`rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors ${
                courante?.id === d.id ? 'border-sun/50 bg-sun/10 text-ink' : 'border-line text-ink-2 hover:bg-panel-2 hover:text-ink'}`}>
              <span className="block font-medium">{d.titre}</span>
              <span className="block text-xs text-ink-3">{dateLongue(d.date)}</span>
            </button>
          ))}
          <button onClick={() => setEdition('nouvelle')} title="Ajouter une dispute" aria-label="Ajouter une dispute"
            className="btn-ghost flex items-center justify-center gap-1 rounded-lg border border-dashed border-line px-2.5 py-1 text-sm">
            <Plus size={14} /> Ajouter
          </button>
        </nav>

        <div className="min-w-0 flex-1">
          {courante ? (
            <Card className="!p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">{courante.titre}</h2>
                  <p className="text-xs text-ink-3">{dateLongue(courante.date)}</p>
                </div>
                <button onClick={() => setEdition(courante)} className="btn-ghost shrink-0 p-1.5" aria-label="Modifier la dispute" title="Modifier">
                  <Pencil size={14} />
                </button>
              </div>
              <p data-testid="dispute-contenu" className="whitespace-pre-line text-[15px] leading-relaxed text-ink">{courante.contenu}</p>
            </Card>
          ) : (
            <Card><p className="py-4 text-center text-sm text-ink-3">Aucune dispute notée. Ajoute-en une avec « Ajouter ».</p></Card>
          )}
        </div>
      </div>

      {edition && (
        <FormulaireDispute dispute={edition === 'nouvelle' ? null : edition} onClose={() => setEdition(null)}
          onSave={(d) => {
            ecrire(liste.some((x) => x.id === d.id) ? liste.map((x) => (x.id === d.id ? d : x)) : [...liste, d])
            setChoix(d.id); setEdition(null)
          }}
          onDelete={edition !== 'nouvelle' ? () => {
            if (confirm(`Supprimer « ${edition.titre} » ?`)) { ecrire(liste.filter((x) => x.id !== edition.id)); setChoix(null); setEdition(null) }
          } : undefined} />
      )}
    </div>
  )
}

function FormulaireDispute({ dispute, onClose, onSave, onDelete }: {
  dispute: Dispute | null; onClose: () => void; onSave: (d: Dispute) => void; onDelete?: () => void
}) {
  const [titre, setTitre] = useState(dispute?.titre ?? '')
  const [date, setDate] = useState(dispute?.date ?? todayIso())
  const [contenu, setContenu] = useState(dispute?.contenu ?? '')
  const valider = (e: React.FormEvent) => {
    e.preventDefault()
    if (!titre.trim() || !date || !contenu.trim()) return
    onSave({ id: dispute?.id ?? crypto.randomUUID(), titre: titre.trim(), date, contenu: contenu.replace(/\s+$/, '') })
  }
  return (
    <Modal open onClose={onClose} title={dispute ? 'Modifier la dispute' : 'Nouvelle dispute'} compact>
      <form onSubmit={valider} className="space-y-3">
        <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Titre" className="field w-full" autoFocus required />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field w-full" required />
        <textarea value={contenu} onChange={(e) => setContenu(e.target.value)} placeholder="Contenu" rows={10} className="field w-full text-sm" required />
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
