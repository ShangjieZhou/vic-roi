// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadStats } from './types'

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('loadStats', () => {
  it('sends the sign-in token to the admin function', async () => {
    fetchMock.mockResolvedValue(new Response('{"totals":{"n":1}}', { status: 200 }))
    const out = await loadStats('tok')
    expect(out.status).toBe('ok')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://example.supabase.co/functions/v1/admin')
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(init.headers.apikey).toBe('anon-key')
  })
  it.each([
    [401, 'signed_out'],
    [403, 'forbidden'],
    [503, 'unconfigured'],
    [500, 'error'],
  ])('maps %i to %s', async (code, status) => {
    fetchMock.mockResolvedValue(new Response('{}', { status: code }))
    expect((await loadStats('t')).status).toBe(status)
  })
  it('reports a network failure', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    expect((await loadStats('t')).status).toBe('error')
  })
})
