import type { Insights } from '../supabase/functions/_shared/insights'
import type { VptInput } from '../supabase/functions/_shared/scoring'

const base = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const endpoint = base ? `${base}/functions/v1/submissions` : null

const headers = {
  'Content-Type': 'application/json',
  ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
}

export interface Submission {
  id: string
  occupation: string | null
  insights: Insights
}

export type SubmitOutcome =
  | { status: 'ok'; submission: Submission }
  | { status: 'rate_limited'; retryAfter: number }
  | { status: 'invalid_occupation' }
  | { status: 'error' }

export async function submitScore(input: VptInput, occupation: string): Promise<SubmitOutcome> {
  if (!endpoint) return { status: 'error' }
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ input, occupation: occupation.trim() || undefined }),
    })
    const body = await res.json().catch(() => ({}))
    if (res.status === 429) return { status: 'rate_limited', retryAfter: Number(body.retryAfter) || 600 }
    if (res.status === 400 && body.error === 'invalid_occupation') return { status: 'invalid_occupation' }
    if (!res.ok) return { status: 'error' }
    return {
      status: 'ok',
      submission: { id: body.id, occupation: occupation.trim() || null, insights: body.insights },
    }
  } catch {
    return { status: 'error' }
  }
}

export type LoadResult = { input: VptInput; submission: Submission }

// Returns 'not_found' when the server says the result does not exist, and null when the request failed.
export async function loadSubmission(id: string): Promise<LoadResult | 'not_found' | null> {
  if (!endpoint) return null
  try {
    const res = await fetch(`${endpoint}?id=${encodeURIComponent(id)}`, { headers })
    if (res.status === 404) return 'not_found'
    if (!res.ok) return null
    const body = await res.json()
    return { input: body.input, submission: { id, occupation: body.occupation, insights: body.insights } }
  } catch {
    return null
  }
}

export async function suggestOccupations(prefix: string): Promise<{ name: string; count: number }[]> {
  if (!endpoint) return []
  try {
    const res = await fetch(`${endpoint}?suggest=${encodeURIComponent(prefix)}`, { headers })
    if (!res.ok) return []
    return (await res.json()).suggestions ?? []
  } catch {
    return []
  }
}
