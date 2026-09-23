import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { PlayerApp } from './PlayerApp'
import './styles.css'

// /?play es la entrada de los jugadores; sin eso es la vista del DM (sólo desde la PC del servidor).
const isPlayer = new URLSearchParams(location.search).has('play')

createRoot(document.getElementById('root')!).render(<StrictMode>{isPlayer ? <PlayerApp /> : <App />}</StrictMode>)
