-- The comparison opens once enough candidates have submitted overall (10). The narrower groups
-- (onshore or offshore, exact occupation, broader field) no longer need that many: each shows as soon
-- as at least one other candidate is in it (2), so there is someone to compare with.
--
-- Overall, occupation and field now include candidates from both locations, so they reach a useful size
-- sooner. A separate row compares against the same location only, because onshore scores are out of 950 and
-- offshore scores out of 800.

create or replace function public.pool_stats(
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
  -- A null p_location means every location.
  select count(*),
         count(*) filter (where total < p_total),
         count(*) filter (where total = p_total)
    into v_n, v_lower, v_equal
    from submissions
   where (p_location is null or location = p_location)
     and (p_key is null or occupation_key = p_key)
     and (p_group is null or occupation_group = p_group);

  if v_n < p_min then
    return jsonb_build_object('n', v_n);
  end if;

  return (
    with pool as (
      select total, breakdown
        from submissions
       where (p_location is null or location = p_location)
         and (p_key is null or occupation_key = p_key)
         and (p_group is null or occupation_group = p_group)
    ),
    pool_points as (
      -- Only candidates who could claim a section count towards it (offshore candidates cannot claim earnings).
      select e->>'key' as k, (e->>'points')::numeric as pts
        from pool, jsonb_array_elements(pool.breakdown) e
       where coalesce((e->>'applicable')::boolean, true)
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
           || pool_stats(me.occupation_key, null, null, me.total, me.breakdown, 2);
  end if;
  if me.occupation_group is not null then
    grp := jsonb_build_object('code', me.occupation_group)
           || pool_stats(null, me.occupation_group, null, me.total, me.breakdown, 2);
  end if;
  return jsonb_build_object(
    'total', me.total,
    'location', me.location,
    'overall', pool_stats(null, null, null, me.total, me.breakdown, 10),
    'locationGroup', pool_stats(null, null, me.location, me.total, me.breakdown, 2),
    'occupation', occ,
    'group', grp
  );
end;
$$;
