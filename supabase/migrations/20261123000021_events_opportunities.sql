-- Events (conferences, meetups, online sessions) and Opportunities (airdrops, grants, hackathons,
-- bounties), managed in Studio. Writers draft; editors publish. Opportunities can't be published
-- until an editor confirms the safety checklist, and no listing can link to a blocked domain.

create table public.listings (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('event', 'opportunity')),
  -- For opportunities: airdrop | grant | hackathon | bounty | other. For events: conference | meetup | online | other.
  category      text not null check (category in ('conference', 'meetup', 'online', 'airdrop', 'grant', 'hackathon', 'bounty', 'other')),
  title         text not null check (length(trim(title)) between 3 and 160),
  slug          public.slug not null,
  summary       text not null check (length(trim(summary)) between 10 and 400),
  details       text not null default '' check (length(details) <= 6000),
  url           text not null check (url ~ '^https://' and length(url) <= 1000),
  image_url     text check (image_url is null or image_url ~ '^(https://|/[^/])'),
  image_alt     text check (image_alt is null or length(image_alt) <= 300),
  organizer     text check (organizer is null or length(organizer) <= 160),
  -- Events: when and where. Opportunities: deadline (ends_at) and who can take part (location).
  starts_at     timestamptz,
  ends_at       timestamptz,
  location      text check (location is null or length(location) <= 160),
  is_online     boolean not null default false,
  reward        text check (reward is null or length(reward) <= 200),
  status        text not null default 'draft' check (status in ('draft', 'published')),
  safety_checked boolean not null default false,
  checked_by    uuid references public.users (id) on delete set null,
  checked_at    timestamptz,
  created_by    uuid references public.users (id) on delete set null,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint listings_kind_category check (
    (kind = 'event' and category in ('conference', 'meetup', 'online', 'other'))
    or (kind = 'opportunity' and category in ('airdrop', 'grant', 'hackathon', 'bounty', 'other'))
  ),
  constraint listings_event_dates check (kind <> 'event' or starts_at is not null),
  constraint listings_order check (starts_at is null or ends_at is null or ends_at >= starts_at),
  constraint listings_unique_slug unique (kind, slug)
);
create index listings_public_idx on public.listings (kind, status, starts_at);
create index listings_deadline_idx on public.listings (kind, status, ends_at);
create index listings_created_by_idx on public.listings (created_by);
create index listings_checked_by_idx on public.listings (checked_by);
create trigger listings_updated_at before update on public.listings
  for each row execute function public.set_updated_at();

-- Publishing rules, however the change is made.
create or replace function public.listings_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_bad text;
  v_host text := public.url_host(new.url);
begin
  if new.status = 'published' then
    if not public.staff_at_least('editor') and not public.is_service_role() then
      raise exception 'only editors can publish events and opportunities' using errcode = '42501';
    end if;
    if new.kind = 'opportunity' and not new.safety_checked then
      raise exception 'tick the safety checklist before publishing an opportunity' using errcode = 'P0001';
    end if;
    select b.domain into v_bad from public.blocked_domains b
      where v_host = b.domain or v_host like '%.' || b.domain limit 1;
    if v_bad is not null then
      raise exception 'the link goes to a blocked domain: %', v_bad using errcode = 'P0001';
    end if;
    if tg_op = 'INSERT' or old.status is distinct from 'published' then
      new.published_at := now();
    end if;
  end if;
  -- Only editors may record the safety check, and it's stamped with who and when.
  if new.safety_checked and (tg_op = 'INSERT' or not old.safety_checked) then
    if not public.staff_at_least('editor') and not public.is_service_role() then
      raise exception 'only editors can confirm the safety checklist' using errcode = '42501';
    end if;
    new.checked_by := (select auth.uid());
    new.checked_at := now();
  end if;
  if not new.safety_checked then
    new.checked_by := null;
    new.checked_at := null;
  end if;
  return new;
end $$;
create trigger listings_guard before insert or update on public.listings
  for each row execute function public.listings_guard();
revoke execute on function public.listings_guard() from public, anon, authenticated;

alter table public.listings enable row level security;
create policy listings_select_published on public.listings for select to anon, authenticated
  using (status = 'published');
create policy listings_select_staff on public.listings for select to authenticated
  using (public.staff_at_least('writer'));
create policy listings_insert_staff on public.listings for insert to authenticated
  with check (public.staff_at_least('writer') and created_by = (select auth.uid()));
create policy listings_update_staff on public.listings for update to authenticated
  using (public.staff_at_least('editor') or (created_by = (select auth.uid()) and status = 'draft' and public.staff_at_least('writer')))
  with check (public.staff_at_least('editor') or (created_by = (select auth.uid()) and status = 'draft' and public.staff_at_least('writer')));
create policy listings_delete_editor on public.listings for delete to authenticated
  using (public.staff_at_least('editor') or (created_by = (select auth.uid()) and status = 'draft'));

revoke all on public.listings from anon, authenticated;
grant select on public.listings to anon, authenticated;
grant insert, update, delete on public.listings to authenticated;
grant select, insert, update, delete on public.listings to service_role;
