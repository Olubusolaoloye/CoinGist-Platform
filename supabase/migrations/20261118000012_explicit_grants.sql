-- Explicit table and function privileges.
--
-- Newer Supabase projects no longer give anon/authenticated/service_role access to tables that
-- migrations create, and functions aren't executable by PUBLIC. Grant exactly what each role
-- needs; row-level security still decides which rows they see. (On older projects, which grant
-- everything by default and were narrowed by earlier migrations, these grants change nothing.)

-- The backend's privileged role (scheduler, newsletter sync, server-side lookups). Bypasses RLS.
grant select, insert, update, delete on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Public reading (signed out and signed in). RLS limits rows to published/live content.
grant select on public.categories, public.tags, public.posts, public.post_tags,
  public.ad_slots, public.ad_bookings to anon, authenticated;

-- Signed-in users. Policies limit each table to its owners / staff roles.
grant select on public.users, public.author_profiles, public.sponsors, public.post_revisions,
  public.editorial_comments, public.sponsored_orders, public.subscribers, public.bookmarks,
  public.follows, public.reactions, public.writer_payments, public.audit_logs,
  public.blocked_domains, public.ai_usage to authenticated;

grant insert, update, delete on public.author_profiles, public.categories, public.tags,
  public.sponsors, public.sponsored_orders, public.ad_slots, public.subscribers,
  public.blocked_domains to authenticated;
grant insert, delete on public.post_tags, public.editorial_comments, public.ad_bookings,
  public.bookmarks, public.follows, public.reactions to authenticated;
grant update on public.post_tags to authenticated;
grant delete on public.posts to authenticated;
-- Column-limited writes (posts, comments, ad bookings, payments, AI usage, users) were granted
-- by the earlier migrations that defined them.

-- Functions that signed-in users' queries call directly (policies, triggers that run as the
-- caller, and RPCs). Each checks the caller's role itself.
grant execute on function public.is_mfa(), public.is_service_role() to authenticated;
grant execute on function public.link_hosts(jsonb), public.vetting_complete(jsonb) to authenticated;
