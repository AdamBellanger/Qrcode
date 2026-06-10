import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import BurgerMenu from './components/BurgerMenu.tsx'
import './index.css'
import './burger-menu.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <BurgerMenu />
  </StrictMode>,
)
