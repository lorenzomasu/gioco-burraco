/**
 * M39 (experimental): entrypoint of the isolated iOS spike (`ios-spike/index.html`). It is
 * reached only through the `ios-spike` Vite mode and never registers the PWA worker.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { IosSpikeApp } from './IosSpikeApp'
import './iosSpike.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><IosSpikeApp /></StrictMode>,
)
