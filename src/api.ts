import type { Insights } from '../supabase/functions/_shared/insights'
import type { VptInput } from '../supabase/functions/_shared/scoring'
import { getDeviceId } from './device'

const base = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const endpoint = base ? `${base}/functions/v1/submissions` : null

const headers = {
  'Content-Type': 'application/json',
  ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
}

export interface Submission {
  id: string
  // The English title for a listed occupation, or the typed text. occupationCode is set only for listed ones.
  occupation: string | null
  occupationCode: string | null
  insights: Insights
}

// What the candidate chose: an occupation from the official list, or text for one that is not listed.
export type OccupationChoice = { kind: 'listed'; code: string } | { kind: 'free'; text: string }

export type SubmitOutcome =
  | { status: 'ok'; submission: Submission }
  // A hard limit on how many results one device can submit. It does not reset.
  | { status: 'device_limit'; limit: number }
  | { status: 'invalid_occupation' }
  | { status: 'error' }

export async function submitScore(input: VptInput, occupation: OccupationChoice | null): Promise<SubmitOutcome> {
  if (!endpoint) return { status: 'error' }
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        input,
        deviceId: getDeviceId(),
        occupationCode: occupation?.kind === 'listed' ? occupation.code : undefined,
        occupation: occupation?.kind === 'free' ? occupation.text.trim() || undefined : undefined,
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (res.status === 403 && body.error === 'device_limit') return { status: 'device_limit', limit: Number(body.limit) || 5 }
    if (res.status === 400 && body.error === 'invalid_occupation') return { status: 'invalid_occupation' }
    if (!res.ok) return { status: 'error' }
    return {
      status: 'ok',
      submission: {
        id: body.id,
        occupation: body.insights?.occupation?.name ?? null,
        occupationCode: body.insights?.occupation?.code ?? null,
        insights: body.insights,
      },
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
    return {
      input: body.input,
      submission: { id, occupation: body.occupation ?? null, occupationCode: body.occupationCode ?? null, insights: body.insights },
    }
  } catch {
    return null
  }
}
