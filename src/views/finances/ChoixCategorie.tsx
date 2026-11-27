import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { EyeOff, X } from 'lucide-react'
import { blocsChoixCategorie, categoriesParLigne, estCadeaux, fondLigne, type IndexFinances } from '../../lib/finances'
import { todayIso } from '../../lib/logic'

/** Option « Surprise » de la catégorie Cadeaux : cacher l'opération à l'autre jusqu'à une date. */
export interface OptionSurprise {
  /** À qui elle sera cachée (« Honorine », « Joffrey »). */
  autre: string
  /** Date de révélation en cours si l'opération est déjà une surprise. */
  jusqu: string | null
  onCacher: (categorie: string, jusqu: string) => void
}

/** Date par défaut proposée : dans un mois. */
function dansUnMois(): string {
  const d = new Date(); d.setMonth(d.getMonth() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Fenêtre de choix de la catégorie d'une opération : toutes les lignes du budget d'un coup, en maçonnerie
 * (les blocs s'empilent sans trou), puces qui s'étirent pour remplir la largeur. Un clic applique le choix.
 */
export function ChoixCategorie({ idx, actuelle, titre, detail, occupe, onChoisir, onClose, surprise }: {
  idx: IndexFinances
  /** Catégorie en cours de l'opération (surlignée). */
  actuelle: string | undefined
  titre: string
  detail?: string
  occupe?: boolean
  onChoisir: (id: string) => void
  onClose: () => void
  /** Œil barré à côté de « Cadeaux » (opération seule). */
  surprise?: OptionSurprise
}) {
  // Catégorie Cadeaux pour laquelle on règle la surprise (date de révélation à choisir).
  const [cacher, setCacher] = useState<string | null>(null)
  const [jusqu, setJusqu] = useState(surprise?.jusqu ?? dansUnMois())
  useEffect(() => {
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-6" onClick={onClose} role="presentation">
      <div data-testid="choix-categorie" role="dialog" aria-label="Choisir la catégorie"
        className="card rise mx-auto my-2 w-full max-w-[920px] p-4 sm:my-6 sm:p-5" onClick={(e) => e.stopPropagation()}>
        <header className="mb-3 flex items-center gap-2 text-[12px] text-ink-3">
          <span className="text-[14px] font-medium text-ink">{titre}</span>
          {detail && <span className="truncate">{detail}</span>}
          <button onClick={onClose} className="btn-ghost ml-auto p-1.5" aria-label="Fermer"><X size={16} /></button>
        </header>
        {cacher && surprise && (
          <div data-testid="panneau-surprise" className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#eda145]/50 bg-[#eda145]/[0.07] px-3 py-2 text-[12.5px] text-ink-2">
            <EyeOff size={14} className="shrink-0 text-[#eda145]" />
            <span>Surprise : intitulé et montant cachés à {surprise.autre} jusqu'au</span>
            <input type="date" aria-label="Date de révélation" value={jusqu} min={todayIso()} onChange={(e) => setJusqu(e.target.value)}
              className="rounded-md border border-line-2 bg-panel px-2 py-0.5 text-[12.5px] text-ink outline-none focus:border-[#c9b48a]" />
            <span className="ml-auto flex gap-1.5">
              <button type="button" data-testid="valider-surprise" disabled={occupe || !jusqu} onClick={() => surprise.onCacher(cacher, jusqu)}
                className="rounded-full border border-[#4cc79a]/70 px-2.5 py-0.5 text-[12px] text-[#4cc79a]">Cacher</button>
              <button type="button" onClick={() => setCacher(null)} className="rounded-full border border-line-2 px-2.5 py-0.5 text-[12px] text-ink-2">Annuler</button>
            </span>
          </div>
        )}
        <div className="gap-x-5 sm:columns-2 lg:columns-3">
          {categoriesParLigne(idx).map((g) => (
            <section key={g.ligne?.id ?? '-'} className="mb-3 break-inside-avoid">
              <h3 className="mb-1 rounded px-1.5 py-0.5 text-[12px] font-medium text-ink"
                style={{ background: fondLigne(g.ligne) ?? 'rgba(201,180,138,.10)' }}>{g.ligne?.name ?? 'Sans ligne'}</h3>
              {blocsChoixCategorie(g.ligne?.name ?? null, g.categories).map((b) => (
                <div key={b.titre ?? '-'} className="mb-1.5">
                  {b.titre && <p className="mb-0.5 px-1 text-[11px] text-ink-3">{b.titre}</p>}
                  <div className="flex flex-wrap gap-1">
                    {b.puces.map((p) => {
                      const cadeaux = !!surprise && estCadeaux(idx.categories.get(p.id)?.name)
                      const bouton = (
                      <button key={p.id} disabled={occupe} onClick={() => onChoisir(p.id)} aria-pressed={p.id === actuelle}
                        className={`grow rounded-md px-2 py-0.5 text-center text-[12.5px] ${p.id === actuelle
                          ? 'bg-[#eda145]/15 text-[#eda145] ring-1 ring-[#eda145]/70'
                          : `bg-[#c9b48a]/10 hover:text-ink hover:ring-1 hover:ring-[#c9b48a]/40 ${p.propre ? 'border border-dashed border-line-2 text-ink-3' : 'text-ink-2'}`}`}>
                        {p.libelle}
                      </button>
                      )
                      if (!cadeaux) return bouton
                      const cachee = cacher === p.id || (p.id === actuelle && !!surprise?.jusqu)
                      return (
                        <span key={p.id} className="flex grow gap-1">
                          {bouton}
                          <button type="button" data-testid="btn-surprise" disabled={occupe} onClick={() => setCacher(cacher === p.id ? null : p.id)}
                            aria-pressed={cachee} aria-label="Surprise : cacher" title={`Surprise : cacher l'intitulé et le montant à ${surprise.autre}`}
                            className={`rounded-md px-1.5 ${cachee ? 'bg-[#eda145]/15 text-[#eda145] ring-1 ring-[#eda145]/70' : 'bg-[#c9b48a]/10 text-ink-3 hover:text-ink'}`}>
                            <EyeOff size={13} />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
