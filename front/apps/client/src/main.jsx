import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AppProvider } from './context/AppContext.jsx'
import '@fontsource/poppins/latin-400.css'
import '@fontsource/poppins/latin-500.css'
import '@fontsource/poppins/latin-600.css'
import '@fontsource/poppins/latin-700.css'
import './index.css'
import './theme.css'
import './map.css'
import { initNative } from './lib/native'
import { resumeLastSpace } from './lib/roles'

// Appli mobile : un livreur ou un restaurant deja connecte retourne directement dans son espace
if (!resumeLastSpace()) ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>,
)

initNative()
