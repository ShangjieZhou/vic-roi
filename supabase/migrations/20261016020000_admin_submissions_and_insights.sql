-- Admin dashboard: the shared comparison function, the second page (submission list) and nothing public.

-- Shared by the public result page and the admin ranking simulator. Given a score, where the candidate is and
-- optionally an occupation and a breakdown, it returns the comparison against the stored submissions. The candidate
-- need not be stored. get_insights now calls it with a stored row, so the public result is unchanged.

create function public.compute_insights(
  p_total integer, p_location text, p_occupation text, p_occupation_code text, p_occupation_key text, p_breakdown jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  occ jsonb := null;
  v_level integer := null;
  v_len integer;
  v_min integer;
  v_n integer;
begin
  if p_occupation_code is not null then
    foreach v_min in array array[5, 2] loop
      foreach v_len in array array[6, 4, 3, 2] loop
        select count(*) into v_n from submissions where left(occupation_code, v_len) = left(p_occupation_code, v_len);
        if v_n >= v_min then
          v_level := v_len;
          exit;
        end if;
      end loop;
      exit when v_level is not null;
    end loop;
    v_level := coalesce(v_level, 6);
    occ := jsonb_build_object(
             'name', p_occupation, 'code', p_occupation_code,
             'level', v_level, 'prefix', left(p_occupation_code, v_level)
           )
           || pool_stats(null, left(p_occupation_code, v_level), null, p_total, p_breakdown, 2);
  elsif p_occupation_key is not null then
    occ := jsonb_build_object('name', p_occupation, 'code', null, 'level', null, 'prefix', null)
           || pool_stats(p_occupation_key, null, null, p_total, p_breakdown, 2);
  end if;

  return jsonb_build_object(
    'total', p_total,
    'location', p_location,
    'overall', pool_stats(null, null, null, p_total, p_breakdown, 10),
    'locationGroup', pool_stats(null, null, p_location, p_total, p_breakdown, 2),
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

revoke all on function public.compute_insights(integer, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.compute_insights(integer, text, text, text, text, jsonb) to service_role;

-- The public result page reads through compute_insights, with the same answer as before.
create or replace function public.get_insights(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me submissions%rowtype;
begin
  select * into me from submissions where id = p_id;
  if not found then
    return null;
  end if;
  return public.compute_insights(me.total, me.location, me.occupation, me.occupation_code, me.occupation_key, me.breakdown);
end;
$$;

-- One page of submissions for the admin list. p_filters is an object with any of:
--   ageMin ageMax scoreMin scoreMax incomeMin incomeMax occupation (text, matches the name or the start of the code)
--   english[] education[] experience[] (band codes 0 1 2 4 6 9) location[] partner ('yes' or 'no')
-- p_sort is an array of { f: 'total' | 'age' | 'income', d: 'asc' | 'desc' }, applied in the order given.
-- Returns { total: how many match, rows: [...] }. The device hash is never returned.
create function public.admin_submissions(p_filters jsonb, p_sort jsonb, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_order text := '';
  v_seen text[] := '{}';
  v_item jsonb;
  v_col text;
  v_dir text;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  p_filters := coalesce(p_filters, '{}'::jsonb);
  for v_item in select * from jsonb_array_elements(case when jsonb_typeof(p_sort) = 'array' then p_sort else '[]'::jsonb end) loop
    v_col := case v_item->>'f' when 'total' then 'total' when 'age' then 'age' when 'income' then 'income' end;
    v_dir := case lower(coalesce(v_item->>'d', 'desc')) when 'asc' then 'asc' else 'desc' end;
    if v_col is not null and not (v_col = any(v_seen)) and array_length(v_seen, 1) is distinct from 3 then
      v_seen := v_seen || v_col;
      v_order := v_order || format('%s %s nulls last, ', v_col, v_dir);
    end if;
  end loop;
  v_order := v_order || 'created_at desc, id';

  execute format($q$
    with f as (
      select * from (
        select id, created_at, total, breakdown, location, occupation, occupation_code,
               (input->>'age')::int as age,
               input->>'english' as english,
               (input->>'experienceYears')::int as exp,
               case when (input->>'experienceYears')::int >= 9 then '9' when (input->>'experienceYears')::int >= 6 then '6'
                    when (input->>'experienceYears')::int >= 4 then '4' when (input->>'experienceYears')::int >= 2 then '2'
                    when (input->>'experienceYears')::int >= 1 then '1' else '0' end as expband,
               input->>'education' as education,
               (input->>'skillLevel')::int as skill,
               (input->>'partnerQualifies')::boolean as partner,
               (input->>'annualEarnings')::numeric as income
          from submissions
      ) s
      where (($1->>'ageMin') is null or age >= ($1->>'ageMin')::int)
        and (($1->>'ageMax') is null or age <= ($1->>'ageMax')::int)
        and (($1->>'scoreMin') is null or total >= ($1->>'scoreMin')::int)
        and (($1->>'scoreMax') is null or total <= ($1->>'scoreMax')::int)
        and (($1->>'incomeMin') is null or income >= ($1->>'incomeMin')::numeric)
        and (($1->>'incomeMax') is null or income <= ($1->>'incomeMax')::numeric)
        and (coalesce($1->>'occupation', '') = ''
             or occupation ilike '%%' || replace(replace(replace($1->>'occupation', '\', '\\'), '%%', '\%%'), '_', '\_') || '%%'
             or occupation_code like replace(replace(replace($1->>'occupation', '\', '\\'), '%%', '\%%'), '_', '\_') || '%%')
        and (jsonb_typeof($1->'english') is distinct from 'array' or english in (select jsonb_array_elements_text($1->'english')))
        and (jsonb_typeof($1->'education') is distinct from 'array' or education in (select jsonb_array_elements_text($1->'education')))
        and (jsonb_typeof($1->'experience') is distinct from 'array' or expband in (select jsonb_array_elements_text($1->'experience')))
        and (jsonb_typeof($1->'location') is distinct from 'array' or location in (select jsonb_array_elements_text($1->'location')))
        and (($1->>'partner') is null or partner = (($1->>'partner') = 'yes'))
    )
    select jsonb_build_object(
      'total', (select count(*) from f),
      'rows', (select coalesce(jsonb_agg(r order by ord), '[]'::jsonb) from (
        select row_number() over (order by %1$s) as ord,
               jsonb_build_object(
                 'id', id, 'at', created_at, 'total', total, 'age', age, 'english', english, 'experience', exp,
                 'education', education, 'skill', skill, 'partner', partner, 'income', income, 'location', location,
                 'occupation', occupation, 'code', occupation_code, 'breakdown', breakdown) as r
          from f order by %1$s limit %2$s offset %3$s) x)
    )
  $q$, v_order, v_limit, v_offset) into v_result using p_filters;

  return v_result;
end;
$$;

revoke all on function public.admin_submissions(jsonb, jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_submissions(jsonb, jsonb, integer, integer) to service_role;

-- Submissions over time for the overview chart, in Melbourne time. Ranges and their buckets:
--   '1h' 60 one-minute bars, '24h' 24 one-hour bars, '7d' 42 four-hour bars, '30d' 30 one-day bars.
-- The last bar is the bucket that holds the current moment. Bucket starts are local times like 2026-10-16T14:30.
create function public.admin_timeline(p_range text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_width interval;
  v_count integer;
  v_origin constant timestamp := '2026-01-01 00:00';
  v_now timestamp := now() at time zone 'Australia/Melbourne';
  v_end timestamp;
begin
  select w, c into v_width, v_count from (values
    ('1h', interval '1 minute', 60), ('24h', interval '1 hour', 24),
    ('7d', interval '4 hours', 42), ('30d', interval '1 day', 30)) as r(k, w, c)
   where k = p_range;
  if v_width is null then
    return null;
  end if;
  v_end := date_bin(v_width, v_now, v_origin);

  return jsonb_build_object(
    'range', p_range,
    'bucket', extract(epoch from v_width)::int,
    'total', (select count(*) from submissions where created_at >= (v_end - (v_count - 1) * v_width) at time zone 'Australia/Melbourne'),
    'series', (
      select jsonb_agg(jsonb_build_object('t', to_char(g.t, 'YYYY-MM-DD"T"HH24:MI'), 'n', coalesce(c.n, 0)) order by g.t)
        from generate_series(v_end - (v_count - 1) * v_width, v_end, v_width) as g(t)
        left join (
          select date_bin(v_width, created_at at time zone 'Australia/Melbourne', v_origin) as t, count(*) as n
            from submissions
           where created_at >= (v_end - (v_count - 1) * v_width) at time zone 'Australia/Melbourne'
           group by 1) c on c.t = g.t
    )
  );
end;
$$;

revoke all on function public.admin_timeline(text) from public, anon, authenticated;
grant execute on function public.admin_timeline(text) to service_role;
