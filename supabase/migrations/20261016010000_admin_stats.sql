-- One call that returns every number on the internal admin dashboard. Only the admin edge function (service role)
-- can run it, and that function checks who is asking. Nothing here returns a device hash or an id.

create function public.admin_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select total, breakdown, created_at, location, occupation, occupation_code,
           (input->>'age')::int as age,
           input->>'english' as english,
           (input->>'experienceYears')::int as exp,
           input->>'education' as education,
           (input->>'skillLevel')::int as skill,
           (input->>'partnerQualifies')::boolean as partner,
           (input->>'annualEarnings')::numeric as earn
      from submissions
  ),
  cuts as (
    select 'location' as d, location as k, total from s
    union all select 'english', english, total from s
    union all select 'education', education, total from s
    union all select 'skill', skill::text, total from s
    union all select 'partner', case when partner then 'yes' else 'no' end, total from s
    union all select 'experience',
      case when exp >= 9 then '9' when exp >= 6 then '6' when exp >= 4 then '4' when exp >= 2 then '2'
           when exp >= 1 then '1' else '0' end, total from s
    union all select 'age',
      case when age < 25 then '18-24' when age < 33 then '25-32' when age < 40 then '33-39'
           when age < 45 then '40-44' else '45+' end, total from s
    union all select 'earnings',
      case when earn = 0 then '0' when earn < 80000 then '1-79,999' when earn < 100000 then '80,000-99,999'
           when earn < 130000 then '100,000-129,999' when earn < 170000 then '130,000-169,999'
           else '170,000+' end, total from s
  ),
  cut_rows as (
    select d, k, count(*) as n,
           round((percentile_cont(0.5) within group (order by total))::numeric) as median,
           round(avg(total)) as avg
      from cuts group by d, k
  ),
  parts as (
    select e->>'key' as k, (e->>'points')::numeric as pts, (e->>'max')::numeric as mx, s.total
      from s, jsonb_array_elements(s.breakdown) e
  ),
  q as (
    select percentile_cont(0.75) within group (order by total) as p75 from s
  ),
  top_gap as (
    select p.k,
           round(avg(p.pts) filter (where p.total >= q.p75), 1) as top,
           round(avg(p.pts) filter (where p.total < q.p75), 1) as rest,
           max(p.mx) as mx
      from parts p, q group by p.k
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'totals', (select jsonb_build_object(
        'n', count(*),
        'last24h', count(*) filter (where created_at > now() - interval '24 hours'),
        'last7d', count(*) filter (where created_at > now() - interval '7 days'),
        'first', min(created_at), 'last', max(created_at),
        'withCode', count(*) filter (where occupation_code is not null)) from s),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', g.day, 'n', coalesce(c.n, 0)) order by g.day), '[]'::jsonb)
        from generate_series((now() at time zone 'Australia/Melbourne')::date - 29,
                             (now() at time zone 'Australia/Melbourne')::date, interval '1 day') as g(day)
        left join (select (created_at at time zone 'Australia/Melbourne')::date as day, count(*) as n
                     from s group by 1) c on c.day = g.day::date),
    'score', (select jsonb_build_object(
        'min', min(total), 'max', max(total), 'mean', round(avg(total)), 'sd', round(stddev_samp(total)),
        'p10', round((percentile_cont(0.1) within group (order by total))::numeric),
        'p25', round((percentile_cont(0.25) within group (order by total))::numeric),
        'median', round((percentile_cont(0.5) within group (order by total))::numeric),
        'p75', round((percentile_cont(0.75) within group (order by total))::numeric),
        'p90', round((percentile_cont(0.9) within group (order by total))::numeric)) from s),
    'hist', (select jsonb_agg(coalesce(h.c, 0) order by b.i)
        from generate_series(0, 95) as b(i)
        left join (select least(total / 10, 95) as bin, count(*) as c from s group by 1) h on h.bin = b.i),
    'cuts', (select jsonb_object_agg(d, rows) from (
        select d, jsonb_agg(jsonb_build_object('k', k, 'n', n, 'median', median, 'avg', avg) order by n desc) as rows
          from cut_rows group by d) x),
    'sections', (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
        select k, jsonb_build_object(
            'max', max(mx), 'avg', round(avg(pts), 1),
            'median', round((percentile_cont(0.5) within group (order by pts))::numeric),
            'atMax', count(*) filter (where pts = mx), 'n', count(*),
            'dist', (select jsonb_agg(jsonb_build_object('points', pp, 'n', c) order by pp)
                       from (select pts as pp, count(*) as c from parts p2 where p2.k = parts.k group by pts) z)
          ) as v
          from parts group by k) y),
    'gap', (select coalesce(jsonb_agg(jsonb_build_object('key', k, 'top', top, 'rest', rest, 'max', mx) order by (top - rest) desc), '[]'::jsonb) from top_gap),
    'occupations', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'n', n, 'median', med) order by n desc, name), '[]'::jsonb) from (
        select occupation_code as code, max(occupation) as name, count(*) as n,
               round((percentile_cont(0.5) within group (order by total))::numeric) as med
          from s where occupation_code is not null group by occupation_code order by n desc, max(occupation) limit 30) t),
    'occupationGroups', (select coalesce(jsonb_agg(jsonb_build_object('group', g, 'n', n, 'median', med) order by n desc), '[]'::jsonb) from (
        select left(occupation_code, 1) as g, count(*) as n,
               round((percentile_cont(0.5) within group (order by total))::numeric) as med
          from s where occupation_code is not null group by 1) t),
    'feedback', jsonb_build_object(
        'count', (select count(*) from feedback),
        'items', (select coalesce(jsonb_agg(jsonb_build_object('at', created_at, 'lang', lang, 'message', message) order by created_at desc), '[]'::jsonb)
                    from (select created_at, lang, message from feedback order by created_at desc limit 100) f)),
    'support', (select coalesce(jsonb_agg(jsonb_build_object('event', event, 'devices', devices, 'times', times)), '[]'::jsonb) from (
        select event, count(*) as devices, sum(count) as times from support_events group by event) e)
  );
$$;

revoke all on function public.admin_stats() from public, anon, authenticated;
grant execute on function public.admin_stats() to service_role;
