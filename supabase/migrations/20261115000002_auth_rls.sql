-- Auth helpers, workflow functions, triggers, and row-level security.
--
-- Security model
--   * The API checks roles on every request. RLS is the second line of defence: it holds even if
--     an API check is missing, or if someone talks to PostgREST directly.
--   * Roles live in public.users (not in JWT claims), so changes apply on the next request.
--   * Staff (writer/editor/admin) privileges only apply on an aal2 session, i.e. after TOTP.
--   * Status, approval and publish columns cannot be written by clients at all (column grants);
--     they only change through public.transition_post(), which enforces the editorial workflow.

-- ─── Helpers ────────────────────────────────────────────────────────────────

-- Role of the calling user, or null if signed out / suspended / deleted.
create or replace function public.current_app_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select u.role from public.users u
  where u.id = (select auth.uid()) and u.status = 'active'
$$;

-- True when the session passed MFA (Supabase sets aal = 'aal2' after a TOTP challenge).
create or replace function public.is_mfa() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
$$;

-- Staff check: role >= min_role AND session is MFA-verified. Use for every staff-only policy.
create or replace function public.staff_at_least(min_role public.user_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_app_role() >= min_role, false)
     and min_role >= 'writer'
     and public.is_mfa()
$$;

create or replace function public.is_service_role() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select auth.jwt()) ->> 'role', '') = 'service_role'
$$;

-- Can the caller see this post in Studio (incl. unpublished)?
create or replace function public.can_view_post_internal(p_post_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.staff_at_least('editor')
      or (public.staff_at_least('writer') and exists (
            select 1 from public.posts p
            where p.id = p_post_id and p.author_id = (select auth.uid())))
$$;

-- Can the caller edit this post's content? Writers: own posts, only while draft/changes_requested.
create or replace function public.can_edit_post(p_post_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.staff_at_least('editor')
      or (public.staff_at_least('writer') and exists (
            select 1 from public.posts p
            where p.id = p_post_id
              and p.author_id = (select auth.uid())
              and p.status in ('draft', 'changes_requested')))
$$;

-- ─── Audit ──────────────────────────────────────────────────────────────────

create or replace function public.log_audit(
  p_action text, p_entity text, p_entity_id text, p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.staff_at_least('writer') or public.is_service_role()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), p_action, p_entity, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
end $$;

-- ─── Auth sync triggers ─────────────────────────────────────────────────────

-- Every Supabase Auth signup gets a public.users row with the default 'reader' role.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.handle_auth_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.users set email = new.email where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_auth_user_email_change();

-- Mirror "has a verified TOTP factor" into users.two_factor_enabled (for Studio UI / reports).
-- Enforcement does NOT rely on this flag; it uses the session's aal claim.
create or replace function public.sync_two_factor() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := coalesce(new.user_id, old.user_id);
begin
  update public.users u
  set two_factor_enabled = exists (
    select 1 from auth.mfa_factors f
    where f.user_id = v_user and f.factor_type::text = 'totp' and f.status::text = 'verified'
  )
  where u.id = v_user;
  return null;
end $$;

create trigger on_mfa_factor_change after insert or update or delete on auth.mfa_factors
  for each row execute function public.sync_two_factor();

-- ─── User administration ────────────────────────────────────────────────────

create or replace function public.set_user_role(p_user_id uuid, p_role public.user_role)
returns public.users
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.users;
  v_new public.users;
begin
  if not public.staff_at_least('admin') then
    raise exception 'only admins can change roles' using errcode = '42501';
  end if;

  select * into v_old from public.users where id = p_user_id for update;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  if v_old.role = 'admin' and p_role <> 'admin' and (
    select count(*) from public.users where role = 'admin' and status = 'active'
  ) <= 1 then
    raise exception 'cannot demote the last active admin' using errcode = 'P0001';
  end if;

  update public.users set role = p_role where id = p_user_id returning * into v_new;

  if v_old.role is distinct from p_role then
    perform public.log_audit('user.role_changed', 'users', p_user_id::text,
      jsonb_build_object('from', v_old.role, 'to', p_role));
  end if;
  return v_new;
end $$;

create or replace function public.set_user_status(p_user_id uuid, p_status public.user_status)
returns public.users
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.users;
  v_new public.users;
begin
  if not public.staff_at_least('admin') then
    raise exception 'only admins can change user status' using errcode = '42501';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'admins cannot change their own status' using errcode = 'P0001';
  end if;

  select * into v_old from public.users where id = p_user_id for update;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  update public.users set status = p_status where id = p_user_id returning * into v_new;

  if v_old.status is distinct from p_status then
    perform public.log_audit('user.status_changed', 'users', p_user_id::text,
      jsonb_build_object('from', v_old.status, 'to', p_status));
  end if;
  return v_new;
end $$;

-- ─── Editorial workflow ─────────────────────────────────────────────────────
-- Mirrors POST_TRANSITIONS in packages/types/src/roles.ts (kept in sync by tests).

create or replace function public.transition_post(
  p_post_id uuid,
  p_to public.post_status,
  p_scheduled_for timestamptz default null,
  p_note text default null
) returns public.posts
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := (select auth.uid());
  v_role public.user_role := public.current_app_role();
  v_post public.posts;
  v_need public.user_role;
begin
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'post not found' using errcode = 'P0002';
  end if;

  -- Minimum role per transition. Null = transition not allowed at all.
  v_need := case
    when v_post.status in ('draft', 'changes_requested') and p_to = 'in_review' then 'writer'
    when v_post.status = 'in_review' and p_to in ('changes_requested', 'approved') then 'editor'
    when v_post.status = 'approved' and p_to in ('scheduled', 'published') then 'editor'
    when v_post.status = 'scheduled' and p_to in ('published', 'approved') then 'editor'
    when v_post.status = 'published' and p_to = 'draft' then 'editor'
    else null
  end::public.user_role;

  if v_need is null then
    raise exception 'invalid transition % -> %', v_post.status, p_to using errcode = 'P0001';
  end if;

  -- The scheduler (service role) may only publish posts that are already scheduled and due.
  if public.is_service_role() and v_uid is null then
    if not (v_post.status = 'scheduled' and p_to = 'published' and v_post.scheduled_for <= now()) then
      raise exception 'service role may only publish due scheduled posts' using errcode = '42501';
    end if;
  else
    if not public.staff_at_least(v_need) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    -- Writers can only submit their own posts.
    if v_need = 'writer' and v_role = 'writer' and v_post.author_id <> v_uid then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    -- Editors cannot approve their own work. Admins can (small-team escape hatch, audited).
    if p_to = 'approved' and v_post.status = 'in_review'
       and v_post.author_id = v_uid and v_role <> 'admin' then
      raise exception 'cannot approve your own post' using errcode = '42501';
    end if;
  end if;

  if p_to = 'approved' and v_post.status = 'in_review' then
    v_post.approved_by := v_uid;
    v_post.approved_at := now();
  elsif p_to = 'scheduled' then
    if p_scheduled_for is null or p_scheduled_for <= now() then
      raise exception 'scheduled_for must be in the future' using errcode = '22023';
    end if;
    v_post.scheduled_for := p_scheduled_for;
  elsif p_to = 'published' then
    v_post.published_at := coalesce(v_post.published_at, now());
    v_post.scheduled_for := null;
  elsif p_to = 'approved' and v_post.status = 'scheduled' then
    v_post.scheduled_for := null;
  elsif p_to = 'draft' then
    -- Unpublishing drops the approval: it must be reviewed again.
    v_post.approved_by := null;
    v_post.approved_at := null;
  end if;

  update public.posts set
    status = p_to,
    approved_by = v_post.approved_by,
    approved_at = v_post.approved_at,
    scheduled_for = v_post.scheduled_for,
    published_at = v_post.published_at
  where id = p_post_id
  returning * into v_post;

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (v_uid, 'post.status_changed', 'posts', p_post_id::text,
    jsonb_build_object('to', p_to, 'note', p_note));

  return v_post;
end $$;

-- ─── Post triggers ──────────────────────────────────────────────────────────

-- ai_assisted is sticky: once AI touched a post it stays flagged.
create or replace function public.posts_before_update() returns trigger
language plpgsql as $$
begin
  new.ai_assisted := old.ai_assisted or new.ai_assisted;
  return new;
end $$;

create trigger posts_sticky_flags before update on public.posts
  for each row execute function public.posts_before_update();

-- Snapshot the previous title/body whenever content changes.
create or replace function public.posts_record_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.post_revisions (post_id, editor_id, title, body_json)
  values (old.id, (select auth.uid()), old.title, old.body_json);
  return new;
end $$;

create trigger posts_revision after update of title, body_json on public.posts
  for each row
  when (old.title is distinct from new.title or old.body_json is distinct from new.body_json)
  execute function public.posts_record_revision();

-- ─── Public author directory ────────────────────────────────────────────────
-- Exposes byline data (no email/role/status) for people with an author profile.
-- Deliberately not security_invoker: anon has no access to public.users itself.
create view public.author_directory with (security_barrier) as
  select ap.user_id, ap.slug, u.name, u.avatar_url, ap.bio, ap.socials, ap.expertise
  from public.author_profiles ap
  join public.users u on u.id = ap.user_id
  where u.status = 'active';

-- ─── Grants ─────────────────────────────────────────────────────────────────
-- Supabase grants ALL on public tables to anon/authenticated by default; narrow it here.

revoke insert, update, delete on public.users from anon, authenticated;
grant update (name, avatar_url) on public.users to authenticated;

revoke insert, update, delete on public.posts from anon;
revoke insert, update on public.posts from authenticated;
grant insert (
  type, title, slug, excerpt, summary_bullets, body_json, hero_image_url, hero_image_alt,
  category_id, author_id, seo_title, seo_description, canonical, is_sponsored, sponsor_id,
  ai_assisted
) on public.posts to authenticated;
grant update (
  type, title, slug, excerpt, summary_bullets, body_json, hero_image_url, hero_image_alt,
  category_id, seo_title, seo_description, canonical, is_sponsored, sponsor_id, ai_assisted
) on public.posts to authenticated;

revoke insert, update, delete on public.post_revisions from anon, authenticated;
revoke insert, update, delete on public.audit_logs from anon, authenticated;
revoke insert, update, delete on public.subscribers from anon;

revoke all on public.author_directory from anon, authenticated;
grant select on public.author_directory to anon, authenticated;

-- Internal helpers: not callable by clients.
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.handle_auth_user_email_change() from public, anon, authenticated;
revoke execute on function public.sync_two_factor() from public, anon, authenticated;
revoke execute on function public.posts_record_revision() from public, anon, authenticated;
-- Client-callable RPCs: authenticated only (each checks role + MFA itself).
revoke execute on function public.set_user_role(uuid, public.user_role) from public, anon;
revoke execute on function public.set_user_status(uuid, public.user_status) from public, anon;
revoke execute on function public.transition_post(uuid, public.post_status, timestamptz, text)
  from public, anon;
revoke execute on function public.log_audit(text, text, text, jsonb) from public, anon;
grant execute on function public.set_user_role(uuid, public.user_role) to authenticated;
grant execute on function public.set_user_status(uuid, public.user_status) to authenticated;
grant execute on function public.transition_post(uuid, public.post_status, timestamptz, text)
  to authenticated;
grant execute on function public.log_audit(text, text, text, jsonb) to authenticated;

-- ─── Row-level security ─────────────────────────────────────────────────────

alter table public.users              enable row level security;
alter table public.author_profiles    enable row level security;
alter table public.categories         enable row level security;
alter table public.tags               enable row level security;
alter table public.sponsors           enable row level security;
alter table public.posts              enable row level security;
alter table public.post_tags          enable row level security;
alter table public.post_revisions     enable row level security;
alter table public.editorial_comments enable row level security;
alter table public.sponsored_orders   enable row level security;
alter table public.ad_slots           enable row level security;
alter table public.ad_bookings        enable row level security;
alter table public.subscribers        enable row level security;
alter table public.bookmarks          enable row level security;
alter table public.follows            enable row level security;
alter table public.reactions          enable row level security;
alter table public.writer_payments    enable row level security;
alter table public.audit_logs         enable row level security;

-- users
create policy users_select_self on public.users for select to authenticated
  using (id = (select auth.uid()));
create policy users_select_staff on public.users for select to authenticated
  using (public.staff_at_least('writer'));
create policy users_update_self on public.users for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- author_profiles
create policy author_profiles_select on public.author_profiles for select to authenticated
  using (true);
create policy author_profiles_insert_self on public.author_profiles for insert to authenticated
  with check (user_id = (select auth.uid()) and public.staff_at_least('writer'));
create policy author_profiles_update_self on public.author_profiles for update to authenticated
  using (user_id = (select auth.uid()) and public.staff_at_least('writer'))
  with check (user_id = (select auth.uid()));
create policy author_profiles_admin on public.author_profiles for all to authenticated
  using (public.staff_at_least('admin')) with check (public.staff_at_least('admin'));

-- categories & tags: public read, editors manage
create policy categories_select on public.categories for select to anon, authenticated
  using (true);
create policy categories_manage on public.categories for all to authenticated
  using (public.staff_at_least('editor')) with check (public.staff_at_least('editor'));
create policy tags_select on public.tags for select to anon, authenticated using (true);
create policy tags_manage on public.tags for all to authenticated
  using (public.staff_at_least('editor')) with check (public.staff_at_least('editor'));

-- posts
create policy posts_select_published on public.posts for select to anon, authenticated
  using (status = 'published' and published_at <= now());
-- Ownership is checked inline (not via can_view_post_internal) so the policy also works for
-- INSERT ... RETURNING, where a lookup query cannot yet see the row being inserted.
create policy posts_select_internal on public.posts for select to authenticated
  using (
    public.staff_at_least('editor')
    or (author_id = (select auth.uid()) and public.staff_at_least('writer'))
  );
create policy posts_insert on public.posts for insert to authenticated
  with check (author_id = (select auth.uid()) and public.staff_at_least('writer'));
create policy posts_update on public.posts for update to authenticated
  using (
    public.staff_at_least('editor')
    or (author_id = (select auth.uid()) and status in ('draft', 'changes_requested')
        and public.staff_at_least('writer'))
  )
  with check (
    public.staff_at_least('editor')
    or (author_id = (select auth.uid()) and status in ('draft', 'changes_requested')
        and public.staff_at_least('writer'))
  );
create policy posts_delete on public.posts for delete to authenticated
  using (
    public.staff_at_least('admin')
    or (status = 'draft' and author_id = (select auth.uid()) and public.staff_at_least('writer'))
  );

-- post_tags
create policy post_tags_select on public.post_tags for select to anon, authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
create policy post_tags_manage on public.post_tags for all to authenticated
  using (public.can_edit_post(post_id)) with check (public.can_edit_post(post_id));

-- post_revisions (written by trigger only)
create policy post_revisions_select on public.post_revisions for select to authenticated
  using (public.can_view_post_internal(post_id));

-- editorial_comments
create policy editorial_comments_select on public.editorial_comments for select to authenticated
  using (public.can_view_post_internal(post_id));
create policy editorial_comments_insert on public.editorial_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_view_post_internal(post_id));
create policy editorial_comments_update on public.editorial_comments for update to authenticated
  using (
    public.can_view_post_internal(post_id)
    and (author_id = (select auth.uid()) or public.staff_at_least('editor'))
  )
  with check (public.can_view_post_internal(post_id));
create policy editorial_comments_delete on public.editorial_comments for delete to authenticated
  using (
    (author_id = (select auth.uid()) and public.staff_at_least('writer'))
    or public.staff_at_least('admin')
  );

-- sponsors & sponsored orders: editors+
create policy sponsors_manage on public.sponsors for all to authenticated
  using (public.staff_at_least('editor')) with check (public.staff_at_least('editor'));
create policy sponsored_orders_manage on public.sponsored_orders for all to authenticated
  using (public.staff_at_least('editor')) with check (public.staff_at_least('editor'));

-- ad slots & bookings: public sees active slots and live approved bookings
create policy ad_slots_select on public.ad_slots for select to anon, authenticated
  using (active);
create policy ad_slots_manage on public.ad_slots for all to authenticated
  using (public.staff_at_least('editor')) with check (public.staff_at_least('editor'));
create policy ad_bookings_select_live on public.ad_bookings for select to anon, authenticated
  using (approved and now() >= starts_at and now() < ends_at);
create policy ad_bookings_manage on public.ad_bookings for all to authenticated
  using (public.staff_at_least('editor')) with check (public.staff_at_least('editor'));

-- subscribers: written by the API (service role); admins can read/manage
create policy subscribers_admin on public.subscribers for all to authenticated
  using (public.staff_at_least('admin')) with check (public.staff_at_least('admin'));

-- reader engagement: own rows only
create policy bookmarks_own on public.bookmarks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy follows_own on public.follows for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy reactions_own on public.reactions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- writer payments
create policy writer_payments_select_own on public.writer_payments for select to authenticated
  using (writer_id = (select auth.uid()) and public.staff_at_least('writer'));
create policy writer_payments_admin on public.writer_payments for all to authenticated
  using (public.staff_at_least('admin')) with check (public.staff_at_least('admin'));

-- audit logs: admins read; writes only via log_audit()/workflow functions
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.staff_at_least('admin'));
