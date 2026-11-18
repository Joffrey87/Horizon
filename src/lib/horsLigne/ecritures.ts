// ================================================================
// Hors ligne — lectures de la messe téléchargées à l'avance.
// fetchMass (AELF) et fetchMissel (missel de 1962) gardent chaque jour en cache
// local ; il suffit de les appeler en ligne pour les jours qui viennent (et la
// semaine écoulée, pour la révision de semaine du quizz). Une fois par jour.
// ================================================================

import { addDays, format } from 'date-fns'
import { fetchMass } from '../aelf'
import { fetchMissel } from '../missel'

const CLE = 'horizon.horsligne.ecritures'

export async function prechargerEcritures(): Promise<void> {
  const aujourdhui = format(new Date(), 'yyyy-MM-dd')
  try {
    if (localStorage.getItem(CLE) === aujourdhui) return
    localStorage.setItem(CLE, aujourdhui)
  } catch { return }
  let missel = true
  try { missel = localStorage.getItem('horizon.messe.forme') !== 'ordinaire' } catch { /* défaut : 1962 */ }
  for (let i = -6; i <= 7; i++) {
    const jour = format(addDays(new Date(), i), 'yyyy-MM-dd')
    // Le psaume et la citation de l'accueil viennent toujours de l'AELF.
    try { await fetchMass(jour) } catch { /* jour sans lecture : tant pis */ }
    if (missel) { try { await fetchMissel(jour) } catch { /* repli AELF à l'affichage */ } }
  }
}
