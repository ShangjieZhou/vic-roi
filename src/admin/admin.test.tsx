// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminApp } from './AdminApp'
import { clearSession, loadSession, parseHash, requestLink, saveSession } from './auth'
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
  sessionStorage.clear()
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
    expect(session).toEqual({ token: 'abc', expiresAt: 1000 + 600_000 })
  })
  it('reports an expired link', () => {
    expect(parseHash('#error=access_denied&error_description=Email+link+is+invalid+or+has+expired').error).toContain('expired')
  })
  it('finds nothing in an empty address', () => {
    expect(parseHash('')).toEqual({})
  })
})

describe('session', () => {
  it('survives a reload of the same tab until it expires', () => {
    saveSession({ token: 't', expiresAt: 5000 })
    expect(loadSession(4000)?.token).toBe('t')
    expect(loadSession(5000)).toBeNull()
  })
  it('is gone after signing out', () => {
    saveSession({ token: 't', expiresAt: Date.now() + 10_000 })
    clearSession()
    expect(loadSession()).toBeNull()
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
  it('reports rate limits, server errors and network failures', async () => {
    stub(429)
    expect(await requestLink('a@b.co')).toBe('error')
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
    saveSession({ token: 'tok', expiresAt: Date.now() + 60_000 })
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
    saveSession({ token: 'kept', expiresAt: Date.now() + 60_000 })
    vi.mocked(types.loadStats).mockResolvedValue({ status: 'ok', stats })
    render(<AdminApp />)
    await screen.findByText('Score distribution')
    expect(types.loadStats).toHaveBeenCalledWith('kept')
  })

  it('refuses a signed-in account that is not the admin', async () => {
    saveSession({ token: 'x', expiresAt: Date.now() + 60_000 })
    vi.mocked(types.loadStats).mockResolvedValue({ status: 'forbidden' })
    render(<AdminApp />)
    expect((await screen.findByRole('alert')).textContent).toContain('does not have access')
    expect(screen.queryByText('Score distribution')).toBeNull()
  })

  it('returns to sign-in when the token has expired', async () => {
    saveSession({ token: 'x', expiresAt: Date.now() + 60_000 })
    vi.mocked(types.loadStats).mockResolvedValue({ status: 'signed_out' })
    render(<AdminApp />)
    expect(await screen.findByText(/sign-in expired/)).toBeTruthy()
    expect(loadSession()).toBeNull()
  })

  it('signs out', async () => {
    saveSession({ token: 'x', expiresAt: Date.now() + 60_000 })
    vi.mocked(types.loadStats).mockResolvedValue({ status: 'ok', stats })
    render(<AdminApp />)
    await screen.findByText('Score distribution')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(screen.getByRole('button', { name: 'Email me a link' })).toBeTruthy()
    expect(loadSession()).toBeNull()
    await waitFor(() => expect(screen.queryByText('Score distribution')).toBeNull())
  })
})
