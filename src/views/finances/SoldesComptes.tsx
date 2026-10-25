import { euros } from '../../lib/finances'
import type { PartieEpargne, Soldes } from '../../lib/soldes'
import { createPortal } from 'react-dom'
import { useState } from 'react'
import { Eye, EyeOff, X } from 'lucide-react'
import { IconeDeCompte } from './IconeCompte'

/** Une ligne par compte (icône, nom, solde), total en bas. */
export function ListeSoldes({ soldes }: { soldes: Soldes }) {
  return (
    <div data-testid="liste-soldes" className="space-y-1 text-sm">
      <div className="flex items-baseline justify-between gap-3 font-semibold">
        <span>Total comptes courants</span><span data-testid="total-soldes" className="tabular-nums">{euros(soldes.total, true)}</span>
      </div>
      {soldes.comptes.map((a) => (
        <div key={a.id} data-testid="ligne-solde" className="flex items-center gap-2">
          <IconeDeCompte compte={a} taille={18} />
          <span className="min-w-0 flex-1 truncate">{a.name}</span>
          <span className={`shrink-0 tabular-nums ${Number(a.balance) < 0 ? 'text-[#ef5a36]' : ''}`}>{euros(Number(a.balance), true)}</span>
        </div>
      ))}
    </div>
  )
}

const titreSection = 'mb-0.5 text-[10px] font-semibold uppercase tracking-[.06em] text-ink-3'

/** Petite fenêtre « Comptes » posée par-dessus la page (pas en plein écran) : comptes courants (avec total), puis une ligne par épargne. */
export function FenetreSoldes({ soldes, epargnes = [], onClose }: { soldes: Soldes; epargnes?: PartieEpargne[]; onClose: () => void }) {
  // Épargne Sécurité : montant masqué tant qu'on ne touche pas l'œil.
  const [securiteVisible, setSecuriteVisible] = useState(false)
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose}>
      <div data-testid="fenetre-soldes" onClick={(e) => e.stopPropagation()}
        className="card rise absolute inset-x-3 top-24 mx-auto max-w-xs space-y-2 px-3 py-2.5 shadow-xl shadow-black/50">
        <button onClick={onClose} className="btn-ghost absolute right-1 top-1 p-1" aria-label="Fermer"><X size={14} /></button>
        <section>
          <p className={titreSection}>Comptes courants</p>
          <ListeSoldes soldes={soldes} />
        </section>
        {epargnes.length > 0 && (
          <section data-testid="comptes-epargne">
            <p className={titreSection}>Comptes Épargne</p>
            <div className="space-y-1 text-sm">
              {epargnes.map((p) => (
                <div key={p.cle} data-testid={`epargne-${p.cle}`} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">{p.titre}</span>
                  {p.cle === 'securite' && p.compte ? (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <button type="button" onClick={() => setSecuriteVisible((v) => !v)} className="btn-ghost p-1 text-ink-3"
                        aria-label={securiteVisible ? 'Masquer le montant' : 'Afficher le montant'} aria-pressed={securiteVisible}>
                        {securiteVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      {securiteVisible && <span data-testid="montant-securite" className="tabular-nums">{euros(Number(p.compte.balance), true)}</span>}
                    </span>
                  ) : (
                    <span className={`shrink-0 tabular-nums ${p.compte ? '' : 'text-ink-3'}`}>{p.compte ? euros(Number(p.compte.balance), true) : 'non suivi'}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>, document.body)
}
