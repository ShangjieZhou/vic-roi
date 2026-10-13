import { afterEach, describe, expect, it, vi } from 'vitest'
import { COFFEE_URL, feedbackUrl, turnstileSiteKey } from './config'

afterEach(() => vi.unstubAllEnvs())

describe('turnstileSiteKey', () => {
  it('is null when no key is set, so the bot check stays off', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '')
    expect(turnstileSiteKey()).toBeNull()
  })

  it('is null for a blank value', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '   ')
    expect(turnstileSiteKey()).toBeNull()
  })

  it('returns the key, trimmed', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '  0x4AAAAAAA-example  ')
    expect(turnstileSiteKey()).toBe('0x4AAAAAAA-example')
  })

  it('is read when called, not when the module loads', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '')
    expect(turnstileSiteKey()).toBeNull()
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'now-set')
    expect(turnstileSiteKey()).toBe('now-set')
  })
})

describe('feedbackUrl', () => {
  it('is null until a form link is set, so the button stays hidden', () => {
    vi.stubEnv('VITE_FEEDBACK_URL', '')
    expect(feedbackUrl()).toBeNull()
  })

  it('returns the link, trimmed', () => {
    vi.stubEnv('VITE_FEEDBACK_URL', '  https://forms.gle/example  ')
    expect(feedbackUrl()).toBe('https://forms.gle/example')
  })
})

describe('COFFEE_URL', () => {
  it('points at the Buy Me a Coffee page', () => {
    expect(COFFEE_URL).toBe('https://buymeacoffee.com/shangjie')
  })
})
