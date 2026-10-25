import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { finishBankAuthFromUrl } from './lib/bankConnections'

// Retour d'autorisation bancaire (Enable Banking) : enregistre la connexion, sans rien afficher de plus.
void finishBankAuthFromUrl().then((r) => { if (r) console.info('[banque]', r.message) })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
