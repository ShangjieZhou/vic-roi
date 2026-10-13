-- Occupations are now picked from the official list, so each submission stores an ANZSCO code and the
-- two-digit group it belongs to. Candidates are compared within their exact occupation, and within the
-- broader group when too few candidates share the occupation. Free-text occupations still work and
-- simply have no code or group.

alter table public.submissions
  add column occupation_code text,
  add column occupation_group text;
create index submissions_occupation_group_idx on public.submissions (occupation_group);

drop function public.occupation_suggestions(text);
drop function public.pool_stats(text, text, integer, jsonb, integer);

create function public.pool_stats(
  p_key text, p_group text, p_location text, p_total integer, p_breakdown jsonb, p_min integer
)
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
   where location = p_location
     and (p_key is null or occupation_key = p_key)
     and (p_group is null or occupation_group = p_group);

  if v_n < p_min then
    return jsonb_build_object('n', v_n);
  end if;

  return (
    with pool as (
      select total, breakdown
        from submissions
       where location = p_location
         and (p_key is null or occupation_key = p_key)
         and (p_group is null or occupation_group = p_group)
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
  grp jsonb := null;
begin
  select * into me from submissions where id = p_id;
  if not found then
    return null;
  end if;
  if me.occupation_key is not null then
    occ := jsonb_build_object('name', me.occupation, 'code', me.occupation_code)
           || pool_stats(me.occupation_key, null, me.location, me.total, me.breakdown, 5);
  end if;
  if me.occupation_group is not null then
    grp := jsonb_build_object('code', me.occupation_group)
           || pool_stats(null, me.occupation_group, me.location, me.total, me.breakdown, 5);
  end if;
  return jsonb_build_object(
    'total', me.total,
    'location', me.location,
    'overall', pool_stats(null, null, me.location, me.total, me.breakdown, 10),
    'occupation', occ,
    'group', grp
  );
end;
$$;

revoke all on function public.pool_stats(text, text, text, integer, jsonb, integer) from public, anon, authenticated;
grant execute on function public.pool_stats(text, text, text, integer, jsonb, integer) to service_role;
