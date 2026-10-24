// Dernières opérations du Résumé : panneau (feuille du bas sur téléphone, centrée sur bureau),
// champ de recherche en haut, liste dense groupée par jour, les plus récentes d'abord.
// Données déjà chargées, affichées par paquets de 50 au défilement ; filtre de titulaire appliqué.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X } from 'lucide-react'
import { useHorizon } from '../../lib/store'
import { categorieEffective, euros, nomCategorie, operationsRecentes, segmentsSurlignes } from '../../lib/finances'
import type { FinTransaction } from '../../lib/types'
import { dateCourte, useFin, useIndex, useReconnaissance } from './contexte'
import { EditionOperation } from './DetailLigne'
import { IconeCompte } from './IconeCompte'

const PAQUET = 50
const VERT = '#4cc79a'
const AMBRE = '#eda145'

function Surligne({ texte, requete }: { texte: string; requete: string }) {
  return <>{segmentsSurlignes(texte, requete).map((s, i) => s.vu ? <span key={i} style={{ color: AMBRE }}>{s.t}</span> : s.t)}</>
}

export function DernieresOperations({ onClose, bureau }: { onClose: () => void; bureau: boolean }) {
  const { filtre } = useFin()
  const transactions = useHorizon((s) => s.finTransactions)
  const idx = useIndex()
  const reco = useReconnaissance()
  const [requete, setRequete] = useState('')
  const [limite, setLimite] = useState(PAQUET)
  const [sel, setSel] = useState<string | null>(null)
  const liste = useMemo(() => operationsRecentes({ transactions, requete, idx, filtre, libelle: reco.libelle }),
    [transactions, requete, idx, filtre, reco])
  useEffect(() => { setLimite(PAQUET) }, [requete, filtre])
  const parJour = useMemo(() => {
    const m = new Map<string, FinTransaction[]>()
    for (const tx of liste.slice(0, limite)) m.set(tx.date, [...(m.get(tx.date) ?? []), tx])
    return [...m.entries()]
  }, [liste, limite])
  // Défilement infini : la sentinelle en bas de liste ajoute le paquet suivant.
  const fin = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = fin.current
    if (!el || liste.length <= limite) return
    const obs = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) setLimite((l) => l + PAQUET) }, { rootMargin: '300px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [liste.length, limite])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[100] flex bg-black/55" onClick={onClose} data-testid="dernieres-operations">
      <div role="dialog" aria-label="Dernières opérations" onClick={(e) => e.stopPropagation()}
        className={`flex flex-col border border-line-2 bg-[#15110e] ${bureau
          ? 'm-auto h-[min(82vh,720px)] w-[min(92vw,560px)] rounded-2xl'
          : 'mt-auto h-[calc(100%-12px)] w-full rounded-t-2xl border-b-0'}`}>
        {!bureau && <button onClick={onClose} aria-label="Fermer" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/20" />}
        <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-2.5">
          <label className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input autoFocus={bureau} value={requete} onChange={(e) => setRequete(e.target.value)} aria-label="Rechercher"
              className="w-full rounded-lg border border-line-2 bg-panel py-1.5 pl-8 pr-7 text-[13px] text-ink outline-none focus:border-[#c9b48a]" />
            {requete && (
              <button onClick={() => setRequete('')} aria-label="Effacer" className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-ink-3 hover:text-ink">
                <X size={13} />
              </button>
            )}
          </label>
          {bureau && <button onClick={onClose} aria-label="Fermer" className="p-1 text-ink-3 hover:text-ink"><X size={16} /></button>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {parJour.map(([jour, ops]) => (
            <section key={jour}>
              <h3 className="pb-0.5 pt-2 text-[10.5px] font-medium text-ink-3">{dateCourte(jour)}</h3>
              <ul className="rounded-lg bg-[#c9b48a]/[0.07] px-2">
                {ops.map((tx) => {
                  const montant = Number(tx.amount)
                  const actif = sel === tx.id
                  const cat = nomCategorie(categorieEffective(tx.category_id, idx), idx)
                  return (
                    <li key={tx.id} className="border-t border-white/[.05] first:border-t-0">
                      <button data-testid="op-recente" onClick={() => setSel(actif ? null : tx.id)}
                        className={`flex w-full items-baseline gap-2 py-1.5 text-left text-[12.5px] ${actif ? 'text-[#eda145]' : 'text-ink-2'}`}>
                        <IconeCompte tx={tx} idx={idx} />
                        <span className="min-w-0 flex-1 truncate" title={tx.label}>
                          <Surligne texte={reco.libelle(tx) || '(sans libellé)'} requete={requete} />
                        </span>
                        <span className="max-w-[38%] shrink-0 truncate text-[10.5px] text-ink-3"><Surligne texte={cat} requete={requete} /></span>
                        <span className="w-[70px] shrink-0 text-right tabular-nums" style={montant > 0 ? { color: VERT } : undefined}>
                          {montant > 0 ? '+' : ''}{euros(Math.abs(montant), true)}
                        </span>
                      </button>
                      {actif && <EditionOperation key={tx.id} tx={tx} onClose={() => setSel(null)} />}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
          <div ref={fin} className="h-1" />
        </div>
      </div>
    </div>,
    document.body,
  )
}
