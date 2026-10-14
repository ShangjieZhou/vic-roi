// POST /feedback   body: { deviceId: string, message: string, lang: 'en' | 'zh' }
//   204 saved    400 invalid_json | invalid_device | invalid_message | invalid_lang    429 rate_limited
//
// Saves a note from the feedback box (see the feedback table). The message is trimmed and may hold 1 to 2000
// characters. A device may leave 5 messages in 24 hours. Only a hash of the device id is stored, the same hash the
// submissions use.

import { createClient } from 'npm:@supabase/supabase-js@2'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_LENGTH = 2000

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

async function hashDevice(deviceId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`device:${deviceId.toLowerCase()}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: { deviceId?: unknown; message?: unknown; lang?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (typeof body?.deviceId !== 'string' || !UUID.test(body.deviceId)) return json({ error: 'invalid_device' }, 400)
  if (body?.lang !== 'en' && body?.lang !== 'zh') return json({ error: 'invalid_lang' }, 400)
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (message.length < 1 || message.length > MAX_LENGTH) return json({ error: 'invalid_message' }, 400)

  const { data, error } = await db.rpc('add_feedback', {
    p_device_hash: await hashDevice(body.deviceId),
    p_message: message,
    p_lang: body.lang,
  })
  if (error) return json({ error: 'save_failed' }, 500)
  if (data === false) return json({ error: 'rate_limited' }, 429)
  return new Response(null, { status: 204, headers: cors })
})
