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

export type AdminOutcome =
  | { status: 'ok'; stats: AdminStats }
  | { status: 'signed_out' | 'forbidden' | 'unconfigured' | 'error' }

export async function loadStats(token: string): Promise<AdminOutcome> {
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
    })
    if (res.status === 401) return { status: 'signed_out' }
    if (res.status === 403) return { status: 'forbidden' }
    if (res.status === 503) return { status: 'unconfigured' }
    if (!res.ok) return { status: 'error' }
    return { status: 'ok', stats: (await res.json()) as AdminStats }
  } catch {
    return { status: 'error' }
  }
}
