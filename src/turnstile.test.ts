import { describe, expect, it, vi } from 'vitest'
import { verifyTurnstile } from '../supabase/functions/_shared/turnstile'

const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }))

describe('verifyTurnstile', () => {
  it('accepts a token Cloudflare confirms', async () => {
    expect(await verifyTurnstile('good-token', 'secret', reply({ success: true }))).toBe(true)
  })

  it('rejects a token Cloudflare refuses', async () => {
    expect(await verifyTurnstile('bad-token', 'secret', reply({ success: false, 'error-codes': ['invalid-input-response'] }))).toBe(false)
  })

  it('sends the secret and the token as a form, and nothing about the visitor', async () => {
    const doFetch = reply({ success: true })
    await verifyTurnstile('tok', 'sekret', doFetch)
    const [url, init] = doFetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    expect(init.method).toBe('POST')
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({ secret: 'sekret', response: 'tok' })
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded')
  })

  it.each([undefined, null, '', 42, {}, 'x'.repeat(2049)])('rejects a missing or malformed token without calling Cloudflare (%s)', async (token) => {
    const doFetch = reply({ success: true })
    expect(await verifyTurnstile(token, 'secret', doFetch)).toBe(false)
    expect(doFetch).not.toHaveBeenCalled()
  })

  it('fails closed when Cloudflare is unreachable, errors or answers with nonsense', async () => {
    expect(await verifyTurnstile('t', 's', vi.fn(async () => { throw new Error('offline') }))).toBe(false)
    expect(await verifyTurnstile('t', 's', reply({ success: true }, 500))).toBe(false)
    expect(await verifyTurnstile('t', 's', vi.fn(async () => new Response('not json')))).toBe(false)
    expect(await verifyTurnstile('t', 's', reply(null))).toBe(false)
    expect(await verifyTurnstile('t', 's', reply({ success: 'true' }))).toBe(false)
  })
})
