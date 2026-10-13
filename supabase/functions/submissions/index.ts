// POST /submissions                body: { input: VptInput, occupation?: string }
//                                  -> { id, insights }, rate limited per IP
// GET  /submissions?id=<uuid>      -> { input, occupation, insights }
// GET  /submissions?suggest=<text> -> { suggestions: [{ name, count }] }

import { createClient } from 'npm:@supabase/supabase-js@2'
import { normalizeOccupation } from '../_shared/insights.ts'
import { calculateVpt, parseVptInput } from '../_shared/scoring.ts'

const LIMIT = 5
const WINDOW_SECONDS = 600
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', ...extra },
  })

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

function clientIp(req: Request): string {
  // cf-connecting-ip is set by Cloudflare and cannot be spoofed by the client.
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return req.headers.get('cf-connecting-ip') || forwarded || 'unknown'
}

async function hashIp(ip: string): Promise<string> {
  const salt = Deno.env.get('IP_HASH_SALT') ?? ''
  const bytes = new TextEncoder().encode(`${salt}:${ip}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function handleGet(url: URL): Promise<Response> {
  const suggest = url.searchParams.get('suggest')
  if (suggest !== null) {
    const occ = normalizeOccupation(suggest)
    if (occ === 'invalid' || occ === null || occ.key.length < 2) return json({ suggestions: [] })
    const { data, error } = await db.rpc('occupation_suggestions', { p_prefix: occ.key })
    if (error) return json({ error: 'lookup_failed' }, 500)
    return json({ suggestions: data })
  }

  const id = url.searchParams.get('id') ?? ''
  if (!UUID.test(id)) return json({ error: 'invalid_id' }, 400)
  const { data, error } = await db.from('submissions').select('input, occupation, location').eq('id', id).maybeSingle()
  if (error) return json({ error: 'lookup_failed' }, 500)
  if (!data) return json({ error: 'not_found' }, 404)
  const { data: insights, error: insightsError } = await db.rpc('get_insights', { p_id: id })
  if (insightsError) return json({ error: 'lookup_failed' }, 500)
  // The column wins so rows saved before location existed still load as onshore.
  return json({ input: { ...data.input, location: data.location }, occupation: data.occupation, insights })
}

async function handlePost(req: Request): Promise<Response> {
  let body: { input?: unknown; occupation?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  const input = parseVptInput(body?.input)
  if (!input) return json({ error: 'invalid_input' }, 400)
  const occupation = normalizeOccupation(body?.occupation)
  if (occupation === 'invalid') return json({ error: 'invalid_occupation' }, 400)

  const { data: gate, error: gateError } = await db
    .rpc('check_rate_limit', {
      p_ip_hash: await hashIp(clientIp(req)),
      p_limit: LIMIT,
      p_window_seconds: WINDOW_SECONDS,
    })
    .single<{ allowed: boolean; retry_after: number }>()
  if (gateError || !gate) return json({ error: 'rate_limit_unavailable' }, 500)
  if (!gate.allowed) {
    return json({ error: 'rate_limited', retryAfter: gate.retry_after }, 429, {
      'Retry-After': String(gate.retry_after),
    })
  }

  // Recompute on the server so clients cannot store forged totals.
  const result = calculateVpt(input)
  const { data, error } = await db
    .from('submissions')
    .insert({
      input,
      location: input.location,
      total: result.total,
      breakdown: result.categories,
      occupation: occupation?.name ?? null,
      occupation_key: occupation?.key ?? null,
    })
    .select('id')
    .single()
  if (error) return json({ error: 'save_failed' }, 500)

  const { data: insights, error: insightsError } = await db.rpc('get_insights', { p_id: data.id })
  if (insightsError) return json({ error: 'insights_failed' }, 500)
  return json({ id: data.id, insights }, 201)
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method === 'GET') return handleGet(new URL(req.url))
  if (req.method === 'POST') return handlePost(req)
  return json({ error: 'method_not_allowed' }, 405)
})
