import React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import './tokens.css'
import './app.css'
import App from './App'

if (location.search.includes('bare')) document.documentElement.classList.add('bare')
if (location.search.includes('ios')) document.documentElement.classList.add('ios') // flush, frameless (for screenshot diffing)

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
