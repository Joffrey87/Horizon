import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { supabase } from '../lib/supabase'
import { Card } from '../components/ui'

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
