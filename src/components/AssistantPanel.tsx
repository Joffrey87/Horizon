import { useRef, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useHorizon } from '../lib/store'

const PRESETS: { label: string; prompt: string }[] = [
  { label: 'Faire le point sur mes projets', prompt: 'Fais un point synthétique sur mes projets : avancement, stagnation, blocages, et propose pour chacun une prochaine action claire.' },
  { label: 'Détecter la dispersion', prompt: 'Analyse mon système : trop de projets actifs ? des idées promues trop vite ? Où est la dispersion, et que suggères-tu de mettre en pause ou différer ?' },
  { label: 'Préparer ma revue du samedi', prompt: 'Aide-moi à préparer ma revue hebdomadaire : projets à revoir, habitudes qui se dégradent, idées à trier, et une proposition de focus réaliste pour la semaine.' },
  { label: 'Équilibre de vie', prompt: 'Regarde l’équilibre entre mes domaines de vie sur la base de mon activité récente. Quels domaines sont servis, lesquels sont délaissés ?' },
]

interface Msg { role: 'user' | 'assistant'; text: string }

/** L'IA est un copilote : elle propose, met en évidence, reformule.
 *  Elle ne modifie JAMAIS les données silencieusement. */
export function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useHorizon()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  if (!open) return null

  const snapshot = () => ({
    date: new Date().toISOString().slice(0, 10),
    settings: { wip_limit: state.settings?.wip_limit ?? 5 },
    domaines: state.domains.map((d) => ({ id: d.id, nom: d.name })),
    objectifs: state.objectives.filter((o) => o.status === 'actif')
      .map((o) => ({ titre: o.title, domaine: state.domains.find((d) => d.id === o.domain_id)?.name, horizon: o.horizon })),
    projets: state.projects.map((p) => ({
      titre: p.title, statut: p.status, avancement: p.progress,
      domaine: state.domains.find((d) => d.id === p.domain_id)?.name,
      bloque: p.blocked, motif_blocage: p.blocked_reason,
      derniere_activite: p.last_activity_at.slice(0, 10),
    })),
    taches_ouvertes: state.tasks.filter((t) => t.status === 'a_faire' || t.status === 'en_cours')
      .map((t) => ({ titre: t.title, projet: state.projects.find((p) => p.id === t.project_id)?.title, echeance: t.due_date })),
    idees_actives: state.ideas.filter((i) => i.status === 'active' || i.status === 'reportee')
      .map((i) => ({ titre: i.title, statut: i.status, domaine: state.domains.find((d) => d.id === i.domain_id)?.name })),
    habitudes: state.habits.filter((h) => h.active).map((h) => ({
      titre: h.title, ancrage: h.anchor_state,
      faits_30j: state.habitLogs.filter((l) => l.habit_id === h.id && l.done
        && new Date(l.log_date) > new Date(Date.now() - 30 * 86400e3)).length,
    })),
    dernieres_revues: state.reviews.slice(0, 4).map((r) => ({ type: r.kind, date: r.review_date, faite: r.completed })),
  })

  const ask = async (prompt: string) => {
    if (!prompt.trim() || busy) return
    setError(null)
    setMessages((m) => [...m, { role: 'user', text: prompt }])
    setInput('')
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('horizon-ai', {
        body: {
          prompt,
          snapshot: snapshot(),
          history: messages.slice(-6),
        },
      })
      if (error) throw error
      const text: string = data?.text ?? 'Réponse vide.'
      setMessages((m) => [...m, { role: 'assistant', text }])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg.includes('ANTHROPIC_API_KEY')
        ? 'L’assistant n’est pas encore activé : la clé API Anthropic doit être configurée (voir Paramètres).'
        : `L’assistant est indisponible : ${msg}`)
    } finally {
      setBusy(false)
      setTimeout(() => scrollRef.current?.scrollTo({ top: 1e6, behavior: 'smooth' }), 50)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <aside className="flex h-full w-full max-w-md flex-col border-l border-line bg-panel"
        onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-sun" />
            <h2 className="text-sm font-semibold">Assistant Horizon</h2>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5" aria-label="Fermer"><X size={16} /></button>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {messages.length === 0 && (
            <div className="space-y-2">
              <p className="text-xs text-ink-3">
                Un copilote, pas un pilote : il propose et met en évidence — toi seul décides.
              </p>
              {PRESETS.map((p) => (
                <button key={p.label} onClick={() => void ask(p.prompt)}
                  className="btn-ghost block w-full px-3 py-2 text-left text-sm">
                  {p.label}
                </button>
              ))}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`rise max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
              m.role === 'user' ? 'ml-auto bg-sun/15 text-ink' : 'bg-panel-2 text-ink-2'
            }`}>
              <p className="whitespace-pre-wrap">{m.text}</p>
            </div>
          ))}
          {busy && <p className="text-xs text-ink-3">L'assistant réfléchit…</p>}
          {error && <p className="text-xs text-[#ec7f97]">{error}</p>}
        </div>

        <form className="border-t border-line p-4"
          onSubmit={(e) => { e.preventDefault(); void ask(input) }}>
          <div className="flex gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="Une question sur ton système…" className="field flex-1" />
            <button type="submit" disabled={busy || !input.trim()} className="btn-sun px-4 py-2 disabled:opacity-50">
              Envoyer
            </button>
          </div>
        </form>
      </aside>
    </div>
  )
}
