// The Cloudflare Turnstile site key. It is public by design. The bot check is only used when it is set, and the
// server only enforces it once its matching secret is set, so both sides are switched on together.
// Read at call time so tests can change it.
export function turnstileSiteKey(): string | null {
  const key = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
  return key && key.trim() !== '' ? key.trim() : null
}

// Where tips go. It is a public page, so it lives in the code.
export const COFFEE_URL = 'https://buymeacoffee.com/shangjie'
