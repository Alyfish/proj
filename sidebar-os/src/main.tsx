import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// StrictMode removed to prevent double event firing in development
createRoot(document.getElementById('root')!).render(
  <App />
)
