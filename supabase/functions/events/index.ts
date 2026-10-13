// POST /events   body: { deviceId: string, event: 'coffee_seen' | 'coffee_minimized' | 'coffee_clicked' }
//   204 recorded    400 invalid_json | invalid_device | invalid_event
//
// Counts who has seen, minimized or clicked the "Buy me a coffee" card. One row per anonymous device and event
// (see support_events). Only a hash of the device id is stored, the same hash the submissions use.

import { createClient } from 'npm:@supabase/supabase-js@2'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EVENTS = new Set(['coffee_seen', 'coffee_minimized', 'coffee_clicked'])

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

  let body: { deviceId?: unknown; event?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (typeof body?.deviceId !== 'string' || !UUID.test(body.deviceId)) return json({ error: 'invalid_device' }, 400)
  if (typeof body?.event !== 'string' || !EVENTS.has(body.event)) return json({ error: 'invalid_event' }, 400)

  const { error } = await db.rpc('record_support_event', {
    p_device_hash: await hashDevice(body.deviceId),
    p_event: body.event,
  })
  if (error) return json({ error: 'save_failed' }, 500)
  return new Response(null, { status: 204, headers: cors })
})
