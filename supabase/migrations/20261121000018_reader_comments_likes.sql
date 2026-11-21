-- Reader engagement: comments (with one level of replies), likes on stories and comments, and
-- reports. Every read and write goes through the functions below, which check who is asking;
-- the tables themselves are closed to API roles (RLS on, no policies).

create table public.comments (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references public.posts (id) on delete cascade,
  user_id           uuid not null references public.users (id) on delete cascade,
  parent_id         uuid references public.comments (id) on delete cascade,
  body              text not null check (length(body) <= 2000),
  status            text not null default 'visible' check (status in ('visible', 'hidden')),
  hidden_by_reports boolean not null default false,
  created_at        timestamptz not null default now(),
  edited_at         timestamptz,
  deleted_at        timestamptz
);
create index comments_post_idx on public.comments (post_id, created_at);
create index comments_user_idx on public.comments (user_id, created_at);
create index comments_parent_idx on public.comments (parent_id);
create index comments_recent_idx on public.comments (created_at desc);

create table public.comment_likes (
  user_id    uuid not null references public.users (id) on delete cascade,
  comment_id uuid not null references public.comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);
create index comment_likes_comment_idx on public.comment_likes (comment_id);

create table public.post_likes (
  user_id    uuid not null references public.users (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index post_likes_post_idx on public.post_likes (post_id);

create table public.comment_reports (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  reason     text not null default '' check (length(reason) <= 300),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index comment_reports_user_idx on public.comment_reports (user_id);

alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;
alter table public.post_likes enable row level security;
alter table public.comment_reports enable row level security;
revoke all on public.comments, public.comment_likes, public.post_likes, public.comment_reports from anon, authenticated;
grant select, insert, update, delete on public.comments, public.comment_likes, public.post_likes, public.comment_reports to service_role;

-- ─── Helpers ────────────────────────────────────────────────────────────────

-- The signed-in caller, if their account is active. Raises otherwise.
create or replace function public.active_caller() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not exists (select 1 from public.users where id = v_uid and status = 'active') then
    raise exception 'your account can''t do that right now' using errcode = '42501';
  end if;
  return v_uid;
end $$;

create or replace function public.post_is_public(p_post_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.posts where id = p_post_id and status = 'published' and published_at <= now())
$$;

-- Comment text checks: length, and no blocked (scam/phishing) domains anywhere in it.
create or replace function public.check_comment_body(p_body text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_body text := trim(coalesce(p_body, ''));
  v_bad text;
begin
  if v_body = '' then
    raise exception 'write something first' using errcode = '22023';
  end if;
  if length(v_body) > 2000 then
    raise exception 'comments can be up to 2,000 characters' using errcode = '22023';
  end if;
  select b.domain into v_bad
  from (
    select regexp_replace(lower(m[1]), '^www\.', '') as host
    from regexp_matches(v_body, '((?:[a-z0-9-]+\.)+[a-z]{2,})', 'gi') as m
  ) h
  join public.blocked_domains b on h.host = b.domain or h.host like '%.' || b.domain
  limit 1;
  if v_bad is not null then
    raise exception 'comments can''t mention % (it''s on our scam and phishing list)', v_bad using errcode = 'P0001';
  end if;
  return v_body;
end $$;

-- ─── Reading (anyone) ───────────────────────────────────────────────────────

-- The public thread for a published story: visible comments, plus "removed" placeholders for
-- deleted or hidden comments that still have visible replies. Newest threads first.
create or replace function public.post_comments(p_post_id uuid)
returns table (
  id uuid, parent_id uuid, author_id uuid, author_name text, author_avatar text, author_is_staff boolean,
  body text, removed boolean, like_count int, created_at timestamptz, edited boolean
)
language sql stable security definer set search_path = '' as $$
  with c as (
    select c.* from public.comments c
    where c.post_id = p_post_id and public.post_is_public(p_post_id)
  ),
  shown as (
    select c.*, (c.status = 'hidden' or c.deleted_at is not null) as gone,
           coalesce((select p.created_at from c p where p.id = c.parent_id), c.created_at) as thread_at
    from c
    where (c.status = 'visible' and c.deleted_at is null)
       or exists (select 1 from c r where r.parent_id = c.id and r.status = 'visible' and r.deleted_at is null)
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

create or replace function public.post_like_count(p_post_id uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case when public.post_is_public(p_post_id) then (select count(*)::int from public.post_likes where post_id = p_post_id) else 0 end
$$;

-- What the signed-in reader has liked on this story's page.
create or replace function public.my_post_engagement(p_post_id uuid)
returns table (liked_post boolean, liked_comment_ids uuid[])
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.post_likes where post_id = p_post_id and user_id = (select auth.uid())),
         coalesce((select array_agg(l.comment_id) from public.comment_likes l join public.comments c on c.id = l.comment_id
                   where c.post_id = p_post_id and l.user_id = (select auth.uid())), '{}')
$$;

-- ─── Writing (signed in) ────────────────────────────────────────────────────

create or replace function public.comment_add(p_post_id uuid, p_body text, p_parent_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.active_caller();
  v_body text;
  v_parent public.comments;
  v_id uuid;
begin
  if not public.post_is_public(p_post_id) then
    raise exception 'story not found' using errcode = 'P0002';
  end if;
  v_body := public.check_comment_body(p_body);
  if p_parent_id is not null then
    select * into v_parent from public.comments where id = p_parent_id;
    if not found or v_parent.post_id <> p_post_id or v_parent.status <> 'visible' or v_parent.deleted_at is not null then
      raise exception 'that comment isn''t available to reply to' using errcode = 'P0001';
    end if;
    -- Replies stay one level deep: replying to a reply joins its thread.
    p_parent_id := coalesce(v_parent.parent_id, v_parent.id);
  end if;
  if (select count(*) from public.comments where user_id = v_uid and created_at > now() - interval '1 minute') >= 5
     or (select count(*) from public.comments where user_id = v_uid and created_at > now() - interval '1 day') >= 100 then
    raise exception 'you''re commenting very fast. Wait a minute and try again' using errcode = 'P0001';
  end if;
  insert into public.comments (post_id, user_id, parent_id, body) values (p_post_id, v_uid, p_parent_id, v_body)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.comment_edit(p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.active_caller();
  v_body text := public.check_comment_body(p_body);
begin
  update public.comments set body = v_body, edited_at = now()
  where id = p_id and user_id = v_uid and deleted_at is null and body is distinct from v_body;
  if not found and not exists (select 1 from public.comments where id = p_id and user_id = v_uid and deleted_at is null) then
    raise exception 'comment not found' using errcode = 'P0002';
  end if;
end $$;

-- Your own comment, or any comment for editors. The text is wiped; replies stay.
create or replace function public.comment_delete(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.active_caller();
  v_owner uuid;
begin
  select user_id into v_owner from public.comments where id = p_id and deleted_at is null;
  if v_owner is null or (v_owner <> v_uid and not public.staff_at_least('editor')) then
    raise exception 'comment not found' using errcode = 'P0002';
  end if;
  update public.comments set body = '', deleted_at = now() where id = p_id;
  if v_owner <> v_uid then
    perform public.log_audit('comment.deleted', 'comments', p_id::text, '{}'::jsonb);
  end if;
end $$;

create or replace function public.post_like_set(p_post_id uuid, p_on boolean) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.active_caller();
begin
  if not public.post_is_public(p_post_id) then
    raise exception 'story not found' using errcode = 'P0002';
  end if;
  if p_on then
    insert into public.post_likes (user_id, post_id) values (v_uid, p_post_id) on conflict do nothing;
  else
    delete from public.post_likes where user_id = v_uid and post_id = p_post_id;
  end if;
  return public.post_like_count(p_post_id);
end $$;

create or replace function public.comment_like_set(p_id uuid, p_on boolean) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.active_caller();
begin
  if not exists (select 1 from public.comments c where c.id = p_id and c.status = 'visible' and c.deleted_at is null and public.post_is_public(c.post_id)) then
    raise exception 'comment not found' using errcode = 'P0002';
  end if;
  if p_on then
    insert into public.comment_likes (user_id, comment_id) values (v_uid, p_id) on conflict do nothing;
  else
    delete from public.comment_likes where user_id = v_uid and comment_id = p_id;
  end if;
  return (select count(*)::int from public.comment_likes where comment_id = p_id);
end $$;

-- Report a comment. Three reports hide it until an editor looks.
create or replace function public.comment_report(p_id uuid, p_reason text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.active_caller();
  v_owner uuid;
begin
  select user_id into v_owner from public.comments where id = p_id and status = 'visible' and deleted_at is null;
  if v_owner is null then
    raise exception 'comment not found' using errcode = 'P0002';
  end if;
  if v_owner = v_uid then
    raise exception 'you can''t report your own comment' using errcode = 'P0001';
  end if;
  insert into public.comment_reports (comment_id, user_id, reason) values (p_id, v_uid, left(trim(coalesce(p_reason, '')), 300))
  on conflict do nothing;
  if (select count(*) from public.comment_reports where comment_id = p_id) >= 3 then
    update public.comments set status = 'hidden', hidden_by_reports = true where id = p_id and status = 'visible';
  end if;
end $$;

-- ─── Moderation (editors) ───────────────────────────────────────────────────

create or replace function public.comment_set_hidden(p_id uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.staff_at_least('editor') then
    raise exception 'only editors can moderate comments' using errcode = '42501';
  end if;
  update public.comments set status = case when p_hidden then 'hidden' else 'visible' end, hidden_by_reports = false
  where id = p_id;
  if not found then
    raise exception 'comment not found' using errcode = 'P0002';
  end if;
  -- Restoring clears the reports that hid it.
  if not p_hidden then
    delete from public.comment_reports where comment_id = p_id;
  end if;
  perform public.log_audit(case when p_hidden then 'comment.hidden' else 'comment.restored' end, 'comments', p_id::text, '{}'::jsonb);
end $$;

-- Recent comments for the Studio moderation page. p_filter: 'reported', 'hidden' or 'all'.
create or replace function public.moderation_comments(p_filter text, p_limit int default 100)
returns table (
  id uuid, post_id uuid, post_title text, post_type text, post_slug text, parent_id uuid,
  author_id uuid, author_name text, author_email text, author_status text,
  body text, status text, hidden_by_reports boolean, deleted boolean, report_count int, report_reasons text[],
  like_count int, created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.staff_at_least('editor') then
    raise exception 'only editors can moderate comments' using errcode = '42501';
  end if;
  return query
  select c.id, p.id, p.title, p.type::text, p.slug::text, c.parent_id,
         u.id, coalesce(nullif(trim(u.name), ''), 'Reader'), u.email, u.status::text,
         c.body, c.status, c.hidden_by_reports, c.deleted_at is not null,
         (select count(*)::int from public.comment_reports r where r.comment_id = c.id),
         coalesce((select array_agg(r.reason) filter (where r.reason <> '') from public.comment_reports r where r.comment_id = c.id), '{}'),
         (select count(*)::int from public.comment_likes l where l.comment_id = c.id),
         c.created_at
  from public.comments c
  join public.posts p on p.id = c.post_id
  join public.users u on u.id = c.user_id
  where c.deleted_at is null
    and case coalesce(p_filter, 'all')
          when 'reported' then exists (select 1 from public.comment_reports r where r.comment_id = c.id)
          when 'hidden' then c.status = 'hidden'
          else true
        end
  order by (select count(*) from public.comment_reports r where r.comment_id = c.id) desc, c.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end $$;

-- "Delete my data" from the account page: likes, reports and the text of your comments.
create or replace function public.forget_my_engagement() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  delete from public.post_likes where user_id = v_uid;
  delete from public.comment_likes where user_id = v_uid;
  delete from public.comment_reports where user_id = v_uid;
  update public.comments set body = '', deleted_at = now() where user_id = v_uid and deleted_at is null;
end $$;
revoke execute on function public.forget_my_engagement() from public;
grant execute on function public.forget_my_engagement() to authenticated;

-- ─── Privileges ─────────────────────────────────────────────────────────────
revoke execute on function public.active_caller(), public.post_is_public(uuid), public.check_comment_body(text),
  public.post_comments(uuid), public.post_like_count(uuid), public.my_post_engagement(uuid),
  public.comment_add(uuid, text, uuid), public.comment_edit(uuid, text), public.comment_delete(uuid),
  public.post_like_set(uuid, boolean), public.comment_like_set(uuid, boolean), public.comment_report(uuid, text),
  public.comment_set_hidden(uuid, boolean), public.moderation_comments(text, int)
  from public;
grant execute on function public.post_comments(uuid), public.post_like_count(uuid) to anon, authenticated;
grant execute on function public.my_post_engagement(uuid),
  public.comment_add(uuid, text, uuid), public.comment_edit(uuid, text), public.comment_delete(uuid),
  public.post_like_set(uuid, boolean), public.comment_like_set(uuid, boolean), public.comment_report(uuid, text),
  public.comment_set_hidden(uuid, boolean), public.moderation_comments(text, int)
  to authenticated;
grant execute on all functions in schema public to service_role;
-- Some projects grant new functions to anon/authenticated directly; narrow those too.
revoke execute on function public.active_caller(), public.post_is_public(uuid), public.check_comment_body(text)
  from anon, authenticated;
revoke execute on function public.my_post_engagement(uuid),
  public.comment_add(uuid, text, uuid), public.comment_edit(uuid, text), public.comment_delete(uuid),
  public.post_like_set(uuid, boolean), public.comment_like_set(uuid, boolean), public.comment_report(uuid, text),
  public.comment_set_hidden(uuid, boolean), public.moderation_comments(text, int), public.forget_my_engagement()
  from anon;
