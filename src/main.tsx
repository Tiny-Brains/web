import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/layout.css'
import './styles/pages.css'
import App from './App.tsx'
import { initTheme } from './lib/theme.ts'

// Before the first paint, so a reader who chose light does not get a dark flash.
initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
