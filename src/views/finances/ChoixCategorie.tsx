import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { blocsChoixCategorie, categoriesParLigne, fondLigne, type IndexFinances } from '../../lib/finances'

/**
 * Fenêtre de choix de la catégorie d'une opération : toutes les lignes du budget d'un coup, en maçonnerie
 * (les blocs s'empilent sans trou), puces qui s'étirent pour remplir la largeur. Un clic applique le choix.
 */
export function ChoixCategorie({ idx, actuelle, titre, detail, occupe, onChoisir, onClose }: {
  idx: IndexFinances
  /** Catégorie en cours de l'opération (surlignée). */
  actuelle: string | undefined
  titre: string
  detail?: string
  occupe?: boolean
  onChoisir: (id: string) => void
  onClose: () => void
}) {
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
        <div className="gap-x-5 sm:columns-2 lg:columns-3">
          {categoriesParLigne(idx).map((g) => (
            <section key={g.ligne?.id ?? '-'} className="mb-3 break-inside-avoid">
              <h3 className="mb-1 rounded px-1.5 py-0.5 text-[12px] font-medium text-ink"
                style={{ background: fondLigne(g.ligne) ?? 'rgba(201,180,138,.10)' }}>{g.ligne?.name ?? 'Sans ligne'}</h3>
              {blocsChoixCategorie(g.ligne?.name ?? null, g.categories).map((b) => (
                <div key={b.titre ?? '-'} className="mb-1.5">
                  {b.titre && <p className="mb-0.5 px-1 text-[11px] text-ink-3">{b.titre}</p>}
                  <div className="flex flex-wrap gap-1">
                    {b.puces.map((p) => (
                      <button key={p.id} disabled={occupe} onClick={() => onChoisir(p.id)} aria-pressed={p.id === actuelle}
                        className={`grow rounded-md px-2 py-0.5 text-center text-[12.5px] ${p.id === actuelle
                          ? 'bg-[#eda145]/15 text-[#eda145] ring-1 ring-[#eda145]/70'
                          : `bg-[#c9b48a]/10 hover:text-ink hover:ring-1 hover:ring-[#c9b48a]/40 ${p.propre ? 'border border-dashed border-line-2 text-ink-3' : 'text-ink-2'}`}`}>
                        {p.libelle}
                      </button>
                    ))}
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
