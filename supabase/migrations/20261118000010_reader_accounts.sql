-- Reader accounts: guard rails on bookmarks and follows (rows themselves are own-rows-only RLS).

-- Bookmarks only for published stories, and at most 1000 per reader.
create or replace function public.bookmarks_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.posts where id = new.post_id and status = 'published' and published_at <= now()) then
    raise exception 'only published stories can be saved' using errcode = 'P0002';
  end if;
  if (select count(*) from public.bookmarks where user_id = new.user_id) >= 1000 then
    raise exception 'you can save up to 1000 stories; remove some first' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger bookmarks_guard before insert on public.bookmarks
  for each row execute function public.bookmarks_guard();

-- Follows must point at something that exists (a writer with a public profile, a category or
-- a tag), and a reader can follow at most 100 things.
create or replace function public.follows_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not (case new.target_type
    when 'author' then exists (select 1 from public.author_profiles where user_id = new.target_id)
    when 'category' then exists (select 1 from public.categories where id = new.target_id)
    when 'tag' then exists (select 1 from public.tags where id = new.target_id)
  end) then
    raise exception 'nothing to follow there' using errcode = 'P0002';
  end if;
  if (select count(*) from public.follows where user_id = new.user_id) >= 100 then
    raise exception 'you can follow up to 100 writers and topics; unfollow some first' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger follows_guard before insert on public.follows
  for each row execute function public.follows_guard();

create index bookmarks_user_idx on public.bookmarks (user_id, created_at desc);
create index posts_author_published_idx on public.posts (author_id, published_at desc) where status = 'published';
create index posts_category_published_idx on public.posts (category_id, published_at desc) where status = 'published';

revoke update on public.bookmarks, public.follows from anon, authenticated;
revoke all on public.bookmarks, public.follows from anon;
