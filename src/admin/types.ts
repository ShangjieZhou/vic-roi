export interface Row {
  k: string
  n: number
  median: number
  avg: number
}

export interface Section {
  max: number
  avg: number
  median: number
  atMax: number
  n: number
  dist: { points: number; n: number }[]
}

export interface AdminStats {
  generatedAt: string
  totals: { n: number; last24h: number; last7d: number; first: string | null; last: string | null; withCode: number }
  daily: { day: string; n: number }[]
  score: { min: number; max: number; mean: number; sd: number; p10: number; p25: number; median: number; p75: number; p90: number }
  hist: number[]
  cuts: Record<string, Row[]>
  sections: Record<string, Section>
  gap: { key: string; top: number; rest: number; max: number }[]
  occupations: { code: string; name: string; n: number; median: number }[]
  occupationGroups: { group: string; n: number; median: number }[]
  feedback: { count: number; items: { at: string; lang: string; message: string }[] }
  support: { event: string; devices: number; times: number }[]
}

export interface SubmissionRow {
  id: string
  at: string
  total: number
  age: number
  english: string
  experience: number
  education: string
  skill: number
  partner: boolean
  income: number
  location: string
  occupation: string | null
  code: string | null
  breakdown: { key: string; points: number; max: number }[]
}

export interface SubmissionPage {
  total: number
  rows: SubmissionRow[]
}

export type AdminResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'signed_out' | 'forbidden' | 'unconfigured' | 'bad_request' | 'implausible' | 'not_found' | 'error' }

// One call to the admin function. It checks the sign-in token and the admin email on every request.
export async function adminRequest<T>(token: string, body?: Record<string, unknown>): Promise<AdminResult<T>> {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!base) return { status: 'error' }
  try {
    const res = await fetch(`${base}/functions/v1/admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '',
        Authorization: `Bearer ${token}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (res.status === 401) return { status: 'signed_out' }
    if (res.status === 403) return { status: 'forbidden' }
    if (res.status === 503) return { status: 'unconfigured' }
    if (res.status === 400) return { status: 'bad_request' }
    if (res.status === 404) return { status: 'not_found' }
    if (res.status === 422) return { status: 'implausible' }
    if (res.status === 204) return { status: 'ok', data: undefined as T }
    if (!res.ok) return { status: 'error' }
    return { status: 'ok', data: (await res.json()) as T }
  } catch {
    return { status: 'error' }
  }
}

export type AdminOutcome = { status: 'ok'; stats: AdminStats } | { status: Exclude<AdminResult<never>['status'], 'ok'> }

export async function loadStats(token: string): Promise<AdminOutcome> {
  const out = await adminRequest<AdminStats>(token)
  return out.status === 'ok' ? { status: 'ok', stats: out.data } : out
}

export interface SubmissionQuery {
  filters: Record<string, unknown>
  sort: { f: string; d: 'asc' | 'desc' }[]
  limit: number
  offset: number
}

export const loadSubmissions = (token: string, q: SubmissionQuery) =>
  adminRequest<SubmissionPage>(token, { action: 'submissions', ...q })

export type SimulateRequest =
  | { mode: 'score'; total: number; location: 'onshore' | 'offshore'; occupationCode?: string }
  | { mode: 'form'; input: Record<string, unknown>; occupationCode?: string }

export const simulateRanking = (token: string, req: SimulateRequest) =>
  adminRequest<{ insights: import('../../supabase/functions/_shared/insights').Insights }>(token, { action: 'simulate', ...req })

export type TimelineRange = '1h' | '24h' | '7d' | '30d'

export interface Timeline {
  range: TimelineRange
  // Seconds in one bar.
  bucket: number
  total: number
  series: { t: string; n: number }[]
}

export const loadTimeline = (token: string, range: TimelineRange) => adminRequest<Timeline>(token, { action: 'timeline', range })

// An edit replaces the answers, and the server scores them again. occupationCode left out keeps the occupation,
// null removes it, and a listed code changes it.
export const updateSubmission = (token: string, id: string, input: Record<string, unknown>, occupationCode?: string | null) =>
  adminRequest<void>(token, { action: 'update', id, input, ...(occupationCode !== undefined ? { occupationCode } : {}) })

export const deleteSubmission = (token: string, id: string) => adminRequest<void>(token, { action: 'delete', id })
