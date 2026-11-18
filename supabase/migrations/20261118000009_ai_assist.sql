-- AI assist: a log of every AI request (for daily limits, cost tracking and disclosure).
-- Using AI on a story marks it ai_assisted (sticky; shown to readers).

create table public.ai_usage (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  feature       text not null check (feature in ('outline', 'draft', 'gist', 'seo', 'repurpose', 'claims', 'trending')),
  post_id       uuid references public.posts (id) on delete set null,
  provider      text not null check (provider in ('claude', 'offline')),
  model         text check (length(model) <= 100),
  input_tokens  int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  created_at    timestamptz not null default now()
);
create index ai_usage_user_day_idx on public.ai_usage (user_id, created_at desc);
create index ai_usage_post_idx on public.ai_usage (post_id, created_at desc) where post_id is not null;

alter table public.ai_usage enable row level security;
-- You see your own usage; editors see usage on any story (to know what AI touched); admins see all.
create policy ai_usage_select on public.ai_usage for select to authenticated
  using (
    (user_id = (select auth.uid()) and public.staff_at_least('writer'))
    or (post_id is not null and public.staff_at_least('editor'))
    or public.staff_at_least('admin')
  );
-- Staff log their own requests, and only against stories they can see.
create policy ai_usage_insert on public.ai_usage for insert to authenticated
  with check (
    user_id = (select auth.uid()) and public.staff_at_least('writer')
    and (post_id is null or public.can_view_post_internal(post_id))
  );
revoke insert, update, delete on public.ai_usage from anon, authenticated;
grant insert (user_id, feature, post_id, provider, model, input_tokens, output_tokens) on public.ai_usage to authenticated;

-- AI used on a story => the story is AI-assisted (the posts trigger keeps the flag sticky).
create or replace function public.ai_usage_mark_post() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.post_id is not null then
    update public.posts set ai_assisted = true where id = new.post_id and not ai_assisted;
  end if;
  return null;
end $$;
revoke execute on function public.ai_usage_mark_post() from public, anon, authenticated;

create trigger ai_usage_mark_post after insert on public.ai_usage
  for each row execute function public.ai_usage_mark_post();

-- Flagging a story as AI-assisted isn't an edit: don't move its updated_at (which orders the
-- review queue and the "stalled" list).
create or replace function public.posts_set_updated_at() returns trigger
language plpgsql as $$
begin
  -- (search is a generated column: not yet computed in a BEFORE trigger, so leave it out.)
  if (to_jsonb(new) - 'ai_assisted' - 'updated_at' - 'search') = (to_jsonb(old) - 'ai_assisted' - 'updated_at' - 'search') then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger posts_updated_at on public.posts;
create trigger posts_updated_at before update on public.posts
  for each row execute function public.posts_set_updated_at();
