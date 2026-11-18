import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { finishBankAuthFromUrl } from './lib/bankConnections'

// Retour d'autorisation bancaire (Enable Banking) : enregistre la connexion, sans rien afficher de plus.
void finishBankAuthFromUrl().then((r) => { if (r) console.info('[banque]', r.message) })

// Nouvelle version déployée pendant que l'app était ouverte : un écran chargé à la
// demande (Finances, Entraînement…) peut ne plus exister sur le serveur. On recharge
// une fois, et la nouvelle version prend le relais (mise à jour automatique).
window.addEventListener('vite:preloadError', (e) => {
  try {
    if (sessionStorage.getItem('horizon.rechargeVersion')) return
    sessionStorage.setItem('horizon.rechargeVersion', '1')
  } catch { return }
  e.preventDefault()
  window.location.reload()
})
window.addEventListener('load', () => { setTimeout(() => { try { sessionStorage.removeItem('horizon.rechargeVersion') } catch { /* rien */ } }, 10000) })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
