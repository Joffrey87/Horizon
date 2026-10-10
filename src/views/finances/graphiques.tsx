// Graphiques SVG de l'onglet Finances — même esprit que components/charts.tsx :
// marques fines, grille discrète, survol outillé, texte à l'encre (jamais la
// couleur de la série).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { euros, libelleMois } from '../../lib/finances'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

/** Graduations « rondes » entre 0 et max. */
function graduations(max: number, n = 4): number[] {
  if (max <= 0) return [0]
  const brut = max / n
  const p = 10 ** Math.floor(Math.log10(brut))
  const pas = [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= brut) ?? brut
  return Array.from({ length: Math.ceil(max / pas) + 1 }, (_, i) => i * pas)
}

const kEuros = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10} k€`.replace('.', ',') : `${Math.round(v)} €`)

/** Dépensé par mois (barres) face au budget du mois (trait). Une série : pas de légende, le titre nomme. */
/** Dépensé par mois face au budget ; `epargne` (optionnel) : la part épargnée, en vert au bas de la barre. */
export function BarresMois({ donnees, onMois }: {
  donnees: { mois: string; reel: number; budget: number | null; epargne?: number }[]
  /** Clic sur un mois (barre ou étiquette). */
  onMois?: (mois: string) => void
}) {
  const [survol, setSurvol] = useState<number | null>(null)
  const W = 560, H = 200, G = 44, B = 24, Hh = 10
  const max = Math.max(1, ...donnees.map((d) => Math.max(d.reel, d.budget ?? 0)))
  const ticks = graduations(max)
  const haut = ticks.at(-1) ?? max
  const y = (v: number) => H - B - (v / haut) * (H - B - Hh)
  const pas = (W - G) / donnees.length
  const bw = Math.min(40, pas * 0.5)
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Dépensé par mois face au budget">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={G} x2={W} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth="1" />
            <text x={G - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="var(--color-ink-3)">{kEuros(t)}</text>
          </g>
        ))}
        {donnees.map((d, i) => {
          const cx = G + pas * i + pas / 2
          const depasse = d.budget !== null && d.reel > d.budget + 0.5
          const top = y(Math.max(0, d.reel))
          const r = Math.min(4, (H - B - top) / 2)
          return (
            <g key={d.mois} onMouseEnter={() => setSurvol(i)} onMouseLeave={() => setSurvol(null)}
              onClick={onMois ? () => onMois(d.mois) : undefined} style={onMois ? { cursor: 'pointer' } : undefined}>
              {/* zone de survol plus large que la marque */}
              <rect x={cx - pas / 2} y={Hh} width={pas} height={H - B - Hh} fill="transparent" />
              {d.reel > 0 && (
                <path d={`M${cx - bw / 2},${H - B} V${top + r} Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top} H${cx + bw / 2 - r} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r} V${H - B} Z`}
                  fill={depasse ? 'var(--color-warn)' : 'var(--color-teal)'} opacity={survol === null || survol === i ? 1 : 0.55} />
              )}
              {d.reel > 0 && (d.epargne ?? 0) > 0.5 && (
                <rect x={cx - bw / 2} y={y(Math.min(d.epargne!, d.reel))} width={bw} height={H - B - y(Math.min(d.epargne!, d.reel))}
                  fill="var(--color-good)" opacity={survol === null || survol === i ? 1 : 0.55} />
              )}
              {d.budget !== null && (
                <line x1={cx - bw / 2 - 6} x2={cx + bw / 2 + 6} y1={y(d.budget)} y2={y(d.budget)}
                  stroke="var(--color-ink-2)" strokeWidth="2" strokeDasharray="4 3" />
              )}
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--color-ink-3)">{libelleMois(d.mois, true)}</text>
            </g>
          )
        })}
      </svg>
      {survol !== null && donnees[survol] && (() => {
        const d = donnees[survol]
        return (
          <div className="pointer-events-none absolute top-0 rounded-lg border border-line-2 bg-panel-3 px-2.5 py-1.5 text-xs shadow-lg"
            style={{ left: `${((G + ((W - G) / donnees.length) * (survol + 0.5)) / W) * 100}%`, transform: 'translateX(-50%)' }}>
            <p className="font-medium capitalize">{libelleMois(d.mois)}</p>
            <p className="tabular-nums">Dépensé : {euros(d.reel)}</p>
            {(d.epargne ?? 0) > 0.5 && <p className="tabular-nums text-[#4cc79a]">dont épargné : {euros(d.epargne!)}</p>}
            {d.budget !== null && <p className="tabular-nums text-ink-2">Budget : {euros(d.budget)}</p>}
            {d.budget !== null && d.reel > d.budget + 0.5 && <p className="text-[#eda145]">{euros(d.reel - d.budget)} au-delà</p>}
          </div>
        )
      })()}
    </div>
  )
}

/** Patrimoine net dans le temps — ligne 2px, aire légère, réticule + infobulle. */
export function CourbePatrimoine({ points }: { points: { date: string; net: number }[] }) {
  const ref = useRef<SVGSVGElement>(null)
  const [survol, setSurvol] = useState<number | null>(null)
  const W = 640, H = 220, G = 52, B = 22, Hh = 10
  const geo = useMemo(() => {
    if (points.length < 2) return null
    const vals = points.map((p) => p.net)
    let min = Math.min(...vals), max = Math.max(...vals)
    const marge = (max - min) * 0.08 || Math.abs(max) * 0.05 || 1
    min -= marge; max += marge
    const x = (i: number) => G + (i / (points.length - 1)) * (W - G - 8)
    const y = (v: number) => H - B - ((v - min) / (max - min)) * (H - B - Hh)
    const ligne = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.net).toFixed(1)}`).join(' ')
    const aire = `${ligne} L${x(points.length - 1)},${H - B} L${x(0)},${H - B} Z`
    const pasT = (max - min) / 4
    const ticks = Array.from({ length: 5 }, (_, i) => min + i * pasT)
    // 4 repères de dates répartis
    const reperes = [0, 1, 2, 3].map((k) => Math.round((k / 3) * (points.length - 1)))
    return { x, y, ligne, aire, ticks, reperes }
  }, [points])

  if (!geo) return <p className="py-8 text-center text-xs text-ink-3">Pas encore assez de points pour tracer l’évolution.</p>

  const bouge = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const px = ((e.clientX - r.left) / r.width) * W
    const i = Math.round(((px - G) / (W - G - 8)) * (points.length - 1))
    setSurvol(Math.max(0, Math.min(points.length - 1, i)))
  }
  const p = survol !== null ? points[survol] : null

  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Évolution du patrimoine net"
        onMouseMove={bouge} onMouseLeave={() => setSurvol(null)}>
        {geo.ticks.map((t, i) => (
          <g key={i}>
            <line x1={G} x2={W - 8} y1={geo.y(t)} y2={geo.y(t)} stroke="var(--color-line)" strokeWidth="1" />
            <text x={G - 6} y={geo.y(t)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="var(--color-ink-3)">{kEuros(t)}</text>
          </g>
        ))}
        {geo.reperes.map((i) => (
          <text key={i} x={geo.x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
            fontSize="10" fill="var(--color-ink-3)">
            {format(parseISO(points[i]!.date), 'MMM yy', { locale: fr })}
          </text>
        ))}
        <path d={geo.aire} fill="var(--color-teal)" opacity="0.10" />
        <path d={geo.ligne} fill="none" stroke="var(--color-teal-soft)" strokeWidth="2" strokeLinejoin="round" />
        {p && survol !== null && (
          <g>
            <line x1={geo.x(survol)} x2={geo.x(survol)} y1={Hh} y2={H - B} stroke="var(--color-ink-3)" strokeWidth="1" />
            <circle cx={geo.x(survol)} cy={geo.y(p.net)} r="4.5" fill="var(--color-teal-soft)" stroke="var(--color-panel)" strokeWidth="2" />
          </g>
        )}
      </svg>
      {p && survol !== null && (
        <div className="pointer-events-none absolute top-0 rounded-lg border border-line-2 bg-panel-3 px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: `${(geo.x(survol) / W) * 100}%`, transform: `translateX(${survol > points.length / 2 ? '-105%' : '5%'})` }}>
          <p className="text-ink-2">{format(parseISO(p.date), 'd MMMM yyyy', { locale: fr })}</p>
          <p className="font-medium tabular-nums">{euros(p.net)}</p>
        </div>
      )}
    </div>
  )
}

/**
 * Patrimoine dans le temps, par composante : courbes cumulées. Chaque couche a
 * un fond léger de sa couleur et son bord supérieur tracé en trait plein ;
 * mois sur l'axe, légende à droite dans l'ordre des couches (la plus haute en
 * premier) avec la valeur du dernier jour. Réticule + infobulle détaillée.
 */
export function CourbeComposition({ points, series }: {
  points: { date: string; parts: Record<string, number> | null; total: number }[]
  series: { cle: string; label: string; couleur: string }[]
}) {
  const ref = useRef<SVGSVGElement>(null)
  const [survol, setSurvol] = useState<number | null>(null)
  // Un clic sur un actif de la légende n'affiche que sa courbe ; un nouveau clic dessus,
  // ou ailleurs sur la page, les remet toutes.
  const [seul, setSeul] = useState<string | null>(null)
  useEffect(() => {
    if (!seul) return
    const ailleurs = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-actif]')) setSeul(null) }
    document.addEventListener('click', ailleurs)
    return () => document.removeEventListener('click', ailleurs)
  }, [seul])
  const visibles = useMemo(() => (seul ? series.filter((s) => s.cle === seul) : series), [series, seul])
  const totalDe = useCallback((p: { parts: Record<string, number> | null; total: number }) =>
    (seul ? Math.max(0, p.parts?.[seul] ?? 0) : p.total), [seul])
  const W = 680, H = 280, G = 56, B = 26, Hh = 12, D = 10
  const geo = useMemo(() => {
    if (points.length < 2) return null
    const max = Math.max(1, ...points.map(totalDe)) * 1.05
    const ticks = graduations(max)
    const haut = ticks.at(-1) ?? max
    const x = (i: number) => G + (i / (points.length - 1)) * (W - G - D)
    const y = (v: number) => H - B - (Math.max(0, v) / haut) * (H - B - Hh)
    // Hauts cumulés de chaque couche (une couche négative compte pour 0).
    const cumuls = points.map((p) => {
      let c = 0
      return visibles.map((s) => (c += Math.max(0, p.parts?.[s.cle] ?? 0)))
    })
    const ligneDe = (k: number) => points.map((_, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(cumuls[i]![k]!).toFixed(1)}`).join(' ')
    const aires = visibles.map((_, k) => {
      const dessus = points.map((_, i) => `${x(i).toFixed(1)},${y(cumuls[i]![k]!).toFixed(1)}`)
      const dessous = points.map((_, i) => `${x(i).toFixed(1)},${y(k ? cumuls[i]![k - 1]! : 0).toFixed(1)}`).reverse()
      return { aire: `M${dessus.join(' L')} L${dessous.join(' L')} Z`, ligne: ligneDe(k) }
    })
    const sansParts = !seul && points.some((p) => !p.parts)
    const total = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ')
    // Un repère par début de mois (un sur deux au-delà d'un an), l'année sur janvier.
    const debuts: number[] = []
    points.forEach((p, i) => { if (i === 0 || p.date.slice(0, 7) !== points[i - 1]!.date.slice(0, 7)) debuts.push(i) })
    const pas = debuts.length > 14 ? Math.ceil(debuts.length / 12) : 1
    const mois = debuts.filter((_, k) => k % pas === 0)
    return { x, y, aires, total, sansParts, ticks, mois }
  }, [points, visibles, seul, totalDe])

  if (!geo) return <p className="py-8 text-center text-xs text-ink-3">Pas encore assez de points pour tracer l’évolution.</p>

  const bouge = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const px = ((e.clientX - r.left) / r.width) * W
    setSurvol(Math.max(0, Math.min(points.length - 1, Math.round(((px - G) / (W - G - D)) * (points.length - 1)))))
  }
  const dernier = points.at(-1)!
  const p = survol !== null ? points[survol]! : null
  const legende = [...series].reverse()

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      <div className="relative min-w-0 flex-1">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Évolution du patrimoine par composante"
          onMouseMove={bouge} onMouseLeave={() => setSurvol(null)}>
          {geo.ticks.map((t) => (
            <g key={t}>
              <line x1={G} x2={W - D} y1={geo.y(t)} y2={geo.y(t)} stroke="var(--color-line)" strokeWidth="1" />
              <text x={G - 8} y={geo.y(t)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="var(--color-ink-3)">{kEuros(t)}</text>
            </g>
          ))}
          <line x1={G} x2={G} y1={Hh} y2={H - B} stroke="var(--color-line-2)" strokeWidth="1" />
          {geo.mois.map((i) => {
            const d = parseISO(points[i]!.date)
            return (
              <g key={i}>
                <line x1={geo.x(i)} x2={geo.x(i)} y1={H - B} y2={H - B + 4} stroke="var(--color-line-2)" strokeWidth="1" />
                <text x={geo.x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--color-ink-3)">
                  {format(d, d.getMonth() === 0 ? 'MMM yy' : 'MMM', { locale: fr })}
                </text>
              </g>
            )
          })}
          {/* Fonds légers d'abord, traits ensuite : chaque bord reste net. */}
          {geo.aires.map((a, k) => <path key={`f${visibles[k]!.cle}`} d={a.aire} fill={visibles[k]!.couleur} fillOpacity="0.22" />)}
          {geo.aires.map((a, k) => (
            <path key={`l${visibles[k]!.cle}`} d={a.ligne} fill="none" stroke={visibles[k]!.couleur} strokeWidth="2" strokeLinejoin="round" />
          ))}
          {/* Le total en pointillés sur les anciens jours sans composition. */}
          {geo.sansParts && <path d={geo.total} fill="none" stroke="var(--color-ink-2)" strokeWidth="1.5" strokeDasharray="4 3" />}
          {p && survol !== null && (
            <g>
              <line x1={geo.x(survol)} x2={geo.x(survol)} y1={Hh} y2={H - B} stroke="var(--color-ink)" strokeWidth="1" strokeOpacity="0.5" />
              <circle cx={geo.x(survol)} cy={geo.y(totalDe(p))} r="4.5" fill="var(--color-ink)" stroke="var(--color-panel)" strokeWidth="2" />
            </g>
          )}
        </svg>
        {p && survol !== null && (
          <div className="pointer-events-none absolute top-0 min-w-[13rem] rounded-lg border border-line-2 bg-panel-3 px-2.5 py-1.5 text-xs shadow-lg"
            style={{ left: `${(geo.x(survol) / W) * 100}%`, transform: `translateX(${survol > points.length / 2 ? '-105%' : '5%'})` }}>
            <p className="text-ink-2">{format(parseISO(p.date), 'd MMMM yyyy', { locale: fr })}</p>
            <p className="mb-1 font-medium tabular-nums">{euros(totalDe(p))}</p>
            {p.parts && !seul && legende.map((s) => (
              <p key={s.cle} className="flex justify-between gap-3">
                <span className="flex items-center gap-1.5 text-ink-2">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.couleur }} />{s.label}
                </span>
                <span className="tabular-nums">{euros(p.parts?.[s.cle] ?? 0)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      {/* Légende à droite (dessous sur téléphone), dans l'ordre des couches. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs lg:w-52 lg:flex-col lg:pt-2">
        {legende.map((s) => (
          <li key={s.cle}>
            <button type="button" data-actif onClick={() => setSeul(seul === s.cle ? null : s.cle)} aria-pressed={seul === s.cle}
              title={seul === s.cle ? 'Afficher tous les actifs' : `N’afficher que : ${s.label}`}
              className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition-opacity hover:bg-panel-2 ${seul && seul !== s.cle ? 'opacity-40' : ''}`}>
              <span className="inline-block h-3 w-3 shrink-0 rounded-sm border-2" style={{ borderColor: s.couleur, background: `color-mix(in srgb, ${s.couleur} 30%, transparent)` }} />
              <span className="min-w-0 flex-1 text-ink-2">{s.label}</span>
              {dernier.parts && <span className="tabular-nums text-ink">{euros(dernier.parts[s.cle] ?? 0)}</span>}
            </button>
          </li>
        ))}
        {dernier.parts && (
          <li className="flex items-center gap-2 border-t border-line pt-1.5 font-medium lg:mt-1">
            <span className="flex-1">Total</span><span className="tabular-nums">{euros(dernier.total)}</span>
          </li>
        )}
      </ul>
    </div>
  )
}
