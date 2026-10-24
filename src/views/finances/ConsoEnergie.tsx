import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { ENERGIES, NOM_SITE, resumeConso, type ResumeConso, type SiteEnergie } from '../../lib/energie'

/** Maquettes à valider : A dans le panneau d'édition, B feuille du bas, C panneau plein écran. */
export type VarianteEnergie = 'A' | 'B' | 'C'
export const VARIANTE_ENERGIE: VarianteEnergie = 'A'
// Démo : ?energie=A|B|C (à retirer une fois la variante choisie).
export const varianteEnergie = (): VarianteEnergie => {
  const v = new URLSearchParams(location.search).get('energie')
  return v === 'A' || v === 'B' || v === 'C' ? v : VARIANTE_ENERGIE
}

const COULEUR = { elec: '#eda145', gaz: '#c9b48a' } as const
const NOM = { elec: 'Électricité', gaz: 'Gaz' } as const
const MOIS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const kwh = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} kWh`

function Barres({ r, hauteur, valeurs }: { r: ResumeConso; hauteur: number; valeurs?: boolean }) {
  const max = Math.max(1, ...r.points.map((p) => Math.max(p.kwh, p.precedent ?? 0)))
  return (
    <div className="flex items-end gap-1" style={{ height: hauteur + (valeurs ? 28 : 14) }}>
      {r.points.map((p) => (
        <div key={p.mois} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
          {valeurs && <span className="text-[9px] tabular-nums text-ink-3">{Math.round(p.kwh)}</span>}
          <div className="relative w-full" style={{ height: hauteur }}>
            {/* Même mois un an plus tôt : silhouette pâle derrière (absente s'il n'y a pas d'historique). */}
            {p.precedent != null && <div className="absolute bottom-0 left-0 right-0 rounded-t-[3px] bg-white/[.06]" style={{ height: `${(p.precedent / max) * 100}%` }} />}
            <div className="absolute bottom-0 left-[22%] right-[22%] rounded-t-[3px]" style={{ height: `${(p.kwh / max) * 100}%`, background: COULEUR[r.energie] }} />
          </div>
          <span className="text-[9px] text-ink-3">{MOIS[Number(p.mois.slice(5)) - 1]}</span>
        </div>
      ))}
    </div>
  )
}

/** Contenu commun : un titre, le choix 6/12 mois, une rangée par énergie du contrat. */
export function ConsoEnergie({ site, onClose, grand = false }: { site: SiteEnergie; onClose?: () => void; grand?: boolean }) {
  const releves = useHorizon((s) => s.finEnergie)
  const [n, setN] = useState(6)
  const resumes = useMemo(() => ENERGIES[site].map((e) => resumeConso(releves, site, e, n)), [releves, site, n])
  return (
    <div data-testid="conso-energie">
      <div className="flex items-center gap-2">
        <h3 className={`flex-1 font-medium text-ink ${grand ? 'text-[17px]' : 'text-[13px]'}`}>Consommation {NOM_SITE[site]}</h3>
        <div className="flex rounded-full border border-line-2 p-0.5 text-[11px]">
          {[6, 12].map((m) => (
            <button key={m} onClick={() => setN(m)} aria-pressed={n === m}
              className={`rounded-full px-2 py-0.5 ${n === m ? 'bg-[#eda145]/15 text-[#eda145]' : 'text-ink-3'}`}>{m} mois</button>
          ))}
        </div>
        {onClose && <button onClick={onClose} aria-label="Fermer" className="text-ink-3"><X size={16} /></button>}
      </div>
      {resumes.map((r) => (
        <div key={r.energie} className={grand ? 'mt-5' : 'mt-2.5'}>
          <div className="mb-1 flex items-baseline gap-2 text-[12px]">
            <span className="flex-1 text-ink-2">{NOM[r.energie]}</span>
            <span className={`tabular-nums text-ink ${grand ? 'text-[15px]' : ''}`}>{kwh(r.total)}</span>
            {r.variation != null && (
              <span className="w-12 text-right text-[11px] tabular-nums" style={{ color: r.variation <= 0 ? '#4cc79a' : '#e8774a' }}
                title={`Mêmes mois un an plus tôt : ${kwh(r.totalPrecedent!)}`}>
                {r.variation > 0 ? '+' : '−'}{Math.abs(Math.round(r.variation * 100))} %
              </span>)}
          </div>
          <Barres r={r} hauteur={grand ? 110 : 44} valeurs={grand} />
        </div>
      ))}
    </div>
  )
}

/** Affichage selon la variante : A en ligne, B feuille du bas, C plein écran. */
export function FenetreConso({ site, variante, onClose }: { site: SiteEnergie; variante: VarianteEnergie; onClose: () => void }) {
  if (variante === 'A') return <div className="mt-2 border-t border-white/[.06] pt-2"><ConsoEnergie site={site} onClose={onClose} /></div>
  if (variante === 'B') return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end bg-black/50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-2xl border-t border-line-2 bg-panel px-4 pb-8 pt-2">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
        <ConsoEnergie site={site} onClose={onClose} />
      </div>
    </div>, document.body)
  return createPortal(
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-panel px-5 pb-10 pt-6">
      <ConsoEnergie site={site} onClose={onClose} grand />
    </div>, document.body)
}
