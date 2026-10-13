-- One submission per device. A device that wants to submit again must withdraw its current submission, which
-- deletes it. This keeps the pool close to one real answer per person, so random fake scores are harder to add.
--
-- The check, the deletion and the insert happen in one function under a lock for the device, so two requests
-- arriving together cannot leave the device with two submissions.
--
-- Returns jsonb:
--   { status: 'exists',  existing: { id, total, createdAt } }   the device already has one and replace was not asked for
--   { status: 'created', id, replaced: [ids] }                   saved, with the ids of any submission it replaced

drop function public.create_submission(text, integer, jsonb, text, integer, jsonb, text, text, text, text);

create function public.create_submission(
  p_device_hash text,
  p_replace boolean,
  p_input jsonb,
  p_location text,
  p_total integer,
  p_breakdown jsonb,
  p_occupation text,
  p_occupation_key text,
  p_occupation_code text,
  p_occupation_group text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing record;
  v_id uuid;
  v_replaced uuid[];
begin
  perform pg_advisory_xact_lock(hashtextextended(p_device_hash, 0));

  select id, total, created_at into v_existing
    from submissions
   where device_hash = p_device_hash
   order by created_at
   limit 1;

  if found then
    if not p_replace then
      return jsonb_build_object(
        'status', 'exists',
        'existing', jsonb_build_object('id', v_existing.id, 'total', v_existing.total, 'createdAt', v_existing.created_at)
      );
    end if;

    with gone as (delete from submissions where device_hash = p_device_hash returning id)
    select array_agg(id) into v_replaced from gone;
  end if;

  insert into submissions (
    input, location, total, breakdown,
    occupation, occupation_key, occupation_code, occupation_group, device_hash
  ) values (
    p_input, p_location, p_total, p_breakdown,
    p_occupation, p_occupation_key, p_occupation_code, p_occupation_group, p_device_hash
  ) returning id into v_id;

  return jsonb_build_object('status', 'created', 'id', v_id, 'replaced', to_jsonb(coalesce(v_replaced, '{}'::uuid[])));
end;
$$;

revoke all on function public.create_submission(text, boolean, jsonb, text, integer, jsonb, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_submission(text, boolean, jsonb, text, integer, jsonb, text, text, text, text)
  to service_role;
