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
  // replaced lists any earlier submission from this device that this one withdrew.
  | { status: 'ok'; submission: Submission; replaced: string[] }
  // This device already has a submission. Nothing was changed. Submitting again needs replace: true.
  | { status: 'already_submitted'; existing: { id: string; total: number } }
  | { status: 'bot_check_failed' }
  | { status: 'invalid_occupation' }
  | { status: 'error' }

export interface SubmitOptions {
  // The Cloudflare Turnstile token, when the bot check is on.
  turnstileToken?: string | null
  // Withdraw this device's current submission (deleting it) and save this one in its place.
  replace?: boolean
}

export async function submitScore(
  input: VptInput,
  occupation: OccupationChoice | null,
  options: SubmitOptions = {},
): Promise<SubmitOutcome> {
  if (!endpoint) return { status: 'error' }
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        input,
        deviceId: getDeviceId(),
        turnstileToken: options.turnstileToken || undefined,
        replace: options.replace ? true : undefined,
        occupationCode: occupation?.kind === 'listed' ? occupation.code : undefined,
        occupation: occupation?.kind === 'free' ? occupation.text.trim() || undefined : undefined,
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (res.status === 409 && body.error === 'already_submitted' && body.existing?.id) {
      return { status: 'already_submitted', existing: { id: body.existing.id, total: Number(body.existing.total) } }
    }
    if (res.status === 403 && body.error === 'bot_check_failed') return { status: 'bot_check_failed' }
    if (res.status === 400 && body.error === 'invalid_occupation') return { status: 'invalid_occupation' }
    if (!res.ok) return { status: 'error' }
    return {
      status: 'ok',
      replaced: Array.isArray(body.replaced) ? body.replaced : [],
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
