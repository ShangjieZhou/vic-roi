-- A hard limit of submissions per device replaces the per-IP rate limit.
--
-- A device is a random id the browser keeps in local storage. Only a hash of it is stored here, and it is
-- unrelated to the person. Rows saved before this change have no device and do not count towards any limit.
--
-- The limit is checked and the row inserted in one function, under a lock for that device, so two requests that
-- arrive together cannot both pass the check and exceed the limit.

alter table public.submissions add column device_hash text;
create index submissions_device_hash_idx on public.submissions (device_hash);

create function public.create_submission(
  p_device_hash text,
  p_limit integer,
  p_input jsonb,
  p_location text,
  p_total integer,
  p_breakdown jsonb,
  p_occupation text,
  p_occupation_key text,
  p_occupation_code text,
  p_occupation_group text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_device_hash, 0));

  if (select count(*) from submissions where device_hash = p_device_hash) >= p_limit then
    return null;
  end if;

  insert into submissions (
    input, location, total, breakdown,
    occupation, occupation_key, occupation_code, occupation_group, device_hash
  ) values (
    p_input, p_location, p_total, p_breakdown,
    p_occupation, p_occupation_key, p_occupation_code, p_occupation_group, p_device_hash
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_submission(text, integer, jsonb, text, integer, jsonb, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_submission(text, integer, jsonb, text, integer, jsonb, text, text, text, text)
  to service_role;

-- The rate limiter is no longer used.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('purge-rate-limits');
  end if;
exception when others then
  null; -- the job did not exist
end;
$$;
drop function if exists public.check_rate_limit(text, integer, integer);
drop table if exists public.rate_limits;
