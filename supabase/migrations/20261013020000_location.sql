-- Onshore and offshore candidates score out of different maximums (Victorian earnings only
-- applies onshore), so each candidate is compared only with the same location.

alter table public.submissions
  add column location text not null default 'onshore' check (location in ('onshore', 'offshore'));
create index submissions_location_idx on public.submissions (location);

drop function public.pool_stats(text, integer, integer);

create function public.pool_stats(p_key text, p_location text, p_total integer, p_min integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_n integer;
  v_lower integer;
  v_equal integer;
begin
  select count(*),
         count(*) filter (where total < p_total),
         count(*) filter (where total = p_total)
    into v_n, v_lower, v_equal
    from submissions
   where location = p_location and (p_key is null or occupation_key = p_key);

  if v_n < p_min then
    return jsonb_build_object('n', v_n);
  end if;

  return (
    with pool as (
      select total, breakdown
        from submissions
       where location = p_location and (p_key is null or occupation_key = p_key)
    )
    select jsonb_build_object(
      'n', v_n,
      'percentile', round(100.0 * (v_lower + 0.5 * v_equal) / v_n),
      'median', (select round((percentile_cont(0.5) within group (order by total))::numeric) from pool),
      'p25', (select round((percentile_cont(0.25) within group (order by total))::numeric) from pool),
      'p75', (select round((percentile_cont(0.75) within group (order by total))::numeric) from pool),
      'histogram', (
        select coalesce(jsonb_agg(jsonb_build_object('from', b * 50, 'count', c) order by b), '[]'::jsonb)
          from (select least(total / 50, 18) as b, count(*) as c from pool group by 1) h
      ),
      'categoryAvg', (
        select coalesce(jsonb_object_agg(k, a), '{}'::jsonb)
          from (
            select e->>'key' as k, round(avg((e->>'points')::numeric), 1) as a
              from pool, jsonb_array_elements(pool.breakdown) e
             group by 1
          ) c
      )
    )
  );
end;
$$;

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
begin
  select * into me from submissions where id = p_id;
  if not found then
    return null;
  end if;
  if me.occupation_key is not null then
    occ := jsonb_build_object('name', me.occupation)
           || pool_stats(me.occupation_key, me.location, me.total, 5);
  end if;
  return jsonb_build_object(
    'total', me.total,
    'location', me.location,
    'overall', pool_stats(null, me.location, me.total, 10),
    'occupation', occ
  );
end;
$$;

revoke all on function public.pool_stats(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.pool_stats(text, text, integer, integer) to service_role;
