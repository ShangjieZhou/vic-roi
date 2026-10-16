import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { startAnalytics } from './analytics'
import { LangProvider } from './i18n'
import './index.css'

// The internal dashboard loads only under /admin, as its own chunk, and visits to it are not counted.
const isAdmin = /^\/admin(\/|$)/.test(window.location.pathname)
const AdminApp = lazy(() => import('./admin/AdminApp').then((m) => ({ default: m.AdminApp })))

if (!isAdmin) startAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdmin ? (
      <Suspense fallback={null}>
        <AdminApp />
      </Suspense>
    ) : (
      <LangProvider>
        <App />
      </LangProvider>
    )}
  </StrictMode>,
)
