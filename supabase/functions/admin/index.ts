// POST /admin   header: Authorization: Bearer <Supabase sign-in token>
//   200 the dashboard numbers (see admin_stats)
//   401 not_signed_in    403 not_admin    503 not_configured    500 load_failed
//
// Only the one email in the ADMIN_EMAIL secret gets in. The sign-in token comes from a Supabase email link. This
// function asks Supabase Auth whether the token is genuine, then compares the verified email with the secret. The
// numbers never reach any other caller.

import { createClient } from 'npm:@supabase/supabase-js@2'

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

  const { data: stats, error: statsError } = await db.rpc('admin_stats')
  if (statsError) return json({ error: 'load_failed' }, 500)
  return json(stats, 200)
})
