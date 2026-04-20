import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'  // Import BrowserRouter for routing
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Wrap App in BrowserRouter to enable routing features like NavLink */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
