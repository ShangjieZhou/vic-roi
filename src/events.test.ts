// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trackSupport } from './events'

const fetchMock = vi.fn()

beforeEach(() => {
  localStorage.clear()
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('trackSupport', () => {
  it('posts the event with the device id to the events function', () => {
    trackSupport('coffee_minimized')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://example.supabase.co/functions/v1/events')
    expect(init.method).toBe('POST')
    expect(init.keepalive).toBe(true)
    const body = JSON.parse(init.body)
    expect(body.event).toBe('coffee_minimized')
    expect(body.deviceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('sends the public key the functions gateway expects', () => {
    trackSupport('coffee_seen')
    const headers = fetchMock.mock.calls[0][1].headers
    expect(headers.apikey).toBe('anon-key')
    expect(headers.Authorization).toBe('Bearer anon-key')
  })

  it('uses the same device id every time', () => {
    trackSupport('coffee_seen')
    trackSupport('coffee_clicked')
    const ids = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).deviceId)
    expect(ids[0]).toBe(ids[1])
  })

  it('does nothing when no backend is configured', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    trackSupport('coffee_seen')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ignores a failed request', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    expect(() => trackSupport('coffee_seen')).not.toThrow()
    await Promise.resolve()
  })

  it('ignores fetch throwing straight away', () => {
    fetchMock.mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => trackSupport('coffee_seen')).not.toThrow()
  })
})
