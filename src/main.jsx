import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'  // Import BrowserRouter for routing
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import './index.css'
import App from './App.jsx'
import appTheme from './theme/appTheme.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Wrap App in BrowserRouter to enable routing features like NavLink */}
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
