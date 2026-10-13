import { afterEach, describe, expect, it, vi } from 'vitest'
import { turnstileSiteKey } from './config'

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
