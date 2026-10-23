import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Bell, Check, FolderKanban, Lightbulb, ListTodo, ShoppingBag, ShoppingCart, X, type LucideIcon } from 'lucide-react'
import { useHorizon } from '../lib/store'
import { dernierDomaine, echecReseau, empiler, memoriserDomaine } from '../lib/capture'
import {
  CHOIX_RAYONS, SECTION_LABELS, cleLibelle, cleRayon, libelleRayon, planifierAjout, rayonDeCle, trouverListeCourses, decouperArticles, classerArticle, libelleSansBio,
  type Rayon,
} from '../lib/courses'
import { ROUTE_COURSES } from '../lib/navigation'
import { DomainDot } from './ui'

type Type = 'tache' | 'idee' | 'achat' | 'rappel' | 'courses'

const TYPES: { key: Type; label: string; icon: LucideIcon }[] = [
  { key: 'tache', label: 'Tâche', icon: ListTodo },
  { key: 'idee', label: 'Idée', icon: Lightbulb },
  { key: 'achat', label: 'Achat', icon: ShoppingBag },
  { key: 'rappel', label: 'Rappel', icon: Bell },
  { key: 'courses', label: 'Courses', icon: ShoppingCart },
]

/**
 * Bouton « + » : panneau d'ajout rapide (feuille qui monte du bas).
 *  - Tâche / Achat / Rappel → Priorités (« À trier »), table des tâches (colonne kind) ;
 *  - Idée → table des idées (domaine requis) ;
 *  - Courses → articles de la liste « Courses », rangés par catégorie selon la règle de lib/courses.
 * Rattachement facultatif à un domaine ET/OU un projet. Jamais d'échéance.
 */
export function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  // Monté seulement ouvert : chaque ouverture repart d'un panneau vierge.
  return <Panneau onClose={onClose} />
}

function Panneau({ onClose }: { onClose: () => void }) {
  const s = useHorizon()
  const [type, setType] = useState<Type>('tache')
  const [texte, setTexte] = useState('')
  const [domainId, setDomainId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [choix, setChoix] = useState<Record<string, Rayon>>({})
  const [busy, setBusy] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [fait, setFait] = useState<{ message: string; courses: boolean } | null>(null)
  const champ = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

  useEffect(() => { champ.current?.focus() }, [type])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const courses = type === 'courses'
  const projets = useMemo(() => {
    const ordre = new Map(s.domains.map((d, i) => [d.id, i]))
    return s.projects
      .filter((p) => p.status === 'actif' || p.status === 'pause')
      .sort((a, b) => (ordre.get(a.domain_id) ?? 99) - (ordre.get(b.domain_id) ?? 99) || a.title.localeCompare(b.title))
  }, [s.projects, s.domains])
  const projet = projets.find((p) => p.id === projectId)
  const domaineChoisi = s.domains.find((d) => d.id === domainId)

  // Domaine de repli quand rien n'est choisi : la base exige un rattachement (domaine ou projet).
  const dernier = dernierDomaine()
  const repli = (dernier && s.domains.some((d) => d.id === dernier) ? dernier : s.domains[0]?.id) ?? ''
  const domaineIdee = domainId || projet?.domain_id || repli
  const domaineTache = domainId || (projectId ? '' : repli)
  const nomDomaine = (id: string) => s.domains.find((d) => d.id === id)?.name ?? ''

  const listeCourses = trouverListeCourses(s.shoppingLists)
  const existants = useMemo(
    () => (listeCourses ? s.shoppingItems.filter((i) => i.list_id === listeCourses.id) : []),
    [s.shoppingItems, listeCourses])
  const plan = useMemo(() => (courses ? planifierAjout(texte, existants, choix) : null), [courses, texte, existants, choix])
  const apercu = useMemo(() => {
    if (!courses) return []
    return decouperArticles(texte).map((brut) => {
      const auto = classerArticle(brut)
      const rayon: Rayon = choix[brut] ?? { section: auto.section, category: auto.category }
      return { brut, rayon, libelle: choix[brut] ? libelleSansBio(brut, choix[brut]) : auto.label }
    })
  }, [courses, texte, choix])
  // Un article est « déjà là » s'il n'est pas recréé (même mot, même famille bio / non-bio).
  const dejaLa = (libelle: string, rayon: Rayon) =>
    !!plan && !plan.aAjouter.some((x) => cleLibelle(x.label) === cleLibelle(libelle) && (x.section === 'bio') === (rayon.section === 'bio'))

  const nbCourses = plan ? plan.aAjouter.length + plan.aRemettre.length : 0
  const vide = courses ? decouperArticles(texte).length === 0 : !texte.trim()
  const bloque = busy || vide || (!courses && !(type === 'idee' ? domaineIdee : domaineTache || projectId))

  const ajouter = async (e: React.FormEvent) => {
    e.preventDefault()
    if (bloque) return
    setBusy(true); setErreur(null)
    const reussi = courses ? await ajouterCourses() : await ajouterElement()
    setBusy(false)
    if (reussi) {
      setTimeout(onClose, reussi.courses ? 2200 : 900)
      setFait(reussi)
    } else {
      setErreur(useHorizon.getState().error ?? 'Ajout impossible pour le moment.')
    }
  }

  async function ajouterElement(): Promise<{ message: string; courses: boolean } | null> {
    const titre = texte.trim()
    const cree = type === 'idee'
      ? await s.insert('ideas', { title: titre, domain_id: domaineIdee, project_id: projectId || null, status: 'active' })
      : await s.insert('tasks', {
        title: titre, kind: type, status: 'a_faire', domain_id: domaineTache || null, project_id: projectId || null,
      })
    if (cree) {
      if (domainId) memoriserDomaine(domainId)
      return { message: type === 'idee' ? 'Idée conservée.' : 'Ajouté aux Priorités (à trier).', courses: false }
    }
    // Réseau absent : capture simple mise de côté sur l'appareil, renvoyée à la reconnexion.
    const simple = !projectId && (type === 'idee' || type === 'tache')
    const dom = type === 'idee' ? domaineIdee : domaineTache
    if (simple && dom && echecReseau(useHorizon.getState().error) && empiler({ kind: type, title: titre, domain_id: dom })) {
      s.clearError(); s.refreshEnAttente()
      return { message: 'Hors ligne : gardé sur l’appareil, envoyé dès que le réseau revient.', courses: false }
    }
    return null
  }

  async function ajouterCourses(): Promise<{ message: string; courses: boolean } | null> {
    if (!plan) return null
    let liste = listeCourses
    if (!liste) {
      liste = await s.insert('shopping_lists', { name: 'Courses', recurrent: true, sort_order: s.shoppingLists.length })
      if (!liste) return null
    }
    let ordre = existants.reduce((m, i) => Math.max(m, i.sort_order), -1) + 1
    for (const a of plan.aAjouter) {
      const ok = await s.insert('shopping_items', {
        list_id: liste.id, label: a.label, section: a.section, category: a.category, sort_order: ordre++,
      })
      if (!ok) return null
    }
    for (const r of plan.aRemettre) await s.update('shopping_items', r.id, { checked: false })
    const n = nbCourses
    const d = plan.doublons.length
    return {
      courses: true,
      message: `${n} article${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} à Courses`
        + (d ? ` (${d} déjà dans la liste)` : '') + '.',
    }
  }

  const basculer = <T,>(courant: T, valeur: T, set: (v: T) => void, vide: T) => set(courant === valeur ? vide : valeur)

  const resume = (() => {
    if (courses) return libelleCourses(nbCourses, plan?.doublons.length ?? 0, !!listeCourses)
    const lieu = [domaineChoisi?.name, projet?.title].filter(Boolean).join(' › ')
    if (type === 'idee') return `Idée gardée · ${lieu ? lieu : nomDomaine(domaineIdee) || 'sans domaine'}`
    return lieu ? `Arrive dans « À trier » · ${lieu}` : `Arrive dans « À trier » · sans choix : ${nomDomaine(domaineTache) || 'aucun domaine'}`
  })()

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" onClick={onClose} role="presentation">
      <form onSubmit={ajouter} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Ajouter"
        className="sheet-up absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl border border-b-0 border-line-2 bg-panel shadow-2xl shadow-black/60 sm:bottom-6 sm:rounded-3xl sm:border-b">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-2" />
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <h2 className="text-base font-semibold">Nouvel élément</h2>
          <button type="button" onClick={onClose} className="btn-ghost p-1.5" aria-label="Fermer"><X size={18} /></button>
        </div>

        {fait ? (
          <div className="px-4 pb-8 pt-4 text-center">
            <Check size={26} className="mx-auto mb-2 text-[#4cc79a]" />
            <p className="text-sm text-[#4cc79a]">{fait.message}</p>
            {fait.courses && (
              <Link to={ROUTE_COURSES} onClick={onClose} className="btn-ghost mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm">
                <ShoppingCart size={14} /> Voir la liste
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-2">
              {courses ? (
                <textarea ref={champ} value={texte} onChange={(e) => setTexte(e.target.value)} rows={2}
                  placeholder="Lait, pommes, dentifrice… (virgule ou retour ligne)" className="field resize-none text-[15px]" />
              ) : (
                <input ref={champ} value={texte} onChange={(e) => setTexte(e.target.value)}
                  placeholder={type === 'idee' ? 'Et si… ?' : type === 'achat' ? 'Qu’est-ce qu’il faut acheter ?' : type === 'rappel' ? 'Quoi te rappeler ?' : 'Qu’y a-t-il à faire ?'}
                  className="field text-[15px]" />
              )}

              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type">
                {TYPES.map(({ key, label, icon: Icon }) => (
                  <button type="button" key={key} role="radio" aria-checked={type === key} onClick={() => setType(key)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      type === key ? 'border-sun/60 bg-sun/10 text-sun-soft' : 'border-line-2 text-ink-2 hover:text-ink'}`}>
                    <Icon size={14} strokeWidth={1.8} /> {label}
                  </button>
                ))}
              </div>

              {courses ? (
                apercu.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-ink-3">Rangé dans « {listeCourses?.name ?? 'Courses'} »</p>
                    <ul className="space-y-1.5">
                      {apercu.map((a) => (
                        <li key={a.brut} className="flex items-center gap-2">
                          <span className={`min-w-0 flex-1 truncate text-sm ${dejaLa(a.libelle, a.rayon) ? 'text-ink-3' : 'text-ink'}`}>
                            {a.libelle}
                            {dejaLa(a.libelle, a.rayon) && <span className="ml-1.5 text-[11px] text-ink-3">déjà dans la liste</span>}
                          </span>
                          <select aria-label={`Catégorie de ${a.libelle}`} value={cleRayon(a.rayon)} disabled={dejaLa(a.libelle, a.rayon)}
                            onChange={(e) => setChoix({ ...choix, [a.brut]: rayonDeCle(e.target.value) })}
                            className="field w-auto max-w-[55%] py-1 pr-6 text-xs">
                            {CHOIX_RAYONS.map((r) => (
                              <optgroup key={r.section} label={SECTION_LABELS[r.section]}>
                                {r.categories.map((c) => {
                                  const rayon = { section: r.section, category: c }
                                  return <option key={cleRayon(rayon)} value={cleRayon(rayon)}>{libelleRayon(rayon)}</option>
                                })}
                              </optgroup>
                            ))}
                          </select>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              ) : (
                <>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-ink-3">Domaine <span className="font-normal">· facultatif</span></p>
                    <div className="flex flex-wrap gap-1.5">
                      {s.domains.map((d) => (
                        <button type="button" key={d.id} aria-pressed={domainId === d.id}
                          onClick={() => basculer(domainId, d.id, setDomainId, '')}
                          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                            domainId === d.id ? 'border-sun/60 bg-sun/10 text-ink' : 'border-line-2 text-ink-3 hover:text-ink-2'}`}>
                          <DomainDot color={d.color} size={7} /> {d.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  {projets.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-ink-3">Projet <span className="font-normal">· facultatif, en plus ou à la place</span></p>
                      <ul className="max-h-44 space-y-1 overflow-y-auto">
                        {projets.map((p) => {
                          const d = s.domains.find((x) => x.id === p.domain_id)
                          const couleur = p.color ?? d?.color ?? 'var(--color-ink-3)'
                          const on = projectId === p.id
                          return (
                            <li key={p.id}>
                              <button type="button" aria-pressed={on} onClick={() => basculer(projectId, p.id, setProjectId, '')}
                                className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors ${
                                  on ? 'border-sun/60 bg-sun/10' : 'border-line hover:bg-panel-2'}`}>
                                <FolderKanban size={15} style={{ color: couleur }} className="shrink-0" />
                                <span className="min-w-0 flex-1 truncate text-sm text-ink">{p.title}</span>
                                {d && <span className="shrink-0 text-[11px] text-ink-3">{d.name}</span>}
                                {on && <Check size={14} className="shrink-0 text-sun-soft" />}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                </>
              )}
              {erreur && <p role="alert" className="text-xs text-[#ff6b6b]">{erreur}</p>}
            </div>

            <div className="shrink-0 border-t border-line px-4 pb-4 pt-3">
              <button type="submit" disabled={bloque} className="btn-sun w-full py-3 text-[15px] disabled:opacity-50">Ajouter</button>
              <p className="mt-2 text-center text-xs text-ink-3">{resume}</p>
            </div>
          </>
        )}
      </form>
    </div>,
    document.body,
  )
}

function libelleCourses(n: number, doublons: number, existe: boolean): string {
  if (n === 0 && doublons === 0) return existe ? 'Ajoute dans ta liste « Courses »' : 'La liste « Courses » sera créée'
  const base = `→ Courses · ${n} article${n > 1 ? 's' : ''}`
  return doublons ? `${base} · ${doublons} déjà dans la liste` : base
}
