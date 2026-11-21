-- Author profiles staff can edit, and editors choosing a story's byline.

-- A short job title for bylines and the author page ("Markets reporter").
alter table public.author_profiles
  add column title text check (title is null or length(title) <= 80),
  add constraint author_profiles_bio_length check (bio is null or length(bio) <= 1000);

-- Same view, with the title added at the end (grants are kept).
create or replace view public.author_directory with (security_barrier) as
  select ap.user_id, ap.slug, u.name, u.avatar_url, ap.bio, ap.socials, ap.expertise, ap.title
  from public.author_profiles ap
  join public.users u on u.id = ap.user_id
  where u.status = 'active';

-- Save a staff member's author profile: their own (writers and up), or anyone's (editors and up).
-- Creates the profile, with a URL slug from the name, the first time; the slug never changes after.
create or replace function public.save_author_profile(
  p_user_id uuid, p_name text, p_avatar_url text, p_title text, p_bio text, p_socials jsonb, p_expertise text[]
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_self boolean := p_user_id = (select auth.uid());
  v_role public.user_role;
  v_name text := nullif(trim(p_name), '');
  v_base text;
  v_slug text;
  n int := 1;
begin
  if not ((v_self and public.staff_at_least('writer')) or public.staff_at_least('editor')) then
    raise exception 'you can only edit your own author profile' using errcode = '42501';
  end if;
  select role into v_role from public.users where id = p_user_id;
  if v_role is null then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if v_role = 'reader' then
    raise exception 'only staff have author profiles' using errcode = 'P0001';
  end if;
  if v_name is null or length(v_name) > 80 then
    raise exception 'enter a display name (up to 80 characters)' using errcode = '22023';
  end if;
  if p_avatar_url is not null and p_avatar_url <> '' and p_avatar_url !~ '^(https://|/[^/])' then
    raise exception 'use an https:// image address' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_socials, '{}'::jsonb)) <> 'object' then
    raise exception 'socials must be an object' using errcode = '22023';
  end if;

  update public.users set name = v_name, avatar_url = nullif(p_avatar_url, '') where id = p_user_id;

  select slug into v_slug from public.author_profiles where user_id = p_user_id;
  if v_slug is null then
    v_base := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
    if v_base = '' then v_base := 'author'; end if;
    v_base := left(v_base, 100);
    v_slug := v_base;
    while exists (select 1 from public.author_profiles where slug = v_slug) loop
      n := n + 1;
      v_slug := v_base || '-' || n;
    end loop;
  end if;

  insert into public.author_profiles (user_id, slug, title, bio, socials, expertise)
  values (p_user_id, v_slug, nullif(trim(p_title), ''), nullif(trim(p_bio), ''), coalesce(p_socials, '{}'::jsonb), coalesce(p_expertise, '{}'))
  on conflict (user_id) do update set
    title = excluded.title, bio = excluded.bio, socials = excluded.socials, expertise = excluded.expertise;

  if not v_self then
    perform public.log_audit('author.updated', 'users', p_user_id::text, '{}'::jsonb);
  end if;
  return v_slug;
end $$;
revoke execute on function public.save_author_profile(uuid, text, text, text, text, jsonb, text[]) from public, anon;
grant execute on function public.save_author_profile(uuid, text, text, text, text, jsonb, text[]) to authenticated;

-- Editors choose who a story is credited to. Must be an active staff member. A story already
-- in payouts keeps its author (the payment belongs to that writer).
create or replace function public.set_post_author(p_post_id uuid, p_author_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old uuid;
begin
  if not public.staff_at_least('editor') then
    raise exception 'only editors can change a story''s author' using errcode = '42501';
  end if;
  select author_id into v_old from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'story not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.users where id = p_author_id and role <> 'reader' and status = 'active') then
    raise exception 'the author must be an active writer, editor or admin' using errcode = 'P0001';
  end if;
  if v_old is distinct from p_author_id and exists (
    select 1 from public.writer_payments where post_id = p_post_id and status <> 'cancelled'
  ) then
    raise exception 'this story is already in writer payouts, so its author can''t change' using errcode = 'P0001';
  end if;
  if v_old is distinct from p_author_id then
    update public.posts set author_id = p_author_id where id = p_post_id;
    perform public.log_audit('post.author_changed', 'posts', p_post_id::text,
      jsonb_build_object('from', v_old, 'to', p_author_id));
  end if;
end $$;
revoke execute on function public.set_post_author(uuid, uuid) from public, anon;
grant execute on function public.set_post_author(uuid, uuid) to authenticated;
