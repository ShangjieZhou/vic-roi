-- Data for the analysis page.
--
-- * Every candidate now scores out of 950. Offshore candidates get 0 income points, so their earnings row
--   counts in every section statistic instead of being left out.
-- * overall: mean and where the mean sits, for the percentile bar (the median is already there).
-- * categoryDist: how many candidates scored each value in each section, for the per-section bar charts.
-- * The histogram, quartiles and the broader field comparison are no longer shown, so they are no longer computed.

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
    -- Every row counts for every section. Older offshore rows flagged earnings as not applicable, with 0 points,
    -- which is exactly how offshore income is now scored.
    pool_points as (
      select e->>'key' as k, (e->>'points')::numeric as pts
        from pool, jsonb_array_elements(pool.breakdown) e
    ),
    mine as (
      select e->>'key' as k, (e->>'points')::numeric as pts
        from jsonb_array_elements(p_breakdown) e
    ),
    mean as (
      select avg(total) as m from pool
    )
    select jsonb_build_object(
      'n', v_n,
      'percentile', round(100.0 * (v_lower + 0.5 * v_equal) / v_n),
      'median', (select round((percentile_cont(0.5) within group (order by total))::numeric) from pool),
      'mean', (select round(m) from mean),
      'meanPercentile', (
        select round(100.0 * (count(*) filter (where pool.total < mean.m) + 0.5 * count(*) filter (where pool.total = mean.m)) / count(*))
          from pool, mean
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
      ),
      'categoryDist', (
        select coalesce(jsonb_object_agg(k, d), '{}'::jsonb)
          from (
            select k, jsonb_agg(jsonb_build_object('points', pts, 'count', c) order by pts) as d
              from (select k, pts, count(*) as c from pool_points group by k, pts) g
             group by k
          ) h
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
    occ := jsonb_build_object('name', me.occupation, 'code', me.occupation_code)
           || pool_stats(me.occupation_key, null, null, me.total, me.breakdown, 2);
  end if;
  return jsonb_build_object(
    'total', me.total,
    'location', me.location,
    'overall', pool_stats(null, null, null, me.total, me.breakdown, 10),
    'locationGroup', pool_stats(null, null, me.location, me.total, me.breakdown, 2),
    'occupation', occ
  );
end;
$$;
