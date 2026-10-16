// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminApp } from './AdminApp'
import { MAX_SESSION_MS, clearSession, isFresh, loadSession, parseHash, renewSession, requestLink, revokeSession, saveSession } from './auth'
import { labelFor, orderRows, percent } from './labels'
import * as types from './types'
import type { AdminStats } from './types'

vi.mock('./types', async (original) => ({
  ...(await original<typeof import('./types')>()),
  loadStats: vi.fn(),
  loadTimeline: vi.fn(),
  loadSubmissions: vi.fn(),
  simulateRanking: vi.fn(),
}))

const stats: AdminStats = {
  generatedAt: '2026-10-16T01:00:00Z',
  totals: { n: 200, last24h: 20, last7d: 150, first: '2026-10-13T00:00:00Z', last: '2026-10-16T00:00:00Z', withCode: 150 },
  daily: [],
  score: { min: 250, max: 800, mean: 600, sd: 90, p10: 480, p25: 545, median: 615, p75: 666, p90: 707 },
  hist: Array.from({ length: 96 }, (_, i) => (i >= 50 && i <= 70 ? 10 : 0)),
  cuts: {
    english: [{ k: 'superior', n: 120, median: 650, avg: 640 }, { k: 'competent', n: 20, median: 500, avg: 510 }, { k: 'proficient', n: 60, median: 600, avg: 590 }],
    location: [{ k: 'onshore', n: 150, median: 620, avg: 610 }],
  },
  sections: { english: { max: 200, avg: 154.5, median: 200, atMax: 120, n: 200, dist: [{ points: 0, n: 20 }, { points: 200, n: 120 }] } },
  gap: [{ key: 'english', top: 197.1, rest: 140.1, max: 200 }],
  occupations: [{ code: '261313', name: 'Software Engineer', n: 30, median: 640 }],
  occupationGroups: [{ group: '2', n: 120, median: 625 }],
  feedback: { count: 1, items: [{ at: '2026-10-15T23:00:00Z', lang: 'zh', message: '很好用' }] },
  support: [{ event: 'coffee_seen', devices: 100, times: 120 }, { event: 'coffee_clicked', devices: 5, times: 6 }],
}

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/admin')
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
  vi.mocked(types.loadStats).mockReset()
  vi.mocked(types.loadTimeline).mockReset().mockResolvedValue({ status: 'ok', data: { range: '24h', bucket: 3600, total: 14, series: [{ t: '2026-10-16T09:00', n: 6 }, { t: '2026-10-16T10:00', n: 8 }] } })
  vi.mocked(types.loadSubmissions).mockReset().mockResolvedValue({ status: 'ok', data: { total: 0, rows: [] } })
  vi.mocked(types.simulateRanking).mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('parseHash', () => {
  it('reads the token and its lifetime from the email link', () => {
    const { session } = parseHash('#access_token=abc&expires_in=600&type=magiclink', 1000)
    expect(session).toMatchObject({ token: 'abc', expiresAt: 1000 + 600_000 })
  })
  it('reports an expired link', () => {
    expect(parseHash('#error=access_denied&error_description=Email+link+is+invalid+or+has+expired').error).toContain('expired')
  })
  it('finds nothing in an empty address', () => {
    expect(parseHash('')).toEqual({})
  })
})

describe('session', () => {
  it('keeps the access token and the renewal token from the email link', () => {
    const { session } = parseHash('#access_token=abc&refresh_token=ref&expires_in=600', 1000)
    expect(session).toEqual({ token: 'abc', expiresAt: 601_000, refreshToken: 'ref', startedAt: 1000 })
  })
  it('survives a restart of the browser', () => {
    saveSession({ token: 't', expiresAt: Date.now() + 600_000, refreshToken: 'r' })
    expect(localStorage.getItem('vpt-admin-session')).toContain('"token":"t"')
    expect(loadSession()?.token).toBe('t')
  })
  it('is dropped when it has expired and cannot be renewed', () => {
    saveSession({ token: 't', expiresAt: 5000 })
    expect(loadSession(10_000)).toBeNull()
  })
  it('is kept when expired but renewable', () => {
    saveSession({ token: 't', expiresAt: 5000, refreshToken: 'r' })
    expect(loadSession(10_000)?.refreshToken).toBe('r')
    expect(isFresh({ token: 't', expiresAt: 5000 }, 10_000)).toBe(false)
  })
  it('treats a token about to end as out of date', () => {
    expect(isFresh({ token: 't', expiresAt: 100_000 }, 50_000)).toBe(false)
    expect(isFresh({ token: 't', expiresAt: 200_000 }, 50_000)).toBe(true)
  })
  it('ends 30 days after the email link, however often it was renewed', () => {
    const start = 1_000_000
    saveSession({ token: 't', expiresAt: start + MAX_SESSION_MS + 1e9, refreshToken: 'r', startedAt: start })
    expect(loadSession(start + MAX_SESSION_MS - 1)).not.toBeNull()
    expect(loadSession(start + MAX_SESSION_MS + 1)).toBeNull()
  })
  it('is gone after signing out', () => {
    saveSession({ token: 't', expiresAt: Date.now() + 10_000 })
    clearSession()
    expect(loadSession()).toBeNull()
  })
})

describe('renewSession', () => {
  const startedAt = Date.now() - 1000
  const old = { token: 'old', expiresAt: 1, refreshToken: 'ref1', startedAt }
  const reply = (status: number, body: unknown = {}) => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('trades the renewal token for a new pair and keeps the original start time', async () => {
    const fetchMock = reply(200, { access_token: 'new', refresh_token: 'ref2', expires_in: 3600 })
    const next = await renewSession(old)
    expect(next).toMatchObject({ token: 'new', refreshToken: 'ref2', startedAt })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://example.supabase.co/auth/v1/token?grant_type=refresh_token')
    expect(JSON.parse(init.body)).toEqual({ refresh_token: 'ref1' })
    expect(loadSession()?.refreshToken).toBe('ref2')
  })

  it('sends one request for renewals made together', async () => {
    const fetchMock = reply(200, { access_token: 'new', refresh_token: 'ref2', expires_in: 3600 })
    const [a, b] = await Promise.all([renewSession(old), renewSession(old)])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
  })

  it('removes the sign-in when Supabase refuses the renewal token', async () => {
    saveSession(old)
    reply(400, { error: 'invalid_grant' })
    expect(await renewSession(old)).toBeNull()
    expect(localStorage.getItem('vpt-admin-session')).toBeNull()
  })

  it('keeps the sign-in through a server error or a network failure', async () => {
    saveSession(old)
    reply(500)
    expect(await renewSession(old)).toBeNull()
    expect(localStorage.getItem('vpt-admin-session')).not.toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await renewSession(old)).toBeNull()
  })

  it('has nothing to renew without a renewal token', async () => {
    const fetchMock = reply(200)
    expect(await renewSession({ token: 't', expiresAt: 1 })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ends the session on the server when signing out', async () => {
    const fetchMock = reply(204)
    await revokeSession({ token: 'tok', expiresAt: 1, refreshToken: 'r' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://example.supabase.co/auth/v1/logout')
    expect(init.headers.Authorization).toBe('Bearer tok')
  })
})

describe('requestLink', () => {
  const stub = (status: number) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }
  it('asks for a link that cannot create an account, returning to /admin', async () => {
    const fetchMock = stub(200)
    expect(await requestLink(' me@example.com ')).toBe('sent')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('https://example.supabase.co/auth/v1/otp?redirect_to=')
    expect(decodeURIComponent(url)).toContain(`${window.location.origin}/admin`)
    expect(JSON.parse(init.body)).toEqual({ email: 'me@example.com', create_user: false })
  })
  it('reports a refused address the same as a sent one', async () => {
    stub(422)
    expect(await requestLink('other@example.com')).toBe('sent')
  })
  it('reports the email rate limit on its own', async () => {
    stub(429)
    expect(await requestLink('a@b.co')).toBe('limited')
  })
  it('reports server errors and network failures', async () => {
    stub(500)
    expect(await requestLink('a@b.co')).toBe('error')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await requestLink('a@b.co')).toBe('error')
  })
})

describe('labels', () => {
  it('orders answers naturally and puts unknown values last', () => {
    const rows = [{ k: 'superior', n: 1, median: 1, avg: 1 }, { k: 'odd', n: 1, median: 1, avg: 1 }, { k: 'competent', n: 1, median: 1, avg: 1 }]
    expect(orderRows('english', rows).map((r) => r.k)).toEqual(['competent', 'superior', 'odd'])
  })
  it('names the experience bands like the form', () => {
    expect(labelFor('experience', '2')).toBe('2 to 3 years')
    expect(labelFor('experience', '9')).toBe('More than 8 years')
    expect(labelFor('age', '25-32')).toBe('25-32')
  })
  it('formats shares', () => {
    expect(percent(1, 4)).toBe('25.0%')
    expect(percent(1, 0)).toBe('0%')
  })
})

describe('submissions over time', () => {
  const open = async () => {
    saveSession({ token: 'tok', expiresAt: Date.now() + 600_000 })
    vi.mocked(types.loadStats).mockResolvedValue({ status: 'ok', stats })
    render(<AdminApp />)
    await screen.findByText('Submissions over time')
  }

  it('starts on the last 24 hours, one bar per hour', async () => {
    await open()
    expect(types.loadTimeline).toHaveBeenCalledWith('tok', '24h')
    expect(screen.getByText('One bar per hour, Melbourne time')).toBeTruthy()
    expect(await screen.findByText('14')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Last 24 hours' }).getAttribute('aria-pressed')).toBe('true')
  })

  it.each([
    ['Last hour', '1h', 'One bar per minute'],
    ['Last 7 days', '7d', 'One bar per 4 hours'],
    ['Last 30 days', '30d', 'One bar per day'],
  ])('switches to %s', async (label, range, note) => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: label }))
    await waitFor(() => expect(types.loadTimeline).toHaveBeenLastCalledWith('tok', range))
    expect(screen.getByText(`${note}, Melbourne time`)).toBeTruthy()
    expect(screen.getByRole('button', { name: label }).getAttribute('aria-pressed')).toBe('true')
  })

  it('says when a range could not load', async () => {
    vi.mocked(types.loadTimeline).mockResolvedValue({ status: 'error' })
    await open()
    expect(await screen.findByText(/Could not load this range/)).toBeTruthy()
  })
})

describe('AdminApp', () => {
  it('asks for an email when not signed in, and tells search engines to skip it', () => {
    render(<AdminApp />)
    expect(screen.getByRole('button', { name: 'Email me a link' })).toBeTruthy()
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex')
    expect(types.loadStats).not.toHaveBeenCalled()
  })

  it('shows the numbers once signed in, and removes the token from the address', async () => {
    window.history.replaceState(null, '', '/admin#access_token=tok&expires_in=3600')
    vi.mocked(types.loadStats).mockResolvedValue({ status: 'ok', stats })
    render(<AdminApp />)
    expect(await screen.findByText('Score distribution')).toBeTruthy()
    expect(types.loadStats).toHaveBeenCalledWith('tok')
    expect(window.location.hash).toBe('')
    expect(screen.getByText('Software Engineer')).toBeTruthy()
    expect(screen.getByText('很好用')).toBeTruthy()
    expect(screen.getByText('Professionals')).toBeTruthy()
    expect(screen.getByText('5 (5.0%)')).toBeTruthy()
    expect(screen.getByText('Submissions over time')).toBeTruthy()
  })

  it('keeps showing the data after a reload in the same tab', async () => {
    saveSession({ token: 'kept', expiresAt: Date.now() + 600_000 })
    vi.mocked(types.loadStats).mockResolvedValue({ status: 'ok', stats })
    render(<AdminApp />)
    await screen.findByText('Score distribution')
    expect(types.loadStats).toHaveBeenCalledWith('kept')
  })

  it('renews an out-of-date token before asking for data', async () => {
    saveSession({ token: 'stale', expiresAt: Date.now() - 1000, refreshToken: 'ref' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'fresh', refresh_token: 'ref2', expires_in: 3600 }), { status: 200 })))
    vi.mocked(types.loadStats).mockResolvedValue({ status: 'ok', stats })
    render(<AdminApp />)
    await screen.findByText('Score distribution')
    expect(types.loadStats).toHaveBeenCalledTimes(1)
    expect(types.loadStats).toHaveBeenCalledWith('fresh')
  })

  it('renews quietly when the server rejects the token, then loads again', async () => {
    saveSession({ token: 'old', expiresAt: Date.now() + 600_000, refreshToken: 'ref' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'fresh', refresh_token: 'ref2', expires_in: 3600 }), { status: 200 })))
    vi.mocked(types.loadStats).mockImplementation(async (token) => (token === 'old' ? { status: 'signed_out' } : { status: 'ok', stats }))
    render(<AdminApp />)
    await screen.findByText('Score distribution')
    expect(types.loadStats).toHaveBeenLastCalledWith('fresh')
    expect(screen.queryByText(/sign-in expired/)).toBeNull()
  })

  it('asks for a new link when the renewal fails', async () => {
    saveSession({ token: 'old', expiresAt: Date.now() + 600_000, refreshToken: 'ref' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 400 })))
    vi.mocked(types.loadStats).mockResolvedValue({ status: 'signed_out' })
    render(<AdminApp />)
    expect(await screen.findByText(/sign-in expired/)).toBeTruthy()
    expect(loadSession()).toBeNull()
  })

  it('does not loop when a freshly renewed token is also rejected', async () => {
    saveSession({ token: 'old', expiresAt: Date.now() + 600_000, refreshToken: 'ref' })
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ access_token: 'fresh', refresh_token: 'ref2', expires_in: 3600 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(types.loadStats).mockResolvedValue({ status: 'signed_out' })
    render(<AdminApp />)
    expect(await screen.findByText(/sign-in expired/)).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refuses a signed-in account that is not the admin', async () => {
    saveSession({ token: 'x', expiresAt: Date.now() + 600_000 })
    vi.mocked(types.loadStats).mockResolvedValue({ status: 'forbidden' })
    render(<AdminApp />)
    expect((await screen.findByRole('alert')).textContent).toContain('does not have access')
    expect(screen.queryByText('Score distribution')).toBeNull()
  })

  it('returns to sign-in when the token has expired', async () => {
    saveSession({ token: 'x', expiresAt: Date.now() + 600_000 })
    vi.mocked(types.loadStats).mockResolvedValue({ status: 'signed_out' })
    render(<AdminApp />)
    expect(await screen.findByText(/sign-in expired/)).toBeTruthy()
    expect(loadSession()).toBeNull()
  })

  it('signs out', async () => {
    saveSession({ token: 'x', expiresAt: Date.now() + 600_000 })
    vi.mocked(types.loadStats).mockResolvedValue({ status: 'ok', stats })
    render(<AdminApp />)
    await screen.findByText('Score distribution')
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(screen.getByRole('button', { name: 'Email me a link' })).toBeTruthy()
    expect(fetchMock.mock.calls[0][0]).toContain('/auth/v1/logout')
    expect(loadSession()).toBeNull()
    await waitFor(() => expect(screen.queryByText('Score distribution')).toBeNull())
  })
})
