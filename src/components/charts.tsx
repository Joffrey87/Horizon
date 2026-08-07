// Graphiques SVG maison — marques fines, grille discrète, survol outillé.
import { useState } from 'react'

/** Radar d'équilibre des domaines (une série → pas de légende, le titre nomme). */
export function DomainRadar({ data, size = 220 }: {
  data: { label: string; color: string; value: number }[] // value 0..1
  size?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const n = data.length
  if (n < 3) return <p className="py-6 text-center text-xs text-ink-3">Au moins 3 domaines pour afficher le radar.</p>
  const cx = size / 2, cy = size / 2, r = size / 2 - 34
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2
  const pt = (i: number, k: number) => [cx + Math.cos(angle(i)) * r * k, cy + Math.sin(angle(i)) * r * k] as const
  const poly = data.map((d, i) => pt(i, 0.15 + 0.85 * Math.max(0, Math.min(1, d.value)))).map(([x, y]) => `${x},${y}`).join(' ')

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-[280px]" role="img"
      aria-label="Équilibre des domaines sur 14 jours">
      {[0.33, 0.66, 1].map((k) => (
        <polygon key={k} points={data.map((_, i) => pt(i, k).join(',')).join(' ')}
          fill="none" stroke="var(--color-line)" strokeWidth="1" />
      ))}
      {data.map((_, i) => {
        const [x, y] = pt(i, 1)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--color-line)" strokeWidth="1" />
      })}
      <polygon points={poly} fill="rgba(245,158,11,0.16)" stroke="var(--color-sun)" strokeWidth="2"
        strokeLinejoin="round" />
      {data.map((d, i) => {
        const [x, y] = pt(i, 0.15 + 0.85 * Math.max(0, Math.min(1, d.value)))
        return (
          <g key={d.label}>
            <circle cx={x} cy={y} r={hover === i ? 6 : 4} fill={d.color} stroke="var(--color-panel)" strokeWidth="2"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            {hover === i && (
              <text x={x} y={y - 10} textAnchor="middle" fontSize="11" fill="var(--color-ink)">
                {Math.round(d.value * 100)}%
              </text>
            )}
          </g>
        )
      })}
      {data.map((d, i) => {
        const [x, y] = pt(i, 1.24)
        return (
          <text key={d.label} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            fontSize="10" fill="var(--color-ink-2)">
            {d.label.length > 12 ? d.label.slice(0, 11) + '…' : d.label}
          </text>
        )
      })}
    </svg>
  )
}

/** Tendance 4 semaines d'une habitude — barres fines arrondies côté données. */
export function TrendBars({ values, color }: { values: number[]; color: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const w = 64, h = 22, bw = 10, gap = (w - bw * values.length) / (values.length - 1 || 1)
  return (
    <svg width={w} height={h} role="img" aria-label="Tendance sur 4 semaines">
      {values.map((v, i) => {
        const bh = Math.max(2, v * (h - 4))
        return (
          <rect key={i} x={i * (bw + gap)} y={h - bh} width={bw} height={bh} rx="2"
            fill={hover === i ? color : `${color}99`}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <title>{`Semaine ${i - 3 === 0 ? 'en cours' : i - 3} : ${Math.round(v * 100)}%`}</title>
          </rect>
        )
      })}
    </svg>
  )
}

/** Anneau de progression (nombre héros au centre, texte en encre). */
export function Ring({ value, size = 64, color = 'var(--color-sun)', label }: {
  value: number; size?: number; color?: string; label?: string
}) {
  const r = size / 2 - 5
  const c = 2 * Math.PI * r
  const v = Math.min(100, Math.max(0, value))
  return (
    <svg width={size} height={size} role="img" aria-label={label ?? `${v}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-panel-3)" strokeWidth="5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${(v / 100) * c} ${c}`} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size / 4.2}
        fontWeight="600" fill="var(--color-ink)">
        {Math.round(v)}%
      </text>
    </svg>
  )
}
