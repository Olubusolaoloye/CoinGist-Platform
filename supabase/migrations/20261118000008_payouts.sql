-- Writer payouts: admins record, approve and pay writers; writers see their own.
-- Life cycle: pending -> approved -> paid, or pending/approved -> cancelled. Paid is final.

alter table public.writer_payments
  add column note text check (length(note) <= 500),
  add constraint writer_payments_currency check (currency ~ '^[A-Z]{3}$');

-- A story is paid once. (A cancelled payment doesn't count, so it can be redone.)
create unique index writer_payments_one_per_post on public.writer_payments (post_id)
  where post_id is not null and status <> 'cancelled';
create index writer_payments_status_idx on public.writer_payments (status, created_at desc);

create or replace function public.writer_payments_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  writer_role public.user_role;
  post_author uuid;
  post_state  public.post_status;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'new payments start as pending' using errcode = 'P0001';
    end if;
    select role into writer_role from public.users where id = new.writer_id;
    if writer_role is null or writer_role not in ('writer', 'editor', 'admin') then
      raise exception 'payments can only go to staff writers' using errcode = 'P0001';
    end if;
    if new.post_id is not null then
      select author_id, status into post_author, post_state from public.posts where id = new.post_id;
      if post_author is distinct from new.writer_id then
        raise exception 'that story was written by someone else' using errcode = 'P0001';
      end if;
      if post_state <> 'published' then
        raise exception 'only published stories can be paid for' using errcode = 'P0001';
      end if;
    end if;
    new.paid_at := null;
    insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
    values ((select auth.uid()), 'writer_payment.created', 'writer_payments', new.id::text,
            jsonb_build_object('writer_id', new.writer_id, 'post_id', new.post_id,
                               'amount', new.amount, 'currency', new.currency));
    return new;
  end if;

  if new.writer_id is distinct from old.writer_id or new.post_id is distinct from old.post_id
     or new.created_at is distinct from old.created_at then
    raise exception 'the writer and story of a payment can''t change' using errcode = 'P0001';
  end if;
  if old.status <> 'pending'
     and (new.amount is distinct from old.amount or new.currency is distinct from old.currency) then
    raise exception 'the amount is fixed once a payment is approved' using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status then
    if (old.status, new.status) not in (
      ('pending', 'approved'), ('pending', 'cancelled'),
      ('approved', 'paid'), ('approved', 'cancelled')
    ) then
      raise exception 'a payment can''t move from % to %', old.status, new.status using errcode = 'P0001';
    end if;
    new.paid_at := case when new.status = 'paid' then now() else null end;
    insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
    values ((select auth.uid()), 'writer_payment.status_changed', 'writer_payments', new.id::text,
            jsonb_build_object('from', old.status, 'to', new.status, 'amount', new.amount, 'currency', new.currency));
  else
    new.paid_at := old.paid_at;
  end if;
  return new;
end $$;

create trigger writer_payments_guard before insert or update on public.writer_payments
  for each row execute function public.writer_payments_guard();

-- Payments are never deleted (cancel instead), and clients write only these columns.
revoke insert, update, delete on public.writer_payments from anon, authenticated;
grant insert (writer_id, post_id, amount, currency, note) on public.writer_payments to authenticated;
grant update (status, amount, currency, note) on public.writer_payments to authenticated;
