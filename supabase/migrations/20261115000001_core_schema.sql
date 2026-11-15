-- CoinGist core schema.
-- Targets Supabase Postgres (relies on auth.users, auth.uid(), auth.jwt()).
-- Enum values must match packages/types/src/enums.ts (checked by packages/db tests).

-- ─── Enums ──────────────────────────────────────────────────────────────────
-- Order matters for user_role: comparisons use declaration order (reader < ... < admin).
create type public.user_role as enum ('reader', 'writer', 'editor', 'admin');
create type public.user_status as enum ('active', 'suspended', 'deleted');
create type public.post_type as enum ('news', 'gist', 'learn', 'sponsored');
create type public.post_status as enum
  ('draft', 'in_review', 'changes_requested', 'approved', 'scheduled', 'published');
create type public.sponsored_order_status as enum
  ('inquiry', 'vetting', 'rejected', 'accepted', 'in_production', 'published');
create type public.invoice_status as enum ('none', 'sent', 'paid', 'overdue', 'void');
create type public.subscriber_status as enum ('pending', 'active', 'unsubscribed', 'bounced');
create type public.payment_status as enum ('pending', 'approved', 'paid', 'cancelled');
create type public.reaction_kind as enum ('fire', 'bullish', 'bearish', 'insightful');
create type public.follow_target as enum ('author', 'category', 'tag');

-- Slugs: lowercase, digits, single hyphens.
create domain public.slug as text
  check (value ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(value) <= 120);

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ─── Users & authors ────────────────────────────────────────────────────────
create table public.users (
  id                 uuid primary key references auth.users (id) on delete cascade,
  email              text not null,
  name               text,
  avatar_url         text,
  role               public.user_role not null default 'reader',
  status             public.user_status not null default 'active',
  two_factor_enabled boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index users_email_key on public.users (lower(email));
create index users_role_idx on public.users (role) where role <> 'reader';
create trigger users_updated_at before update on public.users
  for each row execute function public.set_updated_at();

create table public.author_profiles (
  user_id    uuid primary key references public.users (id) on delete cascade,
  slug       public.slug not null unique,
  bio        text,
  socials    jsonb not null default '{}'::jsonb,
  expertise  text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger author_profiles_updated_at before update on public.author_profiles
  for each row execute function public.set_updated_at();

-- ─── Taxonomy ───────────────────────────────────────────────────────────────
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        public.slug not null unique,
  name        text not null,
  description text,
  parent_id   uuid references public.categories (id) on delete set null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  slug       public.slug not null unique,
  name       text not null,
  created_at timestamptz not null default now()
);

-- ─── Sponsors ───────────────────────────────────────────────────────────────
create table public.sponsors (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  website       text,
  contact_email text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger sponsors_updated_at before update on public.sponsors
  for each row execute function public.set_updated_at();

-- ─── Posts ──────────────────────────────────────────────────────────────────
create table public.posts (
  id              uuid primary key default gen_random_uuid(),
  type            public.post_type not null,
  title           text not null check (length(title) between 1 and 300),
  slug            public.slug not null unique,
  excerpt         text,
  summary_bullets text[] not null default '{}',
  body_json       jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  hero_image_url  text,
  hero_image_alt  text,
  category_id     uuid references public.categories (id) on delete set null,
  author_id       uuid not null references public.users (id) on delete restrict,
  status          public.post_status not null default 'draft',
  approved_by     uuid references public.users (id) on delete set null,
  approved_at     timestamptz,
  scheduled_for   timestamptz,
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  seo_title       text check (length(seo_title) <= 70),
  seo_description text check (length(seo_description) <= 170),
  canonical       text,
  is_sponsored    boolean not null default false,
  sponsor_id      uuid references public.sponsors (id) on delete restrict,
  ai_assisted     boolean not null default false,
  search          tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(excerpt, '')), 'B')
  ) stored,

  -- Sponsored content must be labelled and attributed.
  constraint posts_sponsored_type check (type <> 'sponsored' or is_sponsored),
  constraint posts_sponsor_required check (not is_sponsored or sponsor_id is not null),
  -- Nothing reaches approved/scheduled/published without a human approver.
  constraint posts_human_approval check (
    status not in ('approved', 'scheduled', 'published')
    or (approved_by is not null and approved_at is not null)
  ),
  constraint posts_scheduled_time check (status <> 'scheduled' or scheduled_for is not null),
  constraint posts_published_time check (status <> 'published' or published_at is not null)
);
create index posts_published_idx on public.posts (published_at desc) where status = 'published';
create index posts_type_published_idx on public.posts (type, published_at desc)
  where status = 'published';
create index posts_category_idx on public.posts (category_id, published_at desc);
create index posts_author_idx on public.posts (author_id, updated_at desc);
create index posts_status_idx on public.posts (status, updated_at desc);
create index posts_scheduled_idx on public.posts (scheduled_for) where status = 'scheduled';
create index posts_search_idx on public.posts using gin (search);
create trigger posts_updated_at before update on public.posts
  for each row execute function public.set_updated_at();

create table public.post_tags (
  post_id uuid not null references public.posts (id) on delete cascade,
  tag_id  uuid not null references public.tags (id) on delete cascade,
  primary key (post_id, tag_id)
);
create index post_tags_tag_idx on public.post_tags (tag_id);

create table public.post_revisions (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  editor_id  uuid references public.users (id) on delete set null,
  title      text not null,
  body_json  jsonb not null,
  created_at timestamptz not null default now()
);
create index post_revisions_post_idx on public.post_revisions (post_id, created_at desc);

create table public.editorial_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  author_id   uuid not null references public.users (id) on delete cascade,
  parent_id   uuid references public.editorial_comments (id) on delete cascade,
  body        text not null check (length(body) between 1 and 5000),
  anchor      jsonb, -- Tiptap selection range, null = whole-post comment
  resolved_at timestamptz,
  resolved_by uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index editorial_comments_post_idx on public.editorial_comments (post_id, created_at);

-- ─── Sponsored & ads ────────────────────────────────────────────────────────
create table public.sponsored_orders (
  id                uuid primary key default gen_random_uuid(),
  sponsor_id        uuid not null references public.sponsors (id) on delete restrict,
  post_id           uuid references public.posts (id) on delete set null,
  title             text not null,
  brief             text,
  amount            numeric(12, 2) check (amount >= 0),
  currency          char(3) not null default 'USD',
  vetting_checklist jsonb not null default '{}'::jsonb,
  status            public.sponsored_order_status not null default 'inquiry',
  invoice_status    public.invoice_status not null default 'none',
  created_by        uuid references public.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index sponsored_orders_status_idx on public.sponsored_orders (status);
create trigger sponsored_orders_updated_at before update on public.sponsored_orders
  for each row execute function public.set_updated_at();

create table public.ad_slots (
  id         uuid primary key default gen_random_uuid(),
  key        public.slug not null unique, -- e.g. home-leaderboard, article-inline-1
  name       text not null,
  placement  text not null,
  width      int not null check (width > 0),  -- fixed size: reserved space prevents CLS
  height     int not null check (height > 0),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.ad_bookings (
  id           uuid primary key default gen_random_uuid(),
  slot_id      uuid not null references public.ad_slots (id) on delete cascade,
  sponsor_id   uuid not null references public.sponsors (id) on delete restrict,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  creative_url text not null,
  click_url    text not null,
  alt_text     text not null,
  approved     boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint ad_bookings_window check (ends_at > starts_at)
);
create index ad_bookings_slot_window_idx on public.ad_bookings (slot_id, starts_at, ends_at);

-- ─── Newsletter ─────────────────────────────────────────────────────────────
create table public.subscribers (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  lists        text[] not null default '{}',
  status       public.subscriber_status not null default 'pending',
  source       text, -- e.g. footer, article-inline, homepage
  external_id  text, -- Beehiiv/Resend subscriber id
  confirmed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index subscribers_email_key on public.subscribers (lower(email));
create trigger subscribers_updated_at before update on public.subscribers
  for each row execute function public.set_updated_at();

-- ─── Reader engagement ──────────────────────────────────────────────────────
create table public.bookmarks (
  user_id    uuid not null references public.users (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table public.follows (
  user_id     uuid not null references public.users (id) on delete cascade,
  target_type public.follow_target not null,
  target_id   uuid not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);
create index follows_target_idx on public.follows (target_type, target_id);

create table public.reactions (
  user_id    uuid not null references public.users (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  kind       public.reaction_kind not null,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id, kind)
);
create index reactions_post_idx on public.reactions (post_id);

-- ─── Payments ───────────────────────────────────────────────────────────────
create table public.writer_payments (
  id         uuid primary key default gen_random_uuid(),
  writer_id  uuid not null references public.users (id) on delete restrict,
  post_id    uuid references public.posts (id) on delete set null,
  amount     numeric(12, 2) not null check (amount >= 0),
  currency   char(3) not null default 'USD',
  status     public.payment_status not null default 'pending',
  paid_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint writer_payments_paid_at check (status <> 'paid' or paid_at is not null)
);
create index writer_payments_writer_idx on public.writer_payments (writer_id, created_at desc);
create trigger writer_payments_updated_at before update on public.writer_payments
  for each row execute function public.set_updated_at();

-- ─── Audit log (append-only) ────────────────────────────────────────────────
create table public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references public.users (id) on delete set null,
  action     text not null,  -- e.g. user.role_changed, post.published
  entity     text not null,  -- table / domain name
  entity_id  text,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create or replace function public.audit_logs_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end $$;
create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();
