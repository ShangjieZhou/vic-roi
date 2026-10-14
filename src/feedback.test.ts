// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendFeedback } from './feedback'

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

describe('sendFeedback', () => {
  it('posts the trimmed message, language and device id to the feedback function', async () => {
    expect(await sendFeedback('  Nice tool ', 'zh')).toBe('ok')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://example.supabase.co/functions/v1/feedback')
    expect(init.method).toBe('POST')
    expect(init.headers.apikey).toBe('anon-key')
    const body = JSON.parse(init.body)
    expect(body.message).toBe('Nice tool')
    expect(body.lang).toBe('zh')
    expect(body.deviceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('reports the daily limit', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"rate_limited"}', { status: 429 }))
    expect(await sendFeedback('Hi', 'en')).toBe('rate_limited')
  })

  it('reports a server error and a network failure as an error', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }))
    expect(await sendFeedback('Hi', 'en')).toBe('error')
    fetchMock.mockRejectedValue(new Error('offline'))
    expect(await sendFeedback('Hi', 'en')).toBe('error')
  })

  it('reports an error when no backend is configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    expect(await sendFeedback('Hi', 'en')).toBe('error')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
