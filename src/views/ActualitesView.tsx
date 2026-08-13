import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Newspaper, RefreshCw, Plus, Pencil, Trash2, ExternalLink, Eye, EyeOff, Sparkles,
} from 'lucide-react'
import { useHorizon } from '../lib/store'
import { todayIso } from '../lib/logic'
import type { NewsTopic } from '../lib/types'
import { Card, Modal, EmptyState, Badge } from '../components/ui'

// Marqueur « dernière auto-actualisation » : borne l'auto-refresh à 1×/jour.
const AUTO_KEY = 'horizon.news.autoRefreshedOn'

// Sujets proposés au premier lancement (les exemples donnés par l'utilisateur).
const SUGGESTED: { label: string; prompt: string }[] = [
  { label: 'Intelligence artificielle', prompt: 'Nouveaux modèles, grandes annonces des labos (Anthropic, OpenAI, Google, Mistral…), avancées et usages marquants.' },
  { label: 'Elon Musk & ses entreprises', prompt: 'Grandes annonces et avancées de Tesla, SpaceX, xAI, Neuralink, X et The Boring Company.' },
  { label: 'Atelier Missor', prompt: 'Actualités de l’Atelier Missor : nouvelles vidéos, projets, réalisations et machines.' },
]

export function ActualitesView() {
  const s = useHorizon()
  const topics = useMemo(
    () => [...s.newsTopics].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [s.newsTopics],
  )
  const [editing, setEditing] = useState<NewsTopic | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const refresh = async () => {
    if (busy) return
    setBusy(true); setMsg(null)
    const r = await s.refreshNews()
    setBusy(false)
    setMsg(r.ok
      ? `Synthèses à jour${typeof r.updated === 'number' ? ` (${r.updated} sujet${r.updated > 1 ? 's' : ''})` : ''}.`
      : `Échec : ${r.error?.includes('ANTHROPIC') ? 'la clé API Anthropic doit être configurée.' : r.error}`)
  }

  // Auto-actualisation à la 1re visite du jour seulement (pas de cron serveur).
  // On saute si déjà tenté aujourd'hui ou si une synthèse date déjà d'aujourd'hui.
  useEffect(() => {
    if (topics.length === 0) return
    const today = todayIso()
    if (localStorage.getItem(AUTO_KEY) === today) return
    const freshToday = s.newsDigests.some((d) => d.generated_at?.slice(0, 10) === today)
    localStorage.setItem(AUTO_KEY, today)
    if (!freshToday) void refresh()
  }, [topics.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const addSuggested = async () => {
    for (let i = 0; i < SUGGESTED.length; i++) {
      const sug = SUGGESTED[i]
      if (!sug) continue
      await s.insert('news_topics', { label: sug.label, prompt: sug.prompt, sort_order: i })
    }
  }

  return (
    <div className="rise space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sun/15 text-sun">
            <Newspaper size={18} />
          </span>
          <div>
            <h1 className="text-xl font-semibold">Actualités</h1>
            <p className="text-xs text-ink-3">Une synthèse quotidienne des sujets que tu suis.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {topics.length > 0 && (
            <button onClick={() => setEditing('new')} className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-sm">
              <Plus size={15} /> Sujet
            </button>
          )}
          <button onClick={() => void refresh()} disabled={busy || topics.length === 0}
            className="btn-sun flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-50">
            <RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> {busy ? 'Synthèse en cours…' : 'Actualiser'}
          </button>
        </div>
      </header>

      {msg && <p className="text-xs text-ink-3">{msg}</p>}

      {topics.length === 0 ? (
        <Card>
          <EmptyState hint="Choisis les sujets à suivre : Horizon en fait une synthèse chaque matin.">
            Aucun sujet suivi pour l’instant.
          </EmptyState>
          <div className="flex flex-wrap justify-center gap-2 pb-2">
            <button onClick={() => void addSuggested()} className="btn-sun flex items-center gap-1.5 px-4 py-2 text-sm">
              <Sparkles size={15} /> Ajouter les sujets suggérés
            </button>
            <button onClick={() => setEditing('new')} className="btn-ghost flex items-center gap-1.5 px-4 py-2 text-sm">
              <Plus size={15} /> Sujet personnalisé
            </button>
          </div>
          <p className="pt-1 text-center text-xs text-ink-3">
            Suggérés : {SUGGESTED.map((x) => x.label).join(' · ')}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {topics.map((t) => (
            <TopicCard key={t.id} topic={t} onEdit={() => setEditing(t)} />
          ))}
        </div>
      )}

      {editing && <TopicForm state={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function TopicCard({ topic, onEdit }: { topic: NewsTopic; onEdit: () => void }) {
  const s = useHorizon()
  const digest = s.newsDigests.find((d) => d.topic_id === topic.id)

  return (
    <Card className={topic.active ? '' : 'opacity-60'}>
      <header className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{topic.label}</h3>
            {!topic.active && <Badge>en pause</Badge>}
          </div>
          {digest && (
            <p className="text-[11px] text-ink-3">
              mis à jour {formatDistanceToNow(parseISO(digest.generated_at), { addSuffix: true, locale: fr })}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={() => void s.update('news_topics', topic.id, { active: !topic.active })}
            className="btn-ghost p-1.5" title={topic.active ? 'Mettre en pause' : 'Réactiver'}
            aria-label={topic.active ? 'Mettre en pause' : 'Réactiver'}>
            {topic.active ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
          <button onClick={onEdit} className="btn-ghost p-1.5" title="Modifier" aria-label="Modifier">
            <Pencil size={15} />
          </button>
          <button onClick={() => { if (confirm(`Supprimer le sujet « ${topic.label} » ?`)) void s.remove('news_topics', topic.id) }}
            className="btn-ghost p-1.5" title="Supprimer" aria-label="Supprimer">
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      {digest ? (
        <>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{digest.content}</p>
          {digest.sources.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {digest.sources.map((src) => (
                <a key={src.url} href={src.url} target="_blank" rel="noreferrer"
                  className="inline-flex max-w-[16rem] items-center gap-1 rounded-full bg-panel-3 px-2 py-0.5 text-[11px] text-ink-2 transition-colors hover:text-ink"
                  title={src.title}>
                  <ExternalLink size={11} className="shrink-0" />
                  <span className="truncate">{sourceHost(src.url)}</span>
                </a>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-3">
          Pas encore de synthèse. Clique sur « Actualiser » pour la générer.
        </p>
      )}
    </Card>
  )
}

function sourceHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

function TopicForm({ state, onClose }: { state: NewsTopic | 'new'; onClose: () => void }) {
  const s = useHorizon()
  const topic = state === 'new' ? null : state
  const [label, setLabel] = useState(topic?.label ?? '')
  const [prompt, setPrompt] = useState(topic?.prompt ?? '')

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const values = { label: label.trim(), prompt: prompt.trim() || null }
    if (!values.label) return
    if (topic) await s.update('news_topics', topic.id, values)
    else await s.insert('news_topics', { ...values, sort_order: s.newsTopics.length })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={topic ? 'Modifier le sujet' : 'Nouveau sujet'}>
      <form onSubmit={save} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-ink-3">Sujet</label>
          <input required value={label} onChange={(e) => setLabel(e.target.value)} autoFocus
            placeholder="Ex. Intelligence artificielle" className="field w-full" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-3">Précisions (optionnel)</label>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
            placeholder="Ce que tu veux suivre précisément : entreprises, angles, types d’annonces…"
            className="field w-full resize-y leading-relaxed" />
          <p className="mt-1 text-[11px] text-ink-3">Oriente la synthèse (facultatif mais utile).</p>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-sm">Annuler</button>
          <button type="submit" className="btn-sun px-4 py-2 text-sm">{topic ? 'Enregistrer' : 'Ajouter'}</button>
        </div>
      </form>
    </Modal>
  )
}
