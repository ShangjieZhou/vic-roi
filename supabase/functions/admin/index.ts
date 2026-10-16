// POST /admin   header: Authorization: Bearer <Supabase sign-in token>
//   body (all optional, the default is the overview):
//     { action: 'stats' }                                                   -> the overview numbers (admin_stats)
//     { action: 'submissions', filters, sort, limit, offset }               -> { total, rows } (admin_submissions)
//     { action: 'timeline', range: '1h' | '24h' | '7d' | '30d' }          -> submissions per time bucket (admin_timeline)
//     { action: 'simulate', mode: 'score', total, location, occupationCode? } or
//     { action: 'simulate', mode: 'form', input, occupationCode? }          -> { insights } for a candidate who is
//                                                                              not stored (compute_insights)
//   401 not_signed_in    403 not_admin    503 not_configured    400 invalid_request    500 load_failed
//
// Only the one email in the ADMIN_EMAIL secret gets in. The sign-in token comes from a Supabase email link. This
// function asks Supabase Auth whether the token is genuine, then compares the verified email with the secret. The
// numbers never reach any other caller.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { OCCUPATION_BY_CODE } from '../_shared/occupations.ts'
import { calculateVpt, parseVptInput } from '../_shared/scoring.ts'

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const adminEmail = Deno.env.get('ADMIN_EMAIL')?.trim().toLowerCase()
  if (!adminEmail) return json({ error: 'not_configured' }, 503)

  const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
  if (!token) return json({ error: 'not_signed_in' }, 401)
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) return json({ error: 'not_signed_in' }, 401)
  if (!data.user.email_confirmed_at || data.user.email?.toLowerCase() !== adminEmail) return json({ error: 'not_admin' }, 403)

  let body: Record<string, unknown> = {}
  try {
    const parsed = await req.json()
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>
  } catch {
    // An empty body asks for the overview.
  }

  if (body.action === 'submissions') {
    const { data: page, error: pageError } = await db.rpc('admin_submissions', {
      p_filters: isObject(body.filters) ? body.filters : {},
      p_sort: Array.isArray(body.sort) ? body.sort : [],
      p_limit: Number.isInteger(body.limit) ? body.limit : 50,
      p_offset: Number.isInteger(body.offset) ? body.offset : 0,
    })
    if (pageError) return json({ error: 'load_failed' }, 500)
    return json(page, 200)
  }

  if (body.action === 'timeline') {
    if (typeof body.range !== 'string') return json({ error: 'invalid_request' }, 400)
    const { data: timeline, error: timelineError } = await db.rpc('admin_timeline', { p_range: body.range })
    if (timelineError) return json({ error: 'load_failed' }, 500)
    if (!timeline) return json({ error: 'invalid_request' }, 400)
    return json(timeline, 200)
  }

  if (body.action === 'simulate') return simulate(body)

  const { data: stats, error: statsError } = await db.rpc('admin_stats')
  if (statsError) return json({ error: 'load_failed' }, 500)
  return json(stats, 200)
})

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

// Ranks a score that is not stored. A bare score has no section breakdown, so only the overall comparison is
// filled in. A full form is scored with the same code the public page uses.
async function simulate(body: Record<string, unknown>): Promise<Response> {
  let occupation: { title: string; code: string } | null = null
  if (body.occupationCode !== undefined && body.occupationCode !== null && body.occupationCode !== '') {
    const listed = typeof body.occupationCode === 'string' ? OCCUPATION_BY_CODE.get(body.occupationCode) : undefined
    if (!listed) return json({ error: 'invalid_request' }, 400)
    occupation = { title: listed.title, code: listed.code }
  }

  let total: number
  let location: string
  let breakdown: unknown = []
  if (body.mode === 'form') {
    const input = parseVptInput(body.input)
    if (!input) return json({ error: 'invalid_request' }, 400)
    const result = calculateVpt(input)
    total = result.total
    location = input.location
    breakdown = result.categories
  } else if (body.mode === 'score') {
    if (!Number.isInteger(body.total) || (body.total as number) < 0 || (body.total as number) > 950) return json({ error: 'invalid_request' }, 400)
    if (body.location !== 'onshore' && body.location !== 'offshore') return json({ error: 'invalid_request' }, 400)
    total = body.total as number
    location = body.location
  } else {
    return json({ error: 'invalid_request' }, 400)
  }

  const { data: insights, error } = await db.rpc('compute_insights', {
    p_total: total,
    p_location: location,
    p_occupation: occupation?.title ?? null,
    p_occupation_code: occupation?.code ?? null,
    p_occupation_key: occupation?.code ?? null,
    p_breakdown: breakdown,
  })
  if (error) return json({ error: 'load_failed' }, 500)
  return json({ insights }, 200)
}
