import { getDeviceId } from './device'

// What gets counted about the "Buy me a coffee" card. Each is counted once per anonymous device, with a tally of
// repeats, in the support_events table.
export type SupportEvent = 'coffee_seen' | 'coffee_minimized' | 'coffee_clicked'

// Fire and forget: counting never blocks the page and a failure is ignored. The device id is the random id the
// browser already keeps. The server stores only a hash of it.
export function trackSupport(event: SupportEvent): void {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!base) return
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  try {
    fetch(`${base}/functions/v1/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
      },
      body: JSON.stringify({ deviceId: getDeviceId(), event }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Nothing to do.
  }
}
