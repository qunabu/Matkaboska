import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// Capture the install prompt as early as possible — it can fire before React
// mounts, so we stash it on window and re-dispatch for the app to pick up.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  ;(window as unknown as { __installPrompt?: Event }).__installPrompt = e
  window.dispatchEvent(new Event('installpromptready'))
})

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
