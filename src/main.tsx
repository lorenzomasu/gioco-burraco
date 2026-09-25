import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { registerServiceWorker } from './pwa/registerServiceWorker'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)

// Fire-and-forget: the app never waits for service-worker or cache work.
void registerServiceWorker({
  isProduction: import.meta.env.PROD,
  serviceWorker: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
})
