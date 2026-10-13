import type { VptInput } from '../supabase/functions/_shared/scoring'

const base = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const endpoint = base ? `${base}/functions/v1/submissions` : null

const headers = {
  'Content-Type': 'application/json',
  ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
}

export type SaveOutcome =
  | { status: 'saved'; id: string }
  | { status: 'rate_limited'; retryAfter: number }
  | { status: 'unavailable' }

export async function saveSubmission(input: VptInput): Promise<SaveOutcome> {
  if (!endpoint) return { status: 'unavailable' }
  try {
    const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(input) })
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}))
      return { status: 'rate_limited', retryAfter: Number(body.retryAfter) || 600 }
    }
    if (!res.ok) return { status: 'unavailable' }
    const { id } = await res.json()
    return { status: 'saved', id }
  } catch {
    return { status: 'unavailable' }
  }
}

export async function loadSubmission(id: string): Promise<VptInput | null> {
  if (!endpoint) return null
  try {
    const res = await fetch(`${endpoint}?id=${encodeURIComponent(id)}`, { headers })
    if (!res.ok) return null
    return (await res.json()).input as VptInput
  } catch {
    return null
  }
}
