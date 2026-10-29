import React from 'react'
import axios from 'axios'
import { sessionManager } from './Auth/sessionManager.js'
import { installAuthenticatedFetch, installAuthenticatedAxios } from './Auth/authTransport.js'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Las peticiones protegidas usan siempre el JWT vigente, incluso tras 401 por caducidad.
installAuthenticatedFetch(window, sessionManager, import.meta.env.VITE_API_BASE_URL || '');
installAuthenticatedAxios(axios, sessionManager, import.meta.env.VITE_API_BASE_URL || '', window.location.href);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>

    <App />

  </React.StrictMode>,
)

