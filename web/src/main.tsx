import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

if (window.location.pathname === '/methodology') {
  window.location.replace('/methodology/')
} else {
  createRoot(document.getElementById('root')!).render(<App />)
}
