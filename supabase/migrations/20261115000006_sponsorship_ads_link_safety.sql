-- Step 6: link safety, the sponsored order pipeline, and ad bookings.

-- ─── Link safety ────────────────────────────────────────────────────────────
-- Domains editors have flagged (scams, phishing, fake exchanges). Subdomains are blocked too.
create table public.blocked_domains (
  domain     text primary key check (domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$'),
  reason     text not null check (length(reason) between 1 and 300),
  added_by   uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.blocked_domains enable row level security;
create policy blocked_domains_select on public.blocked_domains for select to authenticated
  using (public.staff_at_least('writer'));
create policy blocked_domains_manage on public.blocked_domains for all to authenticated
  using (public.staff_at_least('editor')) with check (public.staff_at_least('editor'));

-- Hostnames (lowercase, without "www.") of every http(s) link in a Tiptap document.
create or replace function public.link_hosts(doc jsonb) returns setof text
language sql immutable set search_path = '' as $$
  select distinct regexp_replace(lower(substring(href from '^https?://([^/:?#]+)')), '^www\.', '')
  from (
    select h #>> '{}' as href
    from jsonb_path_query(doc, 'lax $.** ? (@.type == "link").attrs.href') as h
  ) links
  where href ~* '^https?://'
$$;

-- Links in a post (and its sponsor's website) that hit the blocklist.
create or replace function public.post_blocked_links(p_post_id uuid)
returns table (host text, domain text, reason text)
language sql stable security definer set search_path = '' as $$
  with hosts as (
    select public.link_hosts(p.body_json) as host from public.posts p where p.id = p_post_id
    union
    select regexp_replace(lower(substring(s.website from '^https?://([^/:?#]+)')), '^www\.', '')
    from public.posts p join public.sponsors s on s.id = p.sponsor_id
    where p.id = p_post_id and s.website is not null
  )
  select h.host, b.domain, b.reason
  from hosts h join public.blocked_domains b
    on h.host = b.domain or h.host like '%.' || b.domain
  order by h.host
$$;
revoke execute on function public.post_blocked_links(uuid) from public, anon;
grant execute on function public.post_blocked_links(uuid) to authenticated;

-- ─── Sponsored orders ───────────────────────────────────────────────────────
-- The vetting checklist has a fixed set of items; an order can't be accepted until all are true.
create or replace function public.vetting_complete(checklist jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(bool_and(coalesce((checklist ->> item)::boolean, false)), false)
  from unnest(array[
    'identity_verified', 'regulatory_status_checked', 'no_guaranteed_returns',
    'links_scanned', 'disclosure_agreed', 'payment_terms_agreed'
  ]) as item
$$;

alter table public.sponsored_orders
  add column notes text check (length(notes) <= 5000),
  add constraint sponsored_orders_currency check (currency ~ '^[A-Z]{3}$');

create or replace function public.sponsored_orders_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  allowed boolean;
begin
  if tg_op = 'INSERT' then
    if new.status not in ('inquiry', 'vetting') then
      raise exception 'new orders start as an inquiry or in vetting' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    allowed := (old.status, new.status) in (
      ('inquiry', 'vetting'), ('inquiry', 'rejected'),
      ('vetting', 'accepted'), ('vetting', 'rejected'),
      ('rejected', 'vetting'),
      ('accepted', 'in_production'), ('accepted', 'rejected'),
      ('in_production', 'published')
    );
    if not allowed then
      raise exception 'an order can''t move from % to %', old.status, new.status using errcode = 'P0001';
    end if;
    if new.status = 'accepted' and not public.vetting_complete(new.vetting_checklist) then
      raise exception 'complete every vetting item before accepting the order' using errcode = 'P0001';
    end if;
    insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
    values ((select auth.uid()), 'sponsored_order.status_changed', 'sponsored_orders', new.id::text,
            jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end $$;

create trigger sponsored_orders_guard before insert or update on public.sponsored_orders
  for each row execute function public.sponsored_orders_guard();

-- ─── Approval rules (enforced for every approval, however it's made) ────────
create or replace function public.posts_approval_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  bad text;
begin
  if new.status = 'approved' and old.status = 'in_review' then
    select string_agg(distinct domain, ', ') into bad from public.post_blocked_links(new.id);
    if bad is not null then
      raise exception 'links to blocked domains: %', bad using errcode = 'P0001';
    end if;
    if new.is_sponsored and not exists (
      select 1 from public.sponsored_orders o
      where o.post_id = new.id and o.sponsor_id = new.sponsor_id
        and o.status in ('accepted', 'in_production', 'published')
    ) then
      raise exception 'sponsored stories need an accepted order for this sponsor linked to them'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger posts_approval_rules before update of status on public.posts
  for each row when (old.status is distinct from new.status)
  execute function public.posts_approval_rules();

-- Publishing a sponsored story completes its order.
create or replace function public.posts_complete_orders() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.sponsored_orders set status = 'in_production'
  where post_id = new.id and status = 'accepted';
  update public.sponsored_orders set status = 'published'
  where post_id = new.id and status = 'in_production';
  return null;
end $$;

create trigger posts_complete_orders after update of status on public.posts
  for each row when (new.status = 'published' and old.status is distinct from 'published' and new.is_sponsored)
  execute function public.posts_complete_orders();

-- ─── Ads ────────────────────────────────────────────────────────────────────
alter table public.ad_bookings
  add column clicks int not null default 0 check (clicks >= 0),
  add constraint ad_bookings_creative_https check (creative_url ~ '^https://' or creative_url ~ '^/[^/]'),
  add constraint ad_bookings_click_https check (click_url ~ '^https://');

-- Approved bookings for the same slot can't overlap.
create or replace function public.ad_bookings_no_overlap() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.approved and exists (
    select 1 from public.ad_bookings b
    where b.slot_id = new.slot_id and b.id <> new.id and b.approved
      and b.starts_at < new.ends_at and new.starts_at < b.ends_at
  ) then
    raise exception 'this slot already has an approved booking for those dates' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger ad_bookings_no_overlap before insert or update on public.ad_bookings
  for each row execute function public.ad_bookings_no_overlap();

-- Counts a click on a live booking and returns where to send the reader (null if not live).
create or replace function public.record_ad_click(p_booking_id uuid) returns text
language sql volatile security definer set search_path = '' as $$
  update public.ad_bookings set clicks = clicks + 1
  where id = p_booking_id and approved and now() >= starts_at and now() < ends_at
  returning click_url
$$;
revoke execute on function public.record_ad_click(uuid) from public;
grant execute on function public.record_ad_click(uuid) to anon, authenticated;

-- Clicks are only changed through record_ad_click(). (A column-level revoke doesn't override
-- Supabase's table-wide grant, so re-grant the editable columns explicitly.)
revoke update on public.ad_bookings from anon, authenticated;
grant update (slot_id, sponsor_id, starts_at, ends_at, creative_url, click_url, alt_text, approved)
  on public.ad_bookings to authenticated;

-- Standard slots. Sizes fix the aspect ratio, so the page reserves the space (no layout shift).
insert into public.ad_slots (key, name, placement, width, height) values
  ('home-banner', 'Home page banner', 'home', 1200, 250),
  ('article-end', 'End of article', 'article', 1200, 400),
  ('newsletter-daily-gist', 'Daily Gist newsletter sponsor', 'newsletter', 600, 200),
  ('newsletter-weekly-wrap', 'Weekly Wrap newsletter sponsor', 'newsletter', 600, 200)
on conflict (key) do nothing;
