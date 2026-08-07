import { useState } from 'react'
import { useHorizon } from '../lib/store'
import { Modal, DomainDot } from './ui'

/** Capture rapide d'une idée : elle est conservée, classée dans un domaine,
 *  et ne devient PAS automatiquement un projet. */
export function QuickCapture({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { domains, insert } = useHorizon()
  const [title, setTitle] = useState('')
  const [domainId, setDomainId] = useState<string>('')
  const [saved, setSaved] = useState(false)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    const dom = domainId || domains[0]?.id
    if (!dom) return
    await insert('ideas', { title: title.trim(), domain_id: dom, status: 'active' })
    setTitle(''); setSaved(true)
    setTimeout(() => { setSaved(false); onClose() }, 900)
  }

  return (
    <Modal open={open} onClose={onClose} title="Capturer une idée">
      {saved ? (
        <p className="py-4 text-center text-sm text-[#4cc79a]">Idée conservée. Retour au focus.</p>
      ) : (
        <form onSubmit={save} className="space-y-3">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Et si… ?" className="field" />
          <div className="flex flex-wrap gap-1.5">
            {domains.map((d) => (
              <button type="button" key={d.id} onClick={() => setDomainId(d.id)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  (domainId || domains[0]?.id) === d.id
                    ? 'border-sun/60 bg-sun/10 text-ink'
                    : 'border-line-2 text-ink-3 hover:text-ink-2'
                }`}>
                <DomainDot color={d.color} size={7} />
                {d.name}
              </button>
            ))}
          </div>
          <button type="submit" className="btn-sun w-full py-2">Conserver l'idée</button>
          <p className="text-center text-xs text-ink-3">« Bonne idée — mais ce sera peut-être pour dans 6 mois. »</p>
        </form>
      )}
    </Modal>
  )
}
