import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { startTheme } from './app/themeService'
import './ui/styles/tokens.css'
import './ui/styles/global.css'

// The cached theme is already on the document; this reconciles it with the
// stored setting and follows the system while the choice is System.
startTheme()

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element #root was not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
