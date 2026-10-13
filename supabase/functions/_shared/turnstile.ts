// Server-side check of a Cloudflare Turnstile token.
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
//
// The visitor's IP address is deliberately not sent to Cloudflare, so this adds no IP handling of our own.
// Any failure, including Cloudflare being unreachable, counts as not verified: the check fails closed.

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export async function verifyTurnstile(
  token: unknown,
  secret: string,
  doFetch: typeof fetch = fetch,
): Promise<boolean> {
  // Tokens are at most 2048 characters. Anything else is not worth sending to Cloudflare.
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return false
  try {
    const res = await doFetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return false
    const data: unknown = await res.json()
    return typeof data === 'object' && data !== null && (data as { success?: unknown }).success === true
  } catch {
    return false
  }
}
