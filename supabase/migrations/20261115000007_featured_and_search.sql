-- Editors' picks and search.

-- Editors choose stories for the home page's "Editors' picks". Writers can't set it.
alter table public.posts add column featured boolean not null default false;
create index posts_featured_idx on public.posts (published_at desc) where featured and status = 'published';

grant update (featured) on public.posts to authenticated;

create or replace function public.posts_featured_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.featured is distinct from old.featured
     and not (public.staff_at_least('editor') or public.is_service_role()
              or current_user in ('postgres', 'supabase_admin')) then
    raise exception 'only editors can feature stories' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger posts_featured_guard before update of featured on public.posts
  for each row execute function public.posts_featured_guard();

-- Search covers the body text too (title and excerpt still rank highest).
alter table public.posts drop column search;
alter table public.posts add column search tsvector generated always as (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(excerpt, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(jsonb_path_query_array(body_json, 'lax $.**.text')::text, '')), 'C')
) stored;
create index posts_search_idx on public.posts using gin (search);
