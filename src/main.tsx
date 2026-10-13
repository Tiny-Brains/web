import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/base.css'
import './styles/shell.css'
import './styles/components.css'
import './styles/pages.css'
import App from './App.tsx'
import { initTheme } from './lib/theme.ts'
import { initLanguage } from './lib/lang.ts'

// Before the first paint, so a reader who chose light does not get a dark flash -- and the
// reader's language, with the shell's words in it, so nothing is painted in English and redrawn.
initTheme()
await initLanguage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
