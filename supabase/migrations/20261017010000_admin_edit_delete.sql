-- Admin dashboard: delete a submission, or replace its answers. Only the admin edge function (service role) can call
-- these. The edge function recomputes the score and breakdown on the server before an update.

-- True when a row was deleted. Deleting also frees that device to submit again.
create function public.admin_delete_submission(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from submissions where id = p_id;
  return found;
end;
$$;

-- True when a row was updated. The occupation columns change only when p_set_occupation is true, so an edit that
-- leaves the occupation alone keeps whatever the candidate entered, including free text. The device, the time of
-- submission and the id never change.
create function public.admin_update_submission(
  p_id uuid, p_input jsonb, p_total integer, p_breakdown jsonb, p_location text,
  p_set_occupation boolean, p_occupation text, p_occupation_key text, p_occupation_code text, p_occupation_group text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update submissions
     set input = p_input,
         total = p_total,
         breakdown = p_breakdown,
         location = p_location,
         occupation = case when p_set_occupation then p_occupation else occupation end,
         occupation_key = case when p_set_occupation then p_occupation_key else occupation_key end,
         occupation_code = case when p_set_occupation then p_occupation_code else occupation_code end,
         occupation_group = case when p_set_occupation then p_occupation_group else occupation_group end
   where id = p_id;
  return found;
end;
$$;

revoke all on function public.admin_delete_submission(uuid) from public, anon, authenticated;
revoke all on function public.admin_update_submission(uuid, jsonb, integer, jsonb, text, boolean, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_delete_submission(uuid) to service_role;
grant execute on function public.admin_update_submission(uuid, jsonb, integer, jsonb, text, boolean, text, text, text, text) to service_role;
