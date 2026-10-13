import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VptInput } from '../supabase/functions/_shared/scoring'

// The device id comes from local storage, which this node test does not have.
vi.mock('./device', () => ({ getDeviceId: () => '11111111-2222-4333-8444-555555555555' }))
const DEVICE = '11111111-2222-4333-8444-555555555555'

const INPUT: VptInput = {
  location: 'onshore', age: 30, english: 'proficient', experienceYears: 4, education: 'bachelors',
  skillLevel: 1, partnerQualifies: false, annualEarnings: 0,
}
const INSIGHTS = { total: 546, location: 'onshore', overall: { n: 3 }, occupation: null }

// The endpoint is read from the environment when the module loads, so each test imports a fresh copy.
async function load(env = true) {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', env ? 'https://example.supabase.co' : '')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', env ? 'anon-key' : '')
  return import('./api')
}

const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const sentBody = () => JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)

describe('submitScore', () => {
  it('sends the occupation code for a listed occupation and no free text', async () => {
    const api = await load()
    vi.mocked(fetch).mockResolvedValue(respond(201, { id: 'abc', insights: { ...INSIGHTS, occupation: { name: 'Software engineer', code: '261313', n: 1 } } }))
    const outcome = await api.submitScore(INPUT, { kind: 'listed', code: '261313' })
    expect(sentBody()).toEqual({ input: INPUT, deviceId: DEVICE, occupationCode: '261313' })
    expect(outcome).toMatchObject({
      status: 'ok',
      submission: { id: 'abc', occupation: 'Software engineer', occupationCode: '261313' },
    })
  })

  it('sends trimmed text for an occupation that is not listed', async () => {
    const api = await load()
    vi.mocked(fetch).mockResolvedValue(respond(201, { id: 'abc', insights: { ...INSIGHTS, occupation: { name: 'Barista', code: null, n: 1 } } }))
    const outcome = await api.submitScore(INPUT, { kind: 'free', text: '  Barista ' })
    expect(sentBody()).toEqual({ input: INPUT, deviceId: DEVICE, occupation: 'Barista' })
    expect(outcome).toMatchObject({ status: 'ok', submission: { occupation: 'Barista', occupationCode: null } })
  })

  it('sends neither when no occupation was chosen', async () => {
    const api = await load()
    vi.mocked(fetch).mockResolvedValue(respond(201, { id: 'abc', insights: INSIGHTS }))
    const outcome = await api.submitScore(INPUT, null)
    expect(sentBody()).toEqual({ input: INPUT, deviceId: DEVICE })
    expect(outcome).toMatchObject({ status: 'ok', submission: { occupation: null, occupationCode: null } })
  })

  it('maps server responses to outcomes', async () => {
    const api = await load()
    vi.mocked(fetch).mockResolvedValueOnce(respond(403, { error: 'device_limit', limit: 5 }))
    expect(await api.submitScore(INPUT, null)).toEqual({ status: 'device_limit', limit: 5 })
    vi.mocked(fetch).mockResolvedValueOnce(respond(400, { error: 'invalid_occupation' }))
    expect(await api.submitScore(INPUT, { kind: 'listed', code: '000000' })).toEqual({ status: 'invalid_occupation' })
    vi.mocked(fetch).mockResolvedValueOnce(respond(500, { error: 'save_failed' }))
    expect(await api.submitScore(INPUT, null)).toEqual({ status: 'error' })
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))
    expect(await api.submitScore(INPUT, null)).toEqual({ status: 'error' })
  })

  it('treats the old per-IP 429 and any other 403 as a plain error, not as the device limit', async () => {
    const api = await load()
    vi.mocked(fetch).mockResolvedValueOnce(respond(429, { error: 'rate_limited', retryAfter: 90 }))
    expect(await api.submitScore(INPUT, null)).toEqual({ status: 'error' })
    vi.mocked(fetch).mockResolvedValueOnce(respond(403, { error: 'something_else' }))
    expect(await api.submitScore(INPUT, null)).toEqual({ status: 'error' })
  })

  it('sends the same device id on every submission', async () => {
    const api = await load()
    vi.mocked(fetch).mockResolvedValue(respond(201, { id: 'abc', insights: INSIGHTS }))
    await api.submitScore(INPUT, null)
    await api.submitScore(INPUT, null)
    const ids = vi.mocked(fetch).mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string).deviceId)
    expect(ids).toEqual([DEVICE, DEVICE])
  })

  it('reports an error without calling the network when the backend is not configured', async () => {
    const api = await load(false)
    expect(await api.submitScore(INPUT, null)).toEqual({ status: 'error' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('loadSubmission', () => {
  it('returns the input, occupation and insights', async () => {
    const api = await load()
    vi.mocked(fetch).mockResolvedValue(
      respond(200, { input: INPUT, occupation: 'Software engineer', occupationCode: '261313', insights: INSIGHTS }),
    )
    expect(await api.loadSubmission('abc')).toEqual({
      input: INPUT,
      submission: { id: 'abc', occupation: 'Software engineer', occupationCode: '261313', insights: INSIGHTS },
    })
  })

  it('treats a result saved before codes existed as having no code', async () => {
    const api = await load()
    vi.mocked(fetch).mockResolvedValue(respond(200, { input: INPUT, occupation: null, insights: INSIGHTS }))
    expect(await api.loadSubmission('abc')).toMatchObject({ submission: { occupation: null, occupationCode: null } })
  })

  it('tells a missing result apart from a failed request', async () => {
    const api = await load()
    vi.mocked(fetch).mockResolvedValueOnce(respond(404, { error: 'not_found' }))
    expect(await api.loadSubmission('abc')).toBe('not_found')
    vi.mocked(fetch).mockResolvedValueOnce(respond(500, { error: 'lookup_failed' }))
    expect(await api.loadSubmission('abc')).toBeNull()
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))
    expect(await api.loadSubmission('abc')).toBeNull()
  })
})
