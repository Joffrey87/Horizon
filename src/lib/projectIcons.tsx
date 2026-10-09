import {
  BadgeEuro, Banknote, BookOpenText, Briefcase, Church, Coins, FolderKanban, Gem, GraduationCap,
  Hammer, Handshake, HandCoins, Heart, HeartHandshake, House, Landmark, Leaf, Plane, Car,
  PaintRoller, Palette, PiggyBank, Receipt, Rocket, Stethoscope, Sunrise, Telescope, Users,
  Wrench, Waves, Calculator, Dumbbell, Music, Camera, ShoppingCart,
} from 'lucide-react'
import type { Domain, Project } from './types'
import type { ComponentType } from 'react'
import { Sunset, type IconeProps } from '../components/SunsetIcone'

/** Icônes proposées pour un projet. La clé est ce qui est enregistré en base
 *  (`projects.icon`) : ne pas la renommer. */
export const ICONES_PROJET: Record<string, ComponentType<IconeProps>> = {
  'graduation-cap': GraduationCap, 'heart-handshake': HeartHandshake, sunset: Sunset, hammer: Hammer,
  'folder-kanban': FolderKanban, briefcase: Briefcase, house: House, 'paint-roller': PaintRoller, wrench: Wrench,
  landmark: Landmark, banknote: Banknote, coins: Coins, 'hand-coins': HandCoins, 'piggy-bank': PiggyBank,
  'badge-euro': BadgeEuro, calculator: Calculator, receipt: Receipt, handshake: Handshake,
  'book-open-text': BookOpenText, gem: Gem, church: Church, heart: Heart, users: Users,
  sunrise: Sunrise, telescope: Telescope, leaf: Leaf, waves: Waves, rocket: Rocket,
  plane: Plane, car: Car, stethoscope: Stethoscope, dumbbell: Dumbbell, music: Music, camera: Camera,
  palette: Palette, 'shopping-cart': ShoppingCart,
}

/** Couleurs proposées pour le liseret d'un projet. */
export const COULEURS_PROJET = [
  '#0d9488', '#3b82f6', '#8b5cf6', '#dc4a6b', '#d97706', '#65a30d', '#0891b2', '#c2410c', '#a16207', '#64748b',
]

/** Couleur du projet, à défaut celle de son domaine. */
export function couleurProjet(project: Pick<Project, 'color' | 'domain_id'> | undefined, domains: Domain[]): string | undefined {
  if (!project) return undefined
  return project.color ?? domains.find((d) => d.id === project.domain_id)?.color
}
