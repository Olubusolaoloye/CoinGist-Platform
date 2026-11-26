-- Hardening from Supabase's security advisor.

-- Pin search_path on the remaining trigger functions.
alter function public.set_updated_at() set search_path = '';
alter function public.audit_logs_immutable() set search_path = '';
alter function public.posts_before_update() set search_path = '';
alter function public.posts_set_updated_at() set search_path = '';
alter function public.posts_featured_guard() set search_path = '';

-- Trigger-only functions are never called directly. (Triggers fire regardless of EXECUTE.)
revoke execute on function public.ad_bookings_no_overlap() from public, anon, authenticated;
revoke execute on function public.bookmarks_guard() from public, anon, authenticated;
revoke execute on function public.follows_guard() from public, anon, authenticated;
revoke execute on function public.posts_approval_rules() from public, anon, authenticated;
revoke execute on function public.posts_complete_orders() from public, anon, authenticated;
revoke execute on function public.sponsored_orders_guard() from public, anon, authenticated;
revoke execute on function public.writer_payments_guard() from public, anon, authenticated;
revoke execute on function public.ai_usage_mark_post() from public, anon, authenticated;

-- Role helpers are only used by policies for signed-in users; signed-out visitors don't need them.
revoke execute on function public.current_app_role() from public, anon;
revoke execute on function public.staff_at_least(public.user_role) from public, anon;
revoke execute on function public.can_view_post_internal(uuid) from public, anon;
revoke execute on function public.can_edit_post(uuid) from public, anon;
grant execute on function public.current_app_role() to authenticated, service_role;
grant execute on function public.staff_at_least(public.user_role) to authenticated, service_role;
grant execute on function public.can_view_post_internal(uuid) to authenticated, service_role;
grant execute on function public.can_edit_post(uuid) to authenticated, service_role;
