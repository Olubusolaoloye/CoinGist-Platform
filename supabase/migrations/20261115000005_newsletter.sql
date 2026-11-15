-- Newsletter: consent record and sync state for the external newsletter tool (Beehiiv).

create type public.sync_status as enum ('pending', 'synced', 'failed');

alter table public.subscribers
  add column consented_at    timestamptz,
  add column unsubscribed_at timestamptz,
  add column sync_status     public.sync_status not null default 'pending',
  add column sync_attempts   int not null default 0,
  add column sync_error      text,
  add column synced_at       timestamptz,
  -- Last signup that triggered a confirmation email (throttles repeat submissions).
  add column last_signup_at  timestamptz not null default now(),
  -- Lists are a fixed set; the UI and the provider mapping depend on these names.
  add constraint subscribers_lists_known check (lists <@ array['daily-gist', 'weekly-wrap']::text[]),
  add constraint subscribers_source_len check (source is null or length(source) <= 40);

create index subscribers_sync_idx on public.subscribers (sync_status, sync_attempts)
  where sync_status <> 'synced';
create index subscribers_status_idx on public.subscribers (status, created_at desc);
create unique index subscribers_external_id_key on public.subscribers (external_id)
  where external_id is not null;
