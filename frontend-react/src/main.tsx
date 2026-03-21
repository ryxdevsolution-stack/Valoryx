import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'
import './styles/globals.css'

// HashRouter for Electron (file:// protocol), BrowserRouter for web
const isElectron = !!(window as any).electronAPI?.isElectron

// Register service worker for PWA (web only, not Electron build)
if (import.meta.env.VITE_ELECTRON !== 'true' && !isElectron && 'serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      immediate: true,
      onRegisteredSW(swUrl, registration) {
        // Check for updates every 60 minutes
        if (registration) {
          setInterval(() => { registration.update() }, 60 * 60 * 1000)
        }
      },
      onOfflineReady() {
        console.log('[PWA] App ready for offline use')
      },
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  isElectron ? (
    <HashRouter>
      <App />
    </HashRouter>
  ) : (
    <BrowserRouter basename="/">
      <App />
    </BrowserRouter>
  ),
)
