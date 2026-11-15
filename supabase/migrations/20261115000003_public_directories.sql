-- Public, column-limited views for data the public site needs but whose base tables are private.

-- Sponsor name/website for disclosure labels. Only sponsors attached to live content.
create view public.sponsor_directory with (security_barrier) as
  select s.id, s.name, s.website
  from public.sponsors s
  where exists (
    select 1 from public.posts p
    where p.sponsor_id = s.id and p.status = 'published' and p.published_at <= now()
  )
  or exists (
    select 1 from public.ad_bookings b
    where b.sponsor_id = s.id and b.approved and now() >= b.starts_at and now() < b.ends_at
  );

revoke all on public.sponsor_directory from anon, authenticated;
grant select on public.sponsor_directory to anon, authenticated;
