// Sign-in for the internal dashboard. Supabase emails a one-time link. It returns here with a short-lived token and
// a renewal token in the address. Both are kept in this browser, so one email keeps you signed in for up to 30 days.
// The admin function checks the token and the admin email on every request, so nothing here decides who is allowed in.

const KEY = 'vpt-admin-session'

// How long one email link keeps this browser signed in. After that a new link is needed.
export const MAX_SESSION_MS = 30 * 24 * 60 * 60 * 1000
// A token this close to its end is renewed before use.
const RENEW_MARGIN_MS = 60_000

export interface Session {
  token: string
  // When the access token stops working. It lasts about an hour.
  expiresAt: number
  // Trades for a new access token without another email. Supabase replaces it on each use.
  refreshToken?: string
  // When the email link was used. The 30 day limit counts from here and is not extended by renewals.
  startedAt?: number
}

const supabaseUrl = () => import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = () => import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...session, startedAt: session.startedAt ?? Date.now() }))
  } catch {
    // Storage can be blocked. The link then works for this page load only.
  }
}

// The saved sign-in, unless it is past the 30 day limit or can no longer be renewed. The access token may be
// out of date. Use isFresh to check, and renewSession to refresh it.
export function loadSession(now = Date.now()): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    if (typeof s.token !== 'string' || typeof s.expiresAt !== 'number') return null
    if (typeof s.startedAt === 'number' && now - s.startedAt > MAX_SESSION_MS) return null
    if (!isFresh(s, now) && !s.refreshToken) return null
    return s
  } catch {
    return null
  }
}

export const isFresh = (s: Session, now = Date.now()): boolean => s.expiresAt - RENEW_MARGIN_MS > now

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}

// Reads what the email link left in the address, such as #access_token=...&refresh_token=...&expires_in=3600,
// or an error.
export function parseHash(hash: string, now = Date.now()): { session?: Session; error?: string } {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const token = params.get('access_token')
  if (token) {
    const seconds = Number(params.get('expires_in')) || 3600
    const refreshToken = params.get('refresh_token') ?? undefined
    return { session: { token, expiresAt: now + seconds * 1000, refreshToken, startedAt: now } }
  }
  const error = params.get('error_description') ?? params.get('error')
  return error ? { error } : {}
}

let renewing: Promise<Session | null> | null = null

// Trades the refresh token for a new access token and saves it. Calls made together share one request, because
// Supabase gives out a new refresh token each time and the old one soon stops working. Returns null when the
// sign-in cannot be renewed, and removes it.
export function renewSession(session: Session): Promise<Session | null> {
  if (!session.refreshToken) return Promise.resolve(null)
  renewing ??= doRenew(session).finally(() => {
    renewing = null
  })
  return renewing
}

async function doRenew(session: Session): Promise<Session | null> {
  const base = supabaseUrl()
  if (!base) return null
  try {
    const res = await fetch(`${base}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey() ?? '' },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    })
    if (!res.ok) {
      // A server error is not a verdict on the sign-in, so it is kept for another try.
      if (res.status >= 400 && res.status < 500) clearSession()
      return null
    }
    const body = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number }
    if (!body.access_token) return null
    const next: Session = {
      token: body.access_token,
      expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000,
      refreshToken: body.refresh_token ?? session.refreshToken,
      startedAt: session.startedAt,
    }
    saveSession(next)
    return next
  } catch {
    return null
  }
}

// Ends the sign-in on the server too, so a copy of the renewal token stops working.
export async function revokeSession(session: Session): Promise<void> {
  const base = supabaseUrl()
  if (!base) return
  try {
    await fetch(`${base}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: anonKey() ?? '', Authorization: `Bearer ${session.token}` },
    })
  } catch {
    // The local sign-in is already gone.
  }
}

// Always reports success for a refused address, so the page never says which emails are allowed. 'limited' means
// Supabase's email rate limit, which the built-in email service sets at a few messages an hour.
export async function requestLink(email: string): Promise<'sent' | 'limited' | 'error'> {
  const base = supabaseUrl()
  if (!base) return 'error'
  const redirect = encodeURIComponent(`${window.location.origin}/admin`)
  try {
    const res = await fetch(`${base}/auth/v1/otp?redirect_to=${redirect}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey() ?? '' },
      body: JSON.stringify({ email: email.trim(), create_user: false }),
    })
    if (res.status === 429) return 'limited'
    return res.ok || (res.status >= 400 && res.status < 500) ? 'sent' : 'error'
  } catch {
    return 'error'
  }
}
