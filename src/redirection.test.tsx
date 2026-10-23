// L'app s'ouvre sur l'Agenda ; l'Accueil reste atteignable sur /accueil.
// On lit la vraie table de routes (celle de l'app et de la démo) sans rendre les écrans.
import { describe, it, expect, vi } from 'vitest'
import type { ReactElement } from 'react'
import { Navigate, createRoutesFromChildren, matchRoutes } from 'react-router-dom'
import { PAGE_OUVERTURE, ROUTE_ACCUEIL, ROUTE_COURSES } from './lib/navigation'
import { AppRoutes } from './routes'
import { Dashboard } from './views/Dashboard'
import { TimeView } from './views/TimeView'

// Les écrans importent le store, donc le client Supabase : inutile ici (rien n'est rendu).
vi.mock('./lib/supabase', () => ({ supabase: {} }))

const table = createRoutesFromChildren((AppRoutes() as ReactElement<{ children: ReactElement }>).props.children)
const element = (chemin: string) => matchRoutes(table, chemin)?.at(-1)?.route.element as ReactElement<{ to?: string }> | undefined

describe('ouverture sur l’Agenda', () => {
  it('« / » (ouverture, PWA start_url) redirige vers l’Agenda', () => {
    const e = element('/')
    expect(e?.type).toBe(Navigate)
    expect(e?.props.to).toBe(PAGE_OUVERTURE)
    expect(PAGE_OUVERTURE).toBe('/temps')
  })

  it('une adresse inconnue retombe aussi sur l’Agenda', () => {
    const e = element('/n-importe-quoi')
    expect(e?.type).toBe(Navigate)
    expect(e?.props.to).toBe('/temps')
  })

  it('le vrai Accueil est sur /accueil, l’Agenda sur /temps', () => {
    expect(ROUTE_ACCUEIL).toBe('/accueil')
    expect(element('/accueil')?.type).toBe(Dashboard)
    expect(element('/temps')?.type).toBe(TimeView)
  })

  it('le raccourci caddie pointe sur la page Listes, qui existe', () => {
    const chemin = ROUTE_COURSES.split('?')[0] ?? ''
    expect(matchRoutes(table, chemin)?.length).toBeGreaterThan(0)
    expect(element(chemin)?.type).not.toBe(Navigate)
  })
})
