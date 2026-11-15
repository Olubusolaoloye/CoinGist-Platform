-- Studio helpers.

-- Slugs are globally unique but drafts are private, so a writer can't check availability with
-- a normal select. This answers yes/no only, to staff only.
create or replace function public.slug_taken(p_slug text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when not public.staff_at_least('writer') then null
    else exists (select 1 from public.posts where slug = p_slug)
  end
$$;
revoke execute on function public.slug_taken(text) from public, anon;
grant execute on function public.slug_taken(text) to authenticated;

-- Resolving a comment must not let anyone rewrite someone else's comment text.
revoke update on public.editorial_comments from anon, authenticated;
grant update (resolved_at, resolved_by) on public.editorial_comments to authenticated;
