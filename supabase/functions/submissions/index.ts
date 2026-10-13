// POST /submissions   body: { input: VptInput, deviceId: string, turnstileToken?: string, replace?: boolean,
//                             occupationCode?: string, occupation?: string }
//   201 { id, insights, replaced: [ids] }   saved. replaced lists any earlier submission it withdrew.
//   409 { error: 'already_submitted', existing: { id, total } }
//                                           this device already has a submission and replace was not asked for.
//   403 { error: 'bot_check_failed' }       Turnstile is on and the token did not verify.
//   400 invalid_input | invalid_device | invalid_occupation
//   occupationCode must be on the official list. occupation is free text, used only when no code is given.
//
// A device may hold one submission. Submitting again needs replace: true, which deletes the earlier one.
//
// GET  /submissions?id=<uuid>   -> { input, occupation, occupationCode, insights }

import { createClient } from 'npm:@supabase/supabase-js@2'
import { normalizeOccupation } from '../_shared/insights.ts'
import { OCCUPATION_BY_CODE, occupationGroup } from '../_shared/occupations.ts'
import { calculateVpt, parseVptInput } from '../_shared/scoring.ts'
import { verifyTurnstile } from '../_shared/turnstile.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

// The bot check is on once a Turnstile secret is configured. Without one, it is skipped.
const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET_KEY') || null

// The device id is a random value the browser keeps. Only its hash is stored, and nothing links it to a person.
async function hashDevice(deviceId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`device:${deviceId.toLowerCase()}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

interface OccupationColumns {
  occupation: string | null
  occupation_key: string | null
  occupation_code: string | null
  occupation_group: string | null
}

// A listed occupation is stored under its code, so every spelling and language lands in one group.
// Free text is matched by its lower-cased text, with no code or group.
function resolveOccupation(code: unknown, text: unknown): OccupationColumns | 'invalid' {
  if (code !== undefined && code !== null && code !== '') {
    const listed = typeof code === 'string' ? OCCUPATION_BY_CODE.get(code) : undefined
    if (!listed) return 'invalid'
    return {
      occupation: listed.title,
      occupation_key: listed.code,
      occupation_code: listed.code,
      occupation_group: occupationGroup(listed.code),
    }
  }
  const free = normalizeOccupation(text)
  if (free === 'invalid') return 'invalid'
  return {
    occupation: free?.name ?? null,
    occupation_key: free?.key ?? null,
    occupation_code: null,
    occupation_group: null,
  }
}

async function handleGet(url: URL): Promise<Response> {
  const id = url.searchParams.get('id') ?? ''
  if (!UUID.test(id)) return json({ error: 'invalid_id' }, 400)
  const { data, error } = await db
    .from('submissions')
    .select('input, occupation, occupation_code, location')
    .eq('id', id)
    .maybeSingle()
  if (error) return json({ error: 'lookup_failed' }, 500)
  if (!data) return json({ error: 'not_found' }, 404)
  const { data: insights, error: insightsError } = await db.rpc('get_insights', { p_id: id })
  if (insightsError) return json({ error: 'lookup_failed' }, 500)
  // The column wins so rows saved before location existed still load as onshore.
  return json({
    input: { ...data.input, location: data.location },
    occupation: data.occupation,
    occupationCode: data.occupation_code,
    insights,
  })
}

async function handlePost(req: Request): Promise<Response> {
  let body: {
    input?: unknown
    deviceId?: unknown
    turnstileToken?: unknown
    replace?: unknown
    occupation?: unknown
    occupationCode?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  const input = parseVptInput(body?.input)
  if (!input) return json({ error: 'invalid_input' }, 400)
  if (typeof body?.deviceId !== 'string' || !UUID.test(body.deviceId)) return json({ error: 'invalid_device' }, 400)
  const occupation = resolveOccupation(body?.occupationCode, body?.occupation)
  if (occupation === 'invalid') return json({ error: 'invalid_occupation' }, 400)

  const deviceHash = await hashDevice(body.deviceId)
  const replace = body.replace === true

  // A device that already has a submission is told so before anything is checked or written. Nothing changes here,
  // and the bot token is not used up, so the same token still works for the replacement request.
  if (!replace) {
    const { data: existing, error: existingError } = await db
      .from('submissions')
      .select('id, total')
      .eq('device_hash', deviceHash)
      .order('created_at')
      .limit(1)
      .maybeSingle()
    if (existingError) return json({ error: 'save_failed' }, 500)
    if (existing) return json({ error: 'already_submitted', existing }, 409)
  }

  if (TURNSTILE_SECRET && !(await verifyTurnstile(body.turnstileToken, TURNSTILE_SECRET))) {
    return json({ error: 'bot_check_failed' }, 403)
  }

  // Recompute on the server so clients cannot store forged totals.
  const result = calculateVpt(input)

  // The check, any withdrawal and the insert are one database step, so simultaneous requests cannot leave a device
  // with two submissions.
  const { data: saved, error } = await db.rpc('create_submission', {
    p_device_hash: deviceHash,
    p_replace: replace,
    p_input: input,
    p_location: input.location,
    p_total: result.total,
    p_breakdown: result.categories,
    p_occupation: occupation.occupation,
    p_occupation_key: occupation.occupation_key,
    p_occupation_code: occupation.occupation_code,
    p_occupation_group: occupation.occupation_group,
  })
  if (error || !saved) return json({ error: 'save_failed' }, 500)
  if (saved.status === 'exists') return json({ error: 'already_submitted', existing: saved.existing }, 409)

  const { data: insights, error: insightsError } = await db.rpc('get_insights', { p_id: saved.id })
  if (insightsError) return json({ error: 'insights_failed' }, 500)
  return json({ id: saved.id, insights, replaced: saved.replaced ?? [] }, 201)
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method === 'GET') return handleGet(new URL(req.url))
  if (req.method === 'POST') return handlePost(req)
  return json({ error: 'method_not_allowed' }, 405)
})
