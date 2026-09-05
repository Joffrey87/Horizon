import { useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarSync, Download, Plus, RefreshCw, Trash2, Upload } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { supabase } from '../lib/supabase'
import { Card, DomainDot } from '../components/ui'

export function SettingsView() {
  const s = useHorizon()
  const [firstName, setFirstName] = useState(s.settings?.first_name ?? '')
  const [homeCity, setHomeCity] = useState(s.settings?.home_city ?? '')
  const [wip, setWip] = useState(s.settings?.wip_limit ?? 5)
  const [quote, setQuote] = useState(s.settings?.daily_quote ?? true)
  const [feasts, setFeasts] = useState(s.settings?.catholic_feasts ?? true)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const save = async () => {
    await s.saveSettings({ first_name: firstName.trim() || null, home_city: homeCity.trim() || null, wip_limit: wip, daily_quote: quote })
  }

  /* ---- Export : éviter l'enfermement des données ---- */
  const exportJson = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      app: 'horizon', version: 2,
      // Toutes les collections du store : un export partiel enfermerait les données
      // qu'il oublie (étapes, vérifications, anniversaires, listes, actualités…).
      domains: s.domains, objectives: s.objectives, projects: s.projects, steps: s.steps,
      tasks: s.tasks, ideas: s.ideas, habits: s.habits, habit_logs: s.habitLogs,
      reviews: s.reviews, layouts: s.layouts, birthdays: s.birthdays, checks: s.checks,
      olafatco_jobs: s.olafatcoJobs, news_topics: s.newsTopics, news_digests: s.newsDigests,
      shopping_lists: s.shoppingLists, shopping_items: s.shoppingItems,
      settings: s.settings,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `horizon-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  /* ---- Import : réinjecte un export complet (mêmes ids ⇒ upsert) ---- */
  const importJson = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text())
      if (raw.app !== 'horizon') throw new Error('Fichier non reconnu')
      const uid = s.session?.user.id
      if (!uid) return
      const stamp = <T extends object>(rows: T[]) => rows.map((r) => ({ ...r, user_id: uid }))
      // Ordre imposé par les clés étrangères (parents avant enfants).
      const order: [string, unknown[]][] = [
        ['domains', raw.domains], ['objectives', raw.objectives], ['projects', raw.projects],
        ['steps', raw.steps], ['tasks', raw.tasks], ['ideas', raw.ideas], ['habits', raw.habits],
        ['habit_logs', raw.habit_logs], ['reviews', raw.reviews], ['layouts', raw.layouts],
        ['birthdays', raw.birthdays], ['checks', raw.checks], ['olafatco_jobs', raw.olafatco_jobs],
        ['news_topics', raw.news_topics], ['news_digests', raw.news_digests],
        ['shopping_lists', raw.shopping_lists], ['shopping_items', raw.shopping_items],
      ]
      let restored = 0
      for (const [table, rows] of order) {
        if (Array.isArray(rows) && rows.length) {
          const { error } = await supabase.from(table).upsert(stamp(rows as object[]))
          if (error) throw error
          restored += rows.length
        }
      }
      if (raw.settings && typeof raw.settings === 'object') {
        const { id: _id, user_id: _uid, updated_at: _u, ...rest } = raw.settings as Record<string, unknown>
        await s.saveSettings(rest)
      }
      await s.loadAll()
      setImportMsg(`Import réussi (${restored} élément${restored > 1 ? 's' : ''}).`)
    } catch (e) {
      setImportMsg(`Échec de l'import : ${e instanceof Error ? e.message : e}`)
    }
  }

  return (
    <div className="rise mx-auto max-w-xl space-y-4 pt-4">
      <header>
        <h1 className="text-xl font-semibold">Paramètres</h1>
      </header>

      <Card title="Profil">
        <label className="block space-y-1 text-xs text-ink-3">
          Prénom (pour l'accueil)
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)}
            onBlur={() => void save()} placeholder="Joffrey" className="field" />
        </label>
        <label className="mt-3 block space-y-1 text-xs text-ink-3">
          Ville de référence (pour chercher les messes)
          <input value={homeCity} onChange={(e) => setHomeCity(e.target.value)}
            onBlur={() => void save()} placeholder="Reims" className="field" />
          <span className="block text-[11px] text-ink-3">Horaires détaillés disponibles pour Reims. Ailleurs : lien vers messes.info.</span>
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={quote}
            onChange={(e) => { setQuote(e.target.checked); void s.saveSettings({ daily_quote: e.target.checked }) }}
            className="accent-[#f59e0b]" />
          Afficher la citation du jour
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={feasts}
            onChange={(e) => { setFeasts(e.target.checked); void s.saveSettings({ catholic_feasts: e.target.checked }) }}
            className="accent-[#f59e0b]" />
          Afficher les grandes fêtes catholiques
        </label>
        <p className="text-[11px] text-ink-3">
          Marque les 15 grandes fêtes (✝) dans le calendrier « Temps ». Les jours de fête travaillés ou en séjour rejoignent aussi la recherche de messe.
        </p>
      </Card>

      <Card title="Limitation du travail en cours">
        <label className="block space-y-1 text-xs text-ink-3">
          Seuil de projets actifs : <span className="text-sm font-medium text-ink">{wip}</span>
          <input type="range" min={2} max={10} value={wip}
            onChange={(e) => setWip(Number(e.target.value))}
            onMouseUp={() => void save()} onTouchEnd={() => void save()}
            className="w-full accent-[#f59e0b]" />
        </label>
        <p className="mt-2 text-xs text-ink-3">
          Seuil souple : Horizon signale le dépassement sans jamais l'interdire. Recommandé : 3 à 5.
        </p>
      </Card>

      <Card title="Tes données t'appartiennent">
        <div className="flex flex-wrap gap-2">
          <button onClick={exportJson} className="btn-ghost flex items-center gap-2 px-4 py-2 text-sm">
            <Download size={15} /> Exporter tout (JSON)
          </button>
          <button onClick={() => fileRef.current?.click()} className="btn-ghost flex items-center gap-2 px-4 py-2 text-sm">
            <Upload size={15} /> Importer un export
          </button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f) }} />
        </div>
        {importMsg && <p className="mt-2 text-xs text-ink-2">{importMsg}</p>}
      </Card>

      <AgendasCard />

      <Card title="Assistant IA (mis de côté)">
        <p className="text-sm leading-relaxed text-ink-2">
          L'assistant n'est pas accessible dans l'app pour le moment : il reste dans le code
          (<code className="text-xs">AssistantPanel.tsx</code>), prêt à être réactivé.
          Il s'appuie sur l'API Claude d'Anthropic via une fonction serveur sécurisée.
          Ta clé API n'est jamais exposée dans le navigateur : elle est stockée comme secret
          Supabase (<code className="text-xs">ANTHROPIC_API_KEY</code>).
        </p>
        <p className="mt-2 text-xs text-ink-3">
          Garde-fous : l'IA propose et met en évidence, elle ne modifie jamais tes données silencieusement.
          Horizon reste pleinement utilisable sans elle.
        </p>
      </Card>
    </div>
  )
}

/** Agendas externes (iCal) : Google Agenda et compagnie.
 *
 *  L'adresse iCal est une CLÉ D'ACCÈS EN LECTURE à l'agenda — elle se colle
 *  ici, va en base protégée par RLS, et n'apparaît jamais en clair ensuite. */
function AgendasCard() {
  const s = useHorizon()
  const [ouvert, setOuvert] = useState(false)
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [domainId, setDomainId] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const ajouter = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!label.trim() || !url.trim()) return
    setBusy(true)
    const cree = await s.insert('calendar_feeds', {
      label: label.trim(), ical_url: url.trim(), domain_id: domainId || null,
    })
    setBusy(false)
    if (!cree) return
    setLabel(''); setUrl(''); setDomainId(''); setOuvert(false)
    void synchroniser()
  }

  const synchroniser = async () => {
    setBusy(true); setMsg(null)
    const r = await s.syncAgenda()
    setBusy(false)
    if (!r.ok) { setMsg(`Échec : ${r.error}`); return }
    const n = r.propositions ?? 0
    setMsg(n === 0
      ? 'Agenda relu : rien de nouveau à proposer.'
      : `${n} évènement${n > 1 ? 's' : ''} à trier — le choix se fait dans « Temps ».`)
  }

  /** L'adresse ne se réaffiche pas en clair : un agenda se remplace, pas se relit. */
  const apercu = (u: string) => { try { return new URL(u).host } catch { return 'adresse enregistrée' } }

  return (
    <Card title="Agendas externes">
      <p className="mb-3 text-xs text-ink-3">
        Les évènements d’un agenda iCal (Google Agenda…) remontent dans « Temps », comme le
        planning CAPS. Google met son export iCal en cache : un ajout peut mettre quelques
        heures à apparaître — c’est chez eux, pas ici.
      </p>

      {s.calendarFeeds.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {s.calendarFeeds.map((f) => {
            const dom = s.domains.find((d) => d.id === f.domain_id)
            return (
              <li key={f.id} className="flex items-center gap-2 rounded-lg bg-panel-2/60 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm text-ink">
                    {dom && <DomainDot color={dom.color} size={7} />}{f.label}
                  </p>
                  <p className="text-[11px] text-ink-3">
                    {apercu(f.ical_url)}
                    {f.last_sync_at && ` · synchronisé le ${format(parseISO(f.last_sync_at), "d MMM 'à' HH'h'mm", { locale: fr })}`}
                    {typeof f.last_count === 'number' && ` · ${f.last_count} évènements`}
                  </p>
                  {f.last_error && <p className="text-[11px] text-[#ec7f97]">{f.last_error}</p>}
                </div>
                <button onClick={() => void s.update('calendar_feeds', f.id, { active: !f.active })}
                  className="btn-ghost shrink-0 p-1.5 text-ink-3" title={f.active ? 'Mettre en pause' : 'Réactiver'}>
                  <span className={`block h-3.5 w-3.5 rounded-full border-2 ${f.active ? 'border-good bg-good/40' : 'border-line-2'}`} />
                </button>
                <button onClick={() => { if (confirm(`Retirer l’agenda « ${f.label} » ? Ses évènements resteront dans Horizon.`)) void s.remove('calendar_feeds', f.id) }}
                  className="btn-ghost shrink-0 p-1.5 text-ink-3 hover:text-[#ec7f97]" title="Retirer">
                  <Trash2 size={14} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {ouvert ? (
        <form onSubmit={ajouter} className="space-y-2">
          <input required value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="Nom (ex. Perso, Famille, ARIL)" className="field w-full" />
          <input required type="url" value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="Adresse privée au format iCal (…/basic.ics)" className="field w-full" />
          <select value={domainId} onChange={(e) => setDomainId(e.target.value)} className="field w-full">
            <option value="">Sans domaine</option>
            {s.domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-sun px-4 py-2 text-sm disabled:opacity-50">Ajouter</button>
            <button type="button" onClick={() => setOuvert(false)} className="btn-ghost px-4 py-2 text-sm">Annuler</button>
          </div>
          <p className="text-[11px] text-ink-3">
            Google Agenda → Paramètres de l’agenda → « Intégrer l’agenda » → <strong>Adresse secrète au format iCal</strong>.
            Cette adresse donne accès à ton agenda : ne la partage nulle part.
          </p>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setOuvert(true)} className="btn-ghost flex items-center gap-1.5 px-4 py-2 text-sm">
            <Plus size={15} /> Ajouter un agenda
          </button>
          {s.calendarFeeds.length > 0 && (
            <button onClick={() => void synchroniser()} disabled={busy}
              className="btn-ghost flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-50">
              {busy ? <RefreshCw size={15} className="animate-spin" /> : <CalendarSync size={15} />}
              Synchroniser maintenant
            </button>
          )}
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-ink-2">{msg}</p>}
    </Card>
  )
}
