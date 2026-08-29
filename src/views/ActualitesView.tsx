import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Newspaper, RefreshCw, Plus, Pencil, Trash2, ExternalLink, Eye, EyeOff, Sparkles, ChevronRight, Star,
} from 'lucide-react'
import { useHorizon } from '../lib/store'
import { todayIso } from '../lib/logic'
import type { NewsKind, NewsTopic } from '../lib/types'
import { Card, Modal, EmptyState, Badge } from '../components/ui'

// Marqueur « dernière auto-actualisation » : borne l'auto-refresh à 1×/jour.
const AUTO_KEY = 'horizon.news.autoRefreshedOn'

// Sujets proposés au premier lancement (les exemples donnés par l'utilisateur).
const SUGGESTED: { label: string; prompt: string }[] = [
  { label: 'Intelligence artificielle', prompt: 'Nouveaux modèles, grandes annonces des labos (Anthropic, OpenAI, Google, Mistral…), avancées et usages marquants.' },
  { label: 'Elon Musk & ses entreprises', prompt: 'Grandes annonces et avancées de Tesla, SpaceX, xAI, Neuralink, X et The Boring Company.' },
  { label: 'Atelier Missor', prompt: 'Actualités de l’Atelier Missor : nouvelles vidéos, projets, réalisations et machines.' },
]

/** Page « Actualités » : la veille du jour (14 jours, priorité à la semaine écoulée). */
export function ActualitesView() { return <NewsPage kind="jour" /> }

/** Page « Actualités importantes » : les 5 faits marquants du trimestre, par sujet. */
export function ActualitesImportantesView() { return <NewsPage kind="important" /> }

function NewsPage({ kind }: { kind: NewsKind }) {
  const s = useHorizon()
  const important = kind === 'important'
  const topics = useMemo(
    () => [...s.newsTopics].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [s.newsTopics],
  )
  const [editing, setEditing] = useState<NewsTopic | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const refresh = async (): Promise<{ ok: boolean }> => {
    if (busy) return { ok: false }
    setBusy(true); setMsg(null)
    const r = await s.refreshNews(kind)
    setBusy(false)
    setMsg(r.ok
      ? `Synthèses à jour${typeof r.updated === 'number' ? ` (${r.updated} sujet${r.updated > 1 ? 's' : ''})` : ''}.`
      : `Échec : ${r.error?.includes('ANTHROPIC') ? 'la clé API Anthropic doit être configurée.' : r.error}`)
    return { ok: r.ok }
  }

  // Auto-actualisation à la 1re visite du jour seulement (pas de cron serveur).
  // On saute si déjà tenté aujourd'hui ou si une synthèse date déjà d'aujourd'hui.
  // Les « importantes » ne s'auto-régénèrent jamais : elles se demandent à la main.
  useEffect(() => {
    if (important || topics.length === 0) return
    const today = todayIso()
    if (localStorage.getItem(AUTO_KEY) === today) return
    const freshToday = s.newsDigests.some((d) => digestKind(d) === 'jour' && d.generated_at?.slice(0, 10) === today)
    if (freshToday) { localStorage.setItem(AUTO_KEY, today); return }
    // Le marqueur n'est posé qu'APRÈS une génération réussie : sinon un échec
    // (réseau, clé absente) interdisait toute nouvelle tentative jusqu'au lendemain.
    void refresh().then((r) => { if (r.ok) localStorage.setItem(AUTO_KEY, today) })
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
            {important ? <Star size={18} /> : <Newspaper size={18} />}
          </span>
          <div>
            <h1 className="text-xl font-semibold">{important ? 'Actualités importantes' : 'Actualités'}</h1>
            <p className="text-xs text-ink-3">
              {important
                ? 'Pour chaque sujet, les 5 informations qui ont compté ces 3 derniers mois.'
                : 'Les nouvelles des 14 derniers jours, la semaine écoulée en premier.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {topics.length > 0 && !important && (
            <button onClick={() => setEditing('new')} className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-sm">
              <Plus size={15} /> Sujet
            </button>
          )}
          <button onClick={() => void refresh()} disabled={busy || topics.length === 0}
            className="btn-sun flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-50">
            <RefreshCw size={15} className={busy ? 'animate-spin' : ''} />
            {busy ? 'Synthèse en cours…' : important ? 'Refaire le bilan' : 'Actualiser'}
          </button>
        </div>
      </header>

      {msg && <p className="text-xs text-ink-3">{msg}</p>}

      {topics.length === 0 ? (
        important ? (
          <Card>
            <EmptyState hint="Ajoute d’abord des sujets dans « Actualités » : le bilan trimestriel les reprendra.">
              Aucun sujet suivi pour l’instant.
            </EmptyState>
          </Card>
        ) : (
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
        )
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {topics.map((t) => (
            <TopicRow key={t.id} topic={t} kind={kind} onEdit={() => setEditing(t)} />
          ))}
        </ul>
      )}

      {editing && <TopicForm state={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

const OPEN_KEY = 'horizon.news.replie' // sujets repliés (par id), pour garder l'état d'une visite à l'autre

function readCollapsed(): Record<string, true> {
  try { return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}') } catch { return {} }
}

/** La synthèse arrive en puces « — … » : on les découpe pour un rendu serré. */
function bullets(content: string): string[] {
  return content.split('\n').map((l) => l.trim().replace(/^[—–-]\s*/, '')).filter(Boolean)
}

/** Nature d'une synthèse, avec repli sur « jour » pour les lignes d'avant la migration 018. */
function digestKind(d: { kind?: NewsKind }): NewsKind { return d.kind ?? 'jour' }

/** Une ligne de sujet : titre + puces serrées, repliable. */
function TopicRow({ topic, kind, onEdit }: { topic: NewsTopic; kind: NewsKind; onEdit: () => void }) {
  const s = useHorizon()
  const digest = s.newsDigests.find((d) => d.topic_id === topic.id && digestKind(d) === kind)
  const foldKey = `${kind}:${topic.id}`
  const [collapsed, setCollapsed] = useState(() => !!readCollapsed()[foldKey])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    const map = readCollapsed()
    if (next) map[foldKey] = true; else delete map[foldKey]
    localStorage.setItem(OPEN_KEY, JSON.stringify(map))
  }

  const lines = digest ? bullets(digest.content) : []

  return (
    <li className={`group px-3 py-2 ${topic.active ? '' : 'opacity-60'}`}>
      <div className="flex items-center gap-2">
        <button onClick={toggle} aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left hover:text-ink">
          <ChevronRight size={13} className={`shrink-0 text-ink-3 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
          <span className="truncate text-sm font-medium">{topic.label}</span>
          {!topic.active && <Badge>en pause</Badge>}
          {digest && (
            <span className="shrink-0 text-[10px] text-ink-3">
              {formatDistanceToNow(parseISO(digest.generated_at), { addSuffix: true, locale: fr })}
            </span>
          )}
          {collapsed && lines.length > 0 && (
            <span className="hidden truncate text-[11px] text-ink-3 sm:inline">
              · {lines.length} {kind === 'important' ? 'faits' : 'actus'}
            </span>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button onClick={() => void s.update('news_topics', topic.id, { active: !topic.active })}
            className="btn-ghost p-1" title={topic.active ? 'Mettre en pause' : 'Réactiver'}
            aria-label={topic.active ? 'Mettre en pause' : 'Réactiver'}>
            {topic.active ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
          <button onClick={onEdit} className="btn-ghost p-1" title="Modifier" aria-label="Modifier">
            <Pencil size={13} />
          </button>
          <button onClick={() => { if (confirm(`Supprimer le sujet « ${topic.label} » ?`)) void s.remove('news_topics', topic.id) }}
            className="btn-ghost p-1" title="Supprimer" aria-label="Supprimer">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {!collapsed && (
        digest ? (
          <div className="mt-1 pl-[19px]">
            <ul className="space-y-1">
              {lines.map((l, i) => (
                <li key={i} className="flex gap-1.5 text-[13px] leading-snug text-ink-2">
                  <span className="shrink-0 text-ink-3">—</span><span className="min-w-0">{l}</span>
                </li>
              ))}
            </ul>
            {digest.sources.length > 0 && (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-ink-3">
                <ExternalLink size={10} className="shrink-0" />
                {digest.sources.map((src) => (
                  <a key={src.url} href={src.url} target="_blank" rel="noopener noreferrer"
                    className="truncate transition-colors hover:text-ink" title={src.title}>
                    {sourceHost(src.url)}
                  </a>
                ))}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-1 pl-[19px] text-[13px] text-ink-3">
            {kind === 'important'
              ? 'Pas encore de bilan — clique sur « Refaire le bilan ».'
              : 'Pas encore de synthèse — clique sur « Actualiser ».'}
          </p>
        )
      )}
    </li>
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
