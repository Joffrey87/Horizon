import { FolderKanban } from 'lucide-react'
import { ICONES_PROJET } from '../lib/projectIcons'
import type { Project } from '../lib/types'

/** Icône d'un projet — toujours de la même couleur (celle du texte), pour rester
 *  lisible ; c'est le liseret qui porte la couleur du projet. */
export function IconeProjet({ project, size = 12, className = '' }: {
  project: Pick<Project, 'icon' | 'title'>; size?: number; className?: string
}) {
  const Ic = (project.icon && ICONES_PROJET[project.icon]) || FolderKanban
  return (
    <span className={`inline-flex shrink-0 items-center text-ink ${className}`} title={`Projet : ${project.title}`}>
      <Ic size={size} strokeWidth={2} />
    </span>
  )
}
