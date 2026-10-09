import { useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'
import { useHorizon } from '../../lib/store'

/** Bloc-notes libre en bas de chaque vue de Temps : 4 colonnes, un seul bouton
 *  « Effacer ». Mêmes notes d'une vue à l'autre. Mémorisé dans un layout (projection `temps-notes`), donc retrouvé
 *  sur le téléphone comme sur l'ordinateur. */
const PROJECTION = 'temps-notes'
const COLONNES = 4
const DELAI_MS = 700

const normaliser = (notes?: string[]): string[] =>
  Array.from({ length: COLONNES }, (_, i) => notes?.[i] ?? '')

export function NotesSemaine({ lignes = 4 }: { lignes?: number }) {
  const layout = useHorizon((s) => s.layouts.find((l) => l.projection === PROJECTION))
  const [cols, setCols] = useState<string[]>(() => normaliser(layout?.data.notes))
  const modifie = useRef(false) // l'utilisateur a tapé : ne plus écraser avec le serveur
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const enAttente = useRef<string[] | null>(null)
  const file = useRef<Promise<void>>(Promise.resolve())

  // Arrivée (ou changement) des données serveur : on ne touche pas à ce que
  // l'utilisateur est en train de saisir.
  useEffect(() => {
    if (!modifie.current) setCols(normaliser(layout?.data.notes))
  }, [layout])

  /** Écrit en base. Les écritures passent l'une après l'autre : sinon deux
   *  enregistrements rapprochés créeraient deux layouts. */
  const ecrire = (notes: string[]) => {
    file.current = file.current.then(async () => {
      const s = useHorizon.getState()
      const cur = s.layouts.find((l) => l.projection === PROJECTION)
      const data = { ...(cur?.data ?? {}), notes }
      if (cur) await s.update('layouts', cur.id, { data, updated_at: new Date().toISOString() })
      else await s.insert('layouts', { name: 'Notes de la semaine', projection: PROJECTION, is_default: false, data })
    })
  }
  const programmer = (notes: string[]) => {
    enAttente.current = notes
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (enAttente.current) ecrire(enAttente.current)
      enAttente.current = null
    }, DELAI_MS)
  }
  // Changement de vue pendant le délai : la dernière frappe est enregistrée quand même.
  useEffect(() => () => {
    clearTimeout(timer.current)
    if (enAttente.current) ecrire(enAttente.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const saisir = (i: number, v: string) => {
    modifie.current = true
    const next = cols.map((c, k) => (k === i ? v : c))
    setCols(next)
    programmer(next)
  }
  const effacer = () => {
    if (cols.some((c) => c.trim()) && !confirm('Effacer toutes les notes ?')) return
    modifie.current = true
    const vide = normaliser()
    setCols(vide)
    programmer(vide)
  }

  return (
    // À droite, une marge laisse la place au bouton flottant « + » (QuickCapture) :
    // il ne recouvre jamais les notes.
    // Pas de bandeau de titre : toute la hauteur sert aux notes. Le mot « Notes »
    // est écrit lettre par lettre, de haut en bas, sur le côté gauche, avec le
    // bouton d'effacement en dessous.
    <section className="card flex shrink-0 !bg-panel/55 !p-2 md:mr-[4.75rem]" aria-label="Notes">
      <div className="flex w-6 shrink-0 flex-col items-center justify-between gap-1 pr-1">
        <span className="text-[11px] uppercase text-ink-3 [text-orientation:upright] [writing-mode:vertical-rl]">Notes</span>
        <button type="button" onClick={effacer} disabled={!cols.some((c) => c.trim())}
          aria-label="Effacer toutes les notes" title="Effacer toutes les notes"
          className="btn-ghost p-1 text-ink-3 disabled:pointer-events-none disabled:opacity-30">
          <Eraser size={13} />
        </button>
      </div>
      {/* Colonnes séparées d'un filet à peine visible. */}
      <div className="grid min-w-0 flex-1 grid-cols-2 sm:grid-cols-4">
        {cols.map((c, i) => (
          <textarea key={i} value={c} rows={lignes} onChange={(e) => saisir(i, e.target.value)}
            aria-label={`Notes, colonne ${i + 1}`}
            className={`block w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 text-ink-2 outline-none
              placeholder:text-ink-3/50 focus:bg-white/[0.03] ${i > 0 ? 'sm:border-l sm:border-line-2/40' : ''} ${
              i === 2 ? 'border-t border-line-2/40 sm:border-t-0' : ''} ${i === 3 ? 'border-t border-line-2/40 sm:border-t-0' : ''}`} />
        ))}
      </div>
    </section>
  )
}
