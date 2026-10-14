import { getDeviceId } from './device'
import type { Lang } from './i18n'

export const FEEDBACK_MAX = 2000

export type FeedbackOutcome = 'ok' | 'rate_limited' | 'error'

// Saves a note from the feedback box through the feedback function. The device id is the random id the browser
// already keeps, and the server stores only a hash of it.
export async function sendFeedback(message: string, lang: Lang): Promise<FeedbackOutcome> {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!base) return 'error'
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  try {
    const res = await fetch(`${base}/functions/v1/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
      },
      body: JSON.stringify({ deviceId: getDeviceId(), message: message.trim(), lang }),
    })
    if (res.ok) return 'ok'
    return res.status === 429 ? 'rate_limited' : 'error'
  } catch {
    return 'error'
  }
}
