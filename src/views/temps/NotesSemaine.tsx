import { useEffect, useRef, useState } from 'react'
import { ChevronUp, Eraser } from 'lucide-react'
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

  // Volet replié par défaut : une barre fine « Notes de la semaine » (avec un
  // aperçu). Il s'ouvre au survol (ordinateur) ou d'un appui, reste ouvert tant
  // qu'on écrit dedans, et se replie quand on en sort sans y écrire.
  const racine = useRef<HTMLDivElement>(null)
  const [survole, setSurvole] = useState(false)
  const [focus, setFocus] = useState(false)
  const [epingle, setEpingle] = useState(false)
  const ouvert = survole || focus || epingle
  useEffect(() => {
    if (!epingle) return
    const dehors = (e: PointerEvent) => { if (!racine.current?.contains(e.target as Node)) setEpingle(false) }
    document.addEventListener('pointerdown', dehors)
    return () => document.removeEventListener('pointerdown', dehors)
  }, [epingle])
  const apercu = cols.map((c) => c.split('\n').find((l) => l.trim())?.trim()).filter(Boolean).join(' · ')

  return (
    <div ref={racine} className="relative h-7 shrink-0 md:mr-[4.75rem]"
      onMouseEnter={(e) => { if (e.nativeEvent instanceof MouseEvent && matchMedia('(hover: hover)').matches) setSurvole(true) }}
      onMouseLeave={() => { setSurvole(false); setEpingle(false) }}
      onFocus={() => setFocus(true)}
      onBlur={(e) => { if (!racine.current?.contains(e.relatedTarget as Node)) setFocus(false) }}>
      <button type="button" onClick={() => setEpingle((v) => !v)} aria-expanded={ouvert} aria-label="Notes de la semaine"
        className={`flex h-7 w-full items-center gap-2 rounded-xl border border-line-2/50 bg-panel/55 px-3 text-left text-xs text-ink-3 transition-opacity duration-200 ${ouvert ? 'opacity-0' : 'opacity-100'}`}>
        <ChevronUp size={13} className="shrink-0" />
        <span className="shrink-0 font-medium uppercase tracking-wide">Notes de la semaine</span>
        {apercu && <span className="min-w-0 truncate italic text-ink-3/80">— {apercu}</span>}
      </button>
      <div className={`absolute inset-x-0 bottom-0 z-30 origin-bottom transition-all duration-200 ease-out ${
        ouvert ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'}`}
        aria-hidden={!ouvert}>
        {/* Marge à droite pour le bouton « + » flottant ; « Notes » écrit verticalement, gomme dessous. */}
    <section className="card flex shrink-0 !bg-panel/95 !p-2 shadow-xl shadow-black/40 backdrop-blur" aria-label="Notes">
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
      </div>
    </div>
  )
}
