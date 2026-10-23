// Changer le budget d'une ligne POUR LE MOIS AFFICHÉ SEULEMENT : une seule mécanique, partagée par le
// Budget et le Résumé (tuiles). Le montant s'affiche en ambre souligné quand il a été ajusté pour ce mois.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, X } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { budgetAjuste, euros, libelleMois } from '../../lib/finances'
import { useFin, useVue } from './contexte'

/** Style d'un budget ajusté pour ce mois : ambre, souligné (plein, pour le distinguer du pointillé « cliquable »). */
const CLASSE_AJUSTE = 'font-semibold text-sun underline decoration-sun decoration-solid underline-offset-4'

type Ajustement = { ajuste: boolean; base: number | null }
interface Cible { id: string; nom: string; budget: number | null; ajustement: Ajustement }

/**
 * À appeler une fois par écran : `ajustement(ligneId)` dit si le budget du mois affiché est ajusté,
 * `ouvrir(...)` ouvre la fenêtre de saisie, `dialogue` est à rendre dans l'écran.
 * `peutModifier` : vue Foyer, hors vue partagée (comme les autres budgets).
 */
export function useBudgetMois() {
  const { mois, filtre } = useFin()
  const vue = useVue()
  const budgets = useHorizon((s) => s.finBudgets)
  const [cible, setCible] = useState<Cible | null>(null)
  const peutModifier = filtre === 'foyer' && !vue
  const ajustement = (ligneId: string | null | undefined): Ajustement =>
    ligneId ? budgetAjuste(ligneId, mois, budgets) : { ajuste: false, base: null }
  const ouvrir = (ligne: { id: string; name: string }, budget: number | null) => {
    if (peutModifier) setCible({ id: ligne.id, nom: ligne.name, budget, ajustement: ajustement(ligne.id) })
  }
  const dialogue: ReactNode = cible && (
    <DialogueBudgetMois key={cible.id + mois} cible={cible} mois={mois} onFermer={() => setCible(null)} />
  )
  return { peutModifier, ajustement, ouvrir, dialogue }
}

/**
 * Le montant du budget : un bouton (si `onOuvrir`) qui ouvre la saisie ; ambre et souligné quand le budget
 * est ajusté pour ce mois. Sans budget : `vide`. `discret` : pas de pointillé quand il n'est pas ajusté.
 */
export function MontantBudget({ montant, ajustement, onOuvrir, vide = '—', className = '', discret = false }: {
  montant: number | null; ajustement?: Ajustement; onOuvrir?: () => void; vide?: string; className?: string; discret?: boolean
}) {
  const ajuste = ajustement?.ajuste ?? false
  const texte = montant !== null && montant > 0 ? euros(montant) : vide
  const classe = `tabular-nums ${ajuste ? CLASSE_AJUSTE : onOuvrir && !discret ? 'decoration-dotted underline-offset-4 underline' : ''} ${className}`
  const titre = ajuste ? `Ajusté pour ce mois${ajustement?.base ? ` (habituel : ${euros(ajustement.base)})` : ''}` : 'Changer le budget de ce mois'
  return onOuvrir
    ? <button type="button" onClick={onOuvrir} title={titre} data-testid="budget-montant" data-ajuste={ajuste || undefined}
        className={`-m-1 rounded p-1 ${classe}`}>{texte}</button>
    : <span data-testid="budget-montant" data-ajuste={ajuste || undefined} title={ajuste ? titre : undefined} className={classe}>{texte}</span>
}

/**
 * Fenêtre de saisie : posée en haut de l'écran (le clavier du téléphone ne la recouvre pas), champ qui garde le focus,
 * ✓ (ou Entrée) enregistre, ✕ (Échap, toucher à côté) annule, champ vide ou « Rétablir » = retour au budget habituel.
 * Rien ne se ferme au défilement.
 */
function DialogueBudgetMois({ cible, mois, onFermer }: { cible: Cible; mois: string; onFermer: () => void }) {
  const setFinBudgetMois = useHorizon((s) => s.setFinBudgetMois)
  const [texte, setTexte] = useState(cible.budget === null ? '' : String(cible.budget))
  const [envoi, setEnvoi] = useState(false)
  const [invalide, setInvalide] = useState(false)
  const champ = useRef<HTMLInputElement>(null)
  useEffect(() => { champ.current?.focus(); champ.current?.select() }, [])
  useEffect(() => {
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer() }
    document.addEventListener('keydown', touche)
    return () => document.removeEventListener('keydown', touche)
  }, [onFermer])

  const enregistrer = async (valeur: number | null | 'saisie') => {
    if (envoi) return
    let v: number | null
    if (valeur === 'saisie') {
      const t = texte.replace(/\s/g, '').replace(',', '.')
      v = t === '' ? null : Number(t)
      if (v !== null && (!Number.isFinite(v) || v < 0)) { setInvalide(true); return }
    } else v = valeur
    setEnvoi(true)
    // Pas d'écriture inutile si rien ne change (même montant, ou déjà au budget habituel).
    try {
      if (v !== cible.budget && !(v === null && !cible.ajustement.ajuste)) await setFinBudgetMois(cible.id, mois, v)
    } finally { onFermer() }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/55 px-4 pt-[12vh]" data-testid="dialogue-budget"
      onClick={(e) => { if (e.target === e.currentTarget) onFermer() }}>
      <form role="dialog" aria-modal="true" aria-label={`Budget de ${cible.nom}`}
        onSubmit={(e) => { e.preventDefault(); void enregistrer('saisie') }}
        className="w-full max-w-sm rounded-2xl border border-line-2 bg-panel p-4 shadow-2xl">
        <p className="text-[10px] uppercase tracking-wider text-ink-3">Budget · {cible.nom}</p>
        <p className="mt-0.5 text-sm font-semibold text-sun">Pour {libelleMois(mois)} seulement</p>
        <div className="mt-3 flex items-center gap-2">
          <input ref={champ} value={texte} onChange={(e) => { setTexte(e.target.value); setInvalide(false) }}
            inputMode="decimal" enterKeyHint="done" autoComplete="off" aria-label="Budget" aria-invalid={invalide}
            className="field !px-3 !py-2 text-right text-lg tabular-nums" />
          <span className="text-ink-2">€</span>
          <button type="button" onClick={onFermer} aria-label="Annuler" title="Annuler"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line-2 text-ink-2 hover:text-ink"><X size={20} /></button>
          <button type="submit" disabled={envoi} aria-label="Enregistrer" title="Enregistrer"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sun text-bg hover:opacity-90 disabled:opacity-50"><Check size={22} strokeWidth={3} /></button>
        </div>
        {invalide && <p className="mt-2 text-xs text-bad">Montant invalide.</p>}
        <p className="mt-3 text-[11px] leading-snug text-ink-3">
          Les autres mois ne changent pas.
          {cible.ajustement.base !== null && <> Budget habituel : <span className="tabular-nums text-ink-2">{euros(cible.ajustement.base)}</span>.</>}
          {' '}Champ vide = budget habituel.
        </p>
        {cible.ajustement.ajuste && (
          <button type="button" onClick={() => void enregistrer(null)} disabled={envoi}
            className="mt-2 text-xs text-sun underline underline-offset-4">Rétablir le budget habituel</button>
        )}
      </form>
    </div>,
    document.body,
  )
}
