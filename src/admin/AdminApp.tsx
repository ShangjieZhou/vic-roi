import { useCallback, useEffect, useState } from 'react'
import { clearSession, loadSession, parseHash, requestLink, saveSession, type Session } from './auth'
import { Overview } from './Overview'
import { Simulator } from './Simulator'
import { Submissions } from './Submissions'
import { BTN, CARD, TITLE } from './ui'

type Page = 'overview' | 'submissions' | 'simulator'

const PAGES: { page: Page; path: string; label: string }[] = [
  { page: 'overview', path: '/admin', label: 'Overview' },
  { page: 'submissions', path: '/admin/submissions', label: 'Submissions' },
  { page: 'simulator', path: '/admin/simulator', label: 'Ranking simulator' },
]

export function pageFor(pathname: string): Page {
  const clean = pathname.replace(/\/+$/, '')
  return PAGES.find((p) => p.path === clean)?.page ?? 'overview'
}

// Search engines are told to skip these pages. The address itself is also not linked from anywhere.
function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    document.title = 'VPT admin'
    return () => meta.remove()
  }, [])
}

export function AdminApp() {
  useNoIndex()
  const [session, setSession] = useState<Session | null>(null)
  const [checked, setChecked] = useState(false)
  const [notice, setNotice] = useState<string | undefined>()
  const [page, setPage] = useState<Page>(() => pageFor(window.location.pathname))
  // A page stays mounted once opened, so filters and results survive a switch between pages.
  const [opened, setOpened] = useState<Page[]>(() => [pageFor(window.location.pathname)])

  useEffect(() => {
    const fromLink = parseHash(window.location.hash)
    if (fromLink.session || fromLink.error) window.history.replaceState(null, '', window.location.pathname)
    if (fromLink.session) saveSession(fromLink.session)
    setSession(fromLink.session ?? loadSession())
    if (fromLink.error) setNotice('That link is invalid or has expired. Request a new one.')
    setChecked(true)
  }, [])

  useEffect(() => {
    const onPop = () => show(pageFor(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const show = (next: Page) => {
    setPage(next)
    setOpened((o) => (o.includes(next) ? o : [...o, next]))
  }
  const go = (next: Page) => {
    const path = PAGES.find((p) => p.page === next)!.path
    if (window.location.pathname !== path) window.history.pushState(null, '', path)
    show(next)
  }

  const expired = useCallback(() => {
    clearSession()
    setSession(null)
    setOpened([])
    setNotice('Your sign-in expired. Request a new link.')
  }, [])
  const signOut = () => {
    clearSession()
    setSession(null)
    setOpened([])
    setNotice(undefined)
  }
  // Signing in again brings the current page back.
  useEffect(() => {
    if (session && opened.length === 0) setOpened([page])
  }, [session, opened, page])

  return (
    <div className="min-h-dvh bg-stone-100 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <h1 className="text-base font-semibold tracking-tight">VPT admin</h1>
          {session && (
            <>
              <nav aria-label="Admin pages" className="order-last flex w-full gap-1 sm:order-none sm:w-auto">
                {PAGES.map((p) => (
                  <a
                    key={p.page}
                    href={p.path}
                    aria-current={page === p.page ? 'page' : undefined}
                    onClick={(e) => {
                      e.preventDefault()
                      go(p.page)
                    }}
                    className={`min-h-10 rounded-lg px-3 py-2 text-sm font-medium ${page === p.page ? 'bg-accent text-white' : 'text-stone-700 hover:bg-stone-100'}`}
                  >
                    {p.label}
                  </a>
                ))}
              </nav>
              <button className={BTN} onClick={signOut}>
                Sign out
              </button>
            </>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {checked && !session && <SignIn notice={notice} />}
        {session && (
          <>
            {opened.includes('overview') && (
              <div hidden={page !== 'overview'}>
                <Overview token={session.token} onExpired={expired} />
              </div>
            )}
            {opened.includes('submissions') && (
              <div hidden={page !== 'submissions'}>
                <Submissions token={session.token} onExpired={expired} />
              </div>
            )}
            {opened.includes('simulator') && (
              <div hidden={page !== 'simulator'}>
                <Simulator token={session.token} onExpired={expired} />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function SignIn({ notice }: { notice?: string }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle')
  const submit = async () => {
    if (!email.trim() || state === 'busy') return
    setState('busy')
    setState(await requestLink(email))
  }
  return (
    <form
      className={`${CARD} mx-auto max-w-md`}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <h2 className={TITLE}>Sign in</h2>
      <p className="mt-1 text-sm text-stone-600">Enter your email and Supabase sends you a one-time sign-in link.</p>
      {notice && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{notice}</p>}
      <label htmlFor="admin-email" className="sr-only">
        Email
      </label>
      <input
        id="admin-email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="mt-4 w-full rounded-xl border border-stone-300 px-3 py-3 text-base focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
      />
      <button
        type="submit"
        disabled={!email.trim() || state === 'busy'}
        className="mt-3 min-h-12 w-full rounded-xl bg-accent px-5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {state === 'busy' ? 'Sending...' : 'Email me a link'}
      </button>
      {state === 'sent' && (
        <p role="status" className="mt-3 text-sm text-stone-600">
          If that address has access, a link is on its way. Open it in this browser.
        </p>
      )}
      {state === 'error' && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          Could not send a link right now. Try again in a few minutes.
        </p>
      )}
    </form>
  )
}

