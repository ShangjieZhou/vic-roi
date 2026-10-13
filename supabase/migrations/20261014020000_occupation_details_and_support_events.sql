-- 1. Each of the top occupations now carries the median points in every section, for the expanded rows on the
--    analysis page. percentile_disc(0.5) is the lower middle value, which is the median the charts use.
--
-- 2. support_events counts who has seen the "Buy me a coffee" card, minimized it and clicked it. One row per
--    anonymous device and event. Only a hash of the device id is stored, the same hash the submissions use.
--    The count column says how many times that device did it. Read it with, for example:
--      select event, count(*) as devices, sum(count) as times from support_events group by event;

create or replace function public.get_insights(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me submissions%rowtype;
  occ jsonb := null;
  v_level integer := null;
  v_len integer;
  v_min integer;
  v_n integer;
begin
  select * into me from submissions where id = p_id;
  if not found then
    return null;
  end if;

  if me.occupation_code is not null then
    foreach v_min in array array[5, 2] loop
      foreach v_len in array array[6, 4, 3, 2] loop
        select count(*) into v_n from submissions where left(occupation_code, v_len) = left(me.occupation_code, v_len);
        if v_n >= v_min then
          v_level := v_len;
          exit;
        end if;
      end loop;
      exit when v_level is not null;
    end loop;
    v_level := coalesce(v_level, 6);
    occ := jsonb_build_object(
             'name', me.occupation, 'code', me.occupation_code,
             'level', v_level, 'prefix', left(me.occupation_code, v_level)
           )
           || pool_stats(null, left(me.occupation_code, v_level), null, me.total, me.breakdown, 2);
  elsif me.occupation_key is not null then
    occ := jsonb_build_object('name', me.occupation, 'code', null, 'level', null, 'prefix', null)
           || pool_stats(me.occupation_key, null, null, me.total, me.breakdown, 2);
  end if;

  return jsonb_build_object(
    'total', me.total,
    'location', me.location,
    'overall', pool_stats(null, null, null, me.total, me.breakdown, 10),
    'locationGroup', pool_stats(null, null, me.location, me.total, me.breakdown, 2),
    'occupation', occ,
    'topOccupations', (
      select coalesce(jsonb_agg(
               jsonb_build_object(
                 'code', t.code, 'name', t.name, 'n', t.n, 'median', t.med,
                 'categoryMedian', (
                   select coalesce(jsonb_object_agg(c.k, c.m), '{}'::jsonb)
                     from (
                       select e->>'key' as k,
                              percentile_disc(0.5) within group (order by (e->>'points')::numeric) as m
                         from submissions s, jsonb_array_elements(s.breakdown) e
                        where s.occupation_code = t.code
                        group by 1
                     ) c
                 )
               ) order by t.n desc, t.name), '[]'::jsonb)
        from (
          select occupation_code as code, max(occupation) as name, count(*) as n,
                 round((percentile_cont(0.5) within group (order by total))::numeric) as med
            from submissions
           where occupation_code is not null
           group by occupation_code
          having count(*) >= 2
           order by count(*) desc, max(occupation)
           limit 10
        ) t
    )
  );
end;
$$;

create table public.support_events (
  device_hash text not null,
  event text not null check (event in ('coffee_seen', 'coffee_minimized', 'coffee_clicked')),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  count integer not null default 1,
  primary key (device_hash, event)
);

alter table public.support_events enable row level security;

create function public.record_support_event(p_device_hash text, p_event text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into support_events (device_hash, event) values (p_device_hash, p_event)
  on conflict (device_hash, event) do update set count = support_events.count + 1, last_at = now();
$$;

revoke all on function public.record_support_event(text, text) from public, anon, authenticated;
grant execute on function public.record_support_event(text, text) to service_role;
