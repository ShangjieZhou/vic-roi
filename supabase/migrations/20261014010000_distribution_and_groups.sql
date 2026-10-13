-- More data for the analysis page.
--
-- * scoreHist: how many candidates fall in each 10-point band of the total (96 bands, 0 to 950), for the
--   distribution graph under each ranking.
-- * Occupation groups follow the ANZSCO code. The comparison uses the narrowest level that holds at least 5
--   candidates: the exact occupation (6 digits), then its unit group (4), minor group (3) and sub-major group (2).
--   When no level reaches 5, it uses the narrowest level with at least 2. Free text keeps matching on its own text.
--   The result says which level it used (level) and the code prefix that defines the group (prefix).
-- * topOccupations: the 10 listed occupations with the most candidates (at least 2), with their median score.

drop function public.pool_stats(text, text, text, integer, jsonb, integer);

create function public.pool_stats(
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
      'median', (select round((percentile_cont(0.5) within group (order by total))::numeric) from pool),
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

revoke all on function public.pool_stats(text, text, text, integer, jsonb, integer) from public, anon, authenticated;
grant execute on function public.pool_stats(text, text, text, integer, jsonb, integer) to service_role;

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
    -- The narrowest ANZSCO level with enough candidates, first asking for 5 and then for 2.
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
      select coalesce(jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name, 'n', t.n, 'median', t.med) order by t.n desc, t.name), '[]'::jsonb)
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
