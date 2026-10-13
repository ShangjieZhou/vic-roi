-- Per-section percentile: for each scoring category the candidate can claim, the share of candidates
-- in the same group who scored lower, counting ties as half. Same rule as the overall percentile.

drop function public.pool_stats(text, text, integer, integer);

create function public.pool_stats(p_key text, p_location text, p_total integer, p_breakdown jsonb, p_min integer)
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
    ),
    pool_points as (
      select e->>'key' as k, (e->>'points')::numeric as pts
        from pool, jsonb_array_elements(pool.breakdown) e
    ),
    mine as (
      -- Rows saved before the 'applicable' flag existed count as applicable.
      select e->>'key' as k, (e->>'points')::numeric as pts
        from jsonb_array_elements(p_breakdown) e
       where coalesce((e->>'applicable')::boolean, true)
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
          from (select k, round(avg(pts), 1) as a from pool_points group by k) c
      ),
      'categoryPercentile', (
        select coalesce(jsonb_object_agg(k, pct), '{}'::jsonb)
          from (
            select m.k,
                   round(100.0 * (count(*) filter (where p.pts < m.pts) + 0.5 * count(*) filter (where p.pts = m.pts))
                         / count(*)) as pct
              from mine m
              join pool_points p on p.k = m.k
             group by m.k, m.pts
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
           || pool_stats(me.occupation_key, me.location, me.total, me.breakdown, 5);
  end if;
  return jsonb_build_object(
    'total', me.total,
    'location', me.location,
    'overall', pool_stats(null, me.location, me.total, me.breakdown, 10),
    'occupation', occ
  );
end;
$$;

revoke all on function public.pool_stats(text, text, integer, jsonb, integer) from public, anon, authenticated;
grant execute on function public.pool_stats(text, text, integer, jsonb, integer) to service_role;
