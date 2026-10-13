-- Anonymous VPT submissions. No auth: rows are written and read only by edge functions
-- using the service role. RLS is enabled with no policies, so direct client access is denied.

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  input jsonb not null,
  total integer not null check (total >= 0),
  breakdown jsonb not null,
  created_at timestamptz not null default now()
);
create index submissions_total_idx on public.submissions (total);
alter table public.submissions enable row level security;

-- Fixed-window rate limit counters, keyed by a salted hash of the client IP.
create table public.rate_limits (
  ip_hash text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (ip_hash, window_start)
);
alter table public.rate_limits enable row level security;

-- Atomically counts one attempt and reports whether it fits within the limit.
create function public.check_rate_limit(
  p_ip_hash text,
  p_limit integer,
  p_window_seconds integer
) returns table (allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_epoch bigint := floor(extract(epoch from now()) / p_window_seconds)::bigint * p_window_seconds;
  v_window timestamptz := to_timestamp(v_epoch);
  v_count integer;
begin
  insert into rate_limits as r (ip_hash, window_start, count)
  values (p_ip_hash, v_window, 1)
  on conflict (ip_hash, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  allowed := v_count <= p_limit;
  retry_after := greatest(1, ceil(v_epoch + p_window_seconds - extract(epoch from now()))::integer);
  return next;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- Hourly cleanup of expired windows (skipped when pg_cron is unavailable, e.g. local dev).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'purge-rate-limits',
      '17 * * * *',
      $cron$delete from public.rate_limits where window_start < now() - interval '1 hour'$cron$
    );
  end if;
end;
$$;
