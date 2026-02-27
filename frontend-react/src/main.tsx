import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'
import './styles/globals.css'

// HashRouter for Electron (file:// protocol), BrowserRouter for web
const isElectron = !!(window as any).electronAPI?.isElectron

ReactDOM.createRoot(document.getElementById('root')!).render(
  isElectron ? (
    <HashRouter>
      <App />
    </HashRouter>
  ) : (
    <BrowserRouter basename="/frontend">
      <App />
    </BrowserRouter>
  ),
)
