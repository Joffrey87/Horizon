import { useRef, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X, List } from 'lucide-react'

const BULLET = '• '

/** Zone de note : texte libre avec puces. Entrée continue la puce en cours
 *  (une ligne « • » vide sort de la liste). Bouton pour insérer une puce. */
export function NoteArea({ value, onChange, placeholder, rows = 6 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const putCursor = (pos: number) => {
    requestAnimationFrame(() => {
      const el = ref.current
      if (el) { el.focus(); el.setSelectionRange(pos, pos) }
    })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    const el = e.currentTarget
    const pos = el.selectionStart
    const before = value.slice(0, pos)
    const lineStart = before.lastIndexOf('\n') + 1
    const line = before.slice(lineStart)
    if (!line.startsWith(BULLET)) return
    e.preventDefault()
    if (line.trim() === BULLET.trim()) {
      // puce vide → on sort de la liste (retire la puce)
      const next = value.slice(0, lineStart) + value.slice(pos)
      onChange(next); putCursor(lineStart)
    } else {
      const next = before + '\n' + BULLET + value.slice(pos)
      onChange(next); putCursor(pos + 1 + BULLET.length)
    }
  }

  const addBullet = () => {
    const el = ref.current
    const pos = el ? el.selectionStart : value.length
    const atLineStart = pos === 0 || value[pos - 1] === '\n'
    const ins = (atLineStart ? '' : '\n') + BULLET
    const next = value.slice(0, pos) + ins + value.slice(pos)
    onChange(next); putCursor(pos + ins.length)
  }

  return (
    <div className="space-y-1">
      <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown}
        placeholder={placeholder} rows={rows} className="field w-full resize-y leading-relaxed" />
      <button type="button" onClick={addBullet}
        className="btn-ghost flex items-center gap-1.5 px-2.5 py-1 text-xs">
        <List size={13} /> Puce
      </button>
    </div>
  )
}

export function Card({ children, className = '', title, action, onClick }: {
  children: ReactNode; className?: string; title?: string; action?: ReactNode
  onClick?: (e: MouseEvent<HTMLElement>) => void
}) {
  return (
    <section className={`card p-4 ${className}`} onClick={onClick}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && <h3 className="block-title">{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function Badge({ children, tone = 'neutral' }: {
  children: ReactNode
  tone?: 'neutral' | 'sun' | 'good' | 'warn' | 'bad' | 'info'
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-panel-3 text-ink-2',
    sun: 'bg-sun/15 text-sun-soft',
    good: 'bg-good/15 text-[#4cc79a]',
    warn: 'bg-warn/15 text-[#eda145]',
    bad: 'bg-bad/15 text-[#ec7f97]',
    info: 'bg-info/15 text-[#6ea8ee]',
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function ProgressBar({ value, color = 'var(--color-sun)' }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-3" role="progressbar"
      aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
    </div>
  )
}

export function DomainDot({ color, size = 8 }: { color: string; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />
}

export function Modal({ open, onClose, title, children, wide = false }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean
}) {
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}>
      <div className={`card rise mx-auto my-6 w-full ${wide ? 'max-w-2xl' : 'max-w-md'} p-5 sm:my-10`}
        onClick={(e) => e.stopPropagation()}>
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5" aria-label="Fermer"><X size={16} /></button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function EmptyState({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-8 text-center">
      <p className="text-sm text-ink-2">{children}</p>
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  )
}

/** Sélecteur segmenté sobre (une vue = une question). */
export function Seg<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-panel-2 p-0.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`rounded-[10px] px-3 py-1 text-sm transition-colors ${
            value === o.value ? 'bg-panel-3 text-ink' : 'text-ink-3 hover:text-ink-2'
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Scale3({ value, onChange, labels }: {
  value: number | null; onChange: (v: number) => void; labels: [string, string, string]
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)}
          className={`flex-1 rounded-lg border px-2 py-1 text-xs transition-colors ${
            value === n ? 'border-sun bg-sun/10 text-sun-soft' : 'border-line-2 text-ink-3 hover:text-ink-2'
          }`}>
          {labels[n - 1]}
        </button>
      ))}
    </div>
  )
}
