-- Messages from the feedback box on the analysis page. Only a hash of the anonymous device id is stored, the same
-- hash the submissions use. A device may leave 5 messages in 24 hours. Read them with, for example:
--   select created_at, lang, message from feedback order by created_at desc;

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  device_hash text not null,
  message text not null check (char_length(message) between 1 and 2000),
  lang text not null check (lang in ('en', 'zh')),
  created_at timestamptz not null default now()
);

create index feedback_device_recent on public.feedback (device_hash, created_at desc);

alter table public.feedback enable row level security;

-- Returns false, and saves nothing, when the device has already left 5 messages in the last 24 hours.
create function public.add_feedback(p_device_hash text, p_message text, p_lang text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from feedback where device_hash = p_device_hash and created_at > now() - interval '24 hours') >= 5 then
    return false;
  end if;
  insert into feedback (device_hash, message, lang) values (p_device_hash, p_message, p_lang);
  return true;
end;
$$;

revoke all on function public.add_feedback(text, text, text) from public, anon, authenticated;
grant execute on function public.add_feedback(text, text, text) to service_role;
