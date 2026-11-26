-- Ads follow the same link-safety rule as stories: an ad whose click-through link points at a
-- blocked domain (or a subdomain of one) can't be approved, however the approval is made.

create or replace function public.url_host(p_url text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(lower(substring(p_url from '^https?://([^/:?#]+)')), '^www\.', '')
$$;

create or replace function public.ad_bookings_link_safety() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  bad text;
begin
  if new.approved then
    select b.domain into bad
    from public.blocked_domains b
    where public.url_host(new.click_url) = b.domain or public.url_host(new.click_url) like '%.' || b.domain
    limit 1;
    if bad is not null then
      raise exception 'the click-through link goes to a blocked domain: %', bad using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger ad_bookings_link_safety before insert or update on public.ad_bookings
  for each row execute function public.ad_bookings_link_safety();
