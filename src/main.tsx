import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { InstallButton } from './pwa/InstallButton'
import './styles.css'
import './parts.css'
import './reader.css'
import './mobile.css'
import './install.css'

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error) => {
      console.warn('Service worker registration failed', error)
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <InstallButton />
    <App />
  </StrictMode>,
)
