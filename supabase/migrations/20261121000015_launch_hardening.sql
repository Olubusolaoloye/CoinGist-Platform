-- Launch hardening from Supabase's advisors.

-- Trigger-only function from the ad link-safety check: never called directly.
revoke execute on function public.ad_bookings_link_safety() from public, anon, authenticated;

-- Indexes for foreign keys (joins on them, and deletes of the rows they point at, stay fast).
create index if not exists ad_bookings_sponsor_idx on public.ad_bookings (sponsor_id);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id);
create index if not exists blocked_domains_added_by_idx on public.blocked_domains (added_by);
create index if not exists bookmarks_post_idx on public.bookmarks (post_id);
create index if not exists categories_parent_idx on public.categories (parent_id);
create index if not exists editorial_comments_author_idx on public.editorial_comments (author_id);
create index if not exists editorial_comments_parent_idx on public.editorial_comments (parent_id);
create index if not exists editorial_comments_resolved_by_idx on public.editorial_comments (resolved_by);
create index if not exists post_revisions_editor_idx on public.post_revisions (editor_id);
create index if not exists posts_approved_by_idx on public.posts (approved_by);
create index if not exists posts_sponsor_idx on public.posts (sponsor_id);
create index if not exists sponsored_orders_created_by_idx on public.sponsored_orders (created_by);
create index if not exists sponsored_orders_post_idx on public.sponsored_orders (post_id);
create index if not exists sponsored_orders_sponsor_idx on public.sponsored_orders (sponsor_id);
