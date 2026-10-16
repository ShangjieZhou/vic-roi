// Sign-in for the internal dashboard. Supabase emails a one-time link. It returns here with a short-lived token in
// the address, which is kept for this browser tab only. The admin function checks the token on every request, so
// nothing here decides who is allowed in.

const KEY = 'vpt-admin-session'

export interface Session {
  token: string
  expiresAt: number
}

const supabaseUrl = () => import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = () => import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export function saveSession(session: Session): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // Storage can be blocked. The link then works for this page load only.
  }
}

export function loadSession(now = Date.now()): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    if (typeof s.token !== 'string' || typeof s.expiresAt !== 'number' || s.expiresAt <= now) return null
    return s
  } catch {
    return null
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}

// Reads what the email link left in the address, such as #access_token=...&expires_in=3600, or an error.
export function parseHash(hash: string, now = Date.now()): { session?: Session; error?: string } {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const token = params.get('access_token')
  if (token) {
    const seconds = Number(params.get('expires_in')) || 3600
    return { session: { token, expiresAt: now + seconds * 1000 } }
  }
  const error = params.get('error_description') ?? params.get('error')
  return error ? { error } : {}
}

// Always reports success for a refused address, so the page never says which emails are allowed.
export async function requestLink(email: string): Promise<'sent' | 'error'> {
  const base = supabaseUrl()
  if (!base) return 'error'
  const redirect = encodeURIComponent(`${window.location.origin}/admin`)
  try {
    const res = await fetch(`${base}/auth/v1/otp?redirect_to=${redirect}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey() ?? '' },
      body: JSON.stringify({ email: email.trim(), create_user: false }),
    })
    return res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429) ? 'sent' : 'error'
  } catch {
    return 'error'
  }
}
