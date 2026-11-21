-- Account deactivation instead of deleting data. Nothing is removed: the account, saved stories,
-- follows, likes and comments all stay. While deactivated, the reader can't use the site
-- (the API refuses non-active accounts) and their comments are hidden from the public thread.

-- Readers only: staff accounts are managed by an admin on Team and roles.
create or replace function public.deactivate_me() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_user public.users;
begin
  select * into v_user from public.users where id = v_uid;
  if v_user.id is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if v_user.role <> 'reader' then
    raise exception 'staff accounts are managed by an admin on Team and roles' using errcode = 'P0001';
  end if;
  if v_user.status <> 'active' then
    raise exception 'this account isn''t active' using errcode = 'P0001';
  end if;
  update public.users set status = 'deactivated' where id = v_uid;
  insert into public.audit_logs (actor_id, action, entity, entity_id) values (v_uid, 'user.deactivated', 'users', v_uid::text);
end $$;

-- Signing in again brings a deactivated account back. Suspended accounts stay suspended.
-- Returns true if the account was reactivated.
create or replace function public.reactivate_me() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  update public.users set status = 'active' where id = v_uid and status = 'deactivated';
  if not found then
    return false;
  end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id) values (v_uid, 'user.reactivated', 'users', v_uid::text);
  return true;
end $$;

revoke execute on function public.deactivate_me(), public.reactivate_me() from public, anon;
grant execute on function public.deactivate_me(), public.reactivate_me() to authenticated;

-- "Delete my data" is gone: nothing deletes a reader's likes or comments any more.
drop function if exists public.forget_my_engagement();

-- Comments from accounts that aren't active (deactivated or suspended) are hidden from readers,
-- and come back if the account is reactivated.
create or replace function public.post_comments(p_post_id uuid)
returns table (
  id uuid, parent_id uuid, author_id uuid, author_name text, author_avatar text, author_is_staff boolean,
  body text, removed boolean, like_count int, created_at timestamptz, edited boolean
)
language sql stable security definer set search_path = '' as $$
  with c as (
    select c.*, (c.status = 'visible' and c.deleted_at is null and u.status = 'active') as live
    from public.comments c join public.users u on u.id = c.user_id
    where c.post_id = p_post_id and public.post_is_public(p_post_id)
  ),
  shown as (
    select c.*, not c.live as gone,
           coalesce((select p.created_at from c p where p.id = c.parent_id), c.created_at) as thread_at
    from c
    where c.live or exists (select 1 from c r where r.parent_id = c.id and r.live)
  )
  select s.id, s.parent_id,
         case when s.gone then null else s.user_id end,
         case when s.gone then null else coalesce(nullif(trim(u.name), ''), 'Reader') end,
         case when s.gone then null else u.avatar_url end,
         case when s.gone then false else u.role <> 'reader' end,
         case when s.gone then '' else s.body end,
         s.gone,
         (select count(*)::int from public.comment_likes l where l.comment_id = s.id),
         s.created_at,
         s.edited_at is not null and not s.gone
  from shown s join public.users u on u.id = s.user_id
  order by s.thread_at desc, coalesce(s.parent_id, s.id), s.parent_id nulls first, s.created_at
  limit 500
$$;
