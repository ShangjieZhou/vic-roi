-- The score that 25% and 75% of candidates fall below, beside the median, for the marks on the distribution
-- graph's score axis.

create or replace function public.pool_stats(
  p_key text, p_prefix text, p_location text, p_total integer, p_breakdown jsonb, p_min integer
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
  -- A null p_location means every location. A null p_prefix means every occupation.
  select count(*),
         count(*) filter (where total < p_total),
         count(*) filter (where total = p_total)
    into v_n, v_lower, v_equal
    from submissions
   where (p_location is null or location = p_location)
     and (p_key is null or occupation_key = p_key)
     and (p_prefix is null or occupation_code like p_prefix || '%');

  if v_n < p_min then
    return jsonb_build_object('n', v_n);
  end if;

  return (
    with pool as (
      select total, breakdown
        from submissions
       where (p_location is null or location = p_location)
         and (p_key is null or occupation_key = p_key)
         and (p_prefix is null or occupation_code like p_prefix || '%')
    ),
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
      'p25', (select round((percentile_cont(0.25) within group (order by total))::numeric) from pool),
      'median', (select round((percentile_cont(0.5) within group (order by total))::numeric) from pool),
      'p75', (select round((percentile_cont(0.75) within group (order by total))::numeric) from pool),
      'mean', (select round(m) from mean),
      'meanPercentile', (
        select round(100.0 * (count(*) filter (where pool.total < mean.m) + 0.5 * count(*) filter (where pool.total = mean.m)) / count(*))
          from pool, mean
      ),
      'scoreHist', (
        select jsonb_agg(coalesce(h.c, 0) order by b.i)
          from generate_series(0, 95) as b(i)
          left join (select least(total / 10, 95) as bin, count(*) as c from pool group by 1) h on h.bin = b.i
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

