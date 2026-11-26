-- Staff invites: an admin invites an email address to a Studio role. When someone with that
-- address signs up (email link or Google), they get the role. Only admins can see or make them.

create table public.staff_invites (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and length(email) <= 254),
  role        public.user_role not null check (role <> 'reader'),
  invited_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references public.users (id) on delete set null
);
-- One open invite per address.
create unique index staff_invites_open_email_key on public.staff_invites (lower(email)) where accepted_at is null;
create index staff_invites_invited_by_idx on public.staff_invites (invited_by);
create index staff_invites_accepted_by_idx on public.staff_invites (accepted_by);

alter table public.staff_invites enable row level security;
create policy staff_invites_admin on public.staff_invites for all to authenticated
  using (public.staff_at_least('admin')) with check (public.staff_at_least('admin'));
revoke all on public.staff_invites from anon;
grant select, delete on public.staff_invites to authenticated;

-- Invite an address. If it already has an account, the role applies straight away.
-- Returns 'invited' or 'existing'.
create or replace function public.invite_staff(p_email text, p_role public.user_role) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_user uuid;
begin
  if not public.staff_at_least('admin') then
    raise exception 'only admins can invite staff' using errcode = '42501';
  end if;
  if p_role = 'reader' then
    raise exception 'invite someone as a writer, editor or admin' using errcode = '22023';
  end if;

  select id into v_user from public.users where lower(email) = v_email;
  if v_user is not null then
    perform public.set_user_role(v_user, p_role);
    update public.staff_invites set accepted_at = now(), accepted_by = v_user
      where lower(email) = v_email and accepted_at is null;
    return 'existing';
  end if;

  -- A fresh invite replaces any open one for the address (new role, new 14 days).
  delete from public.staff_invites where lower(email) = v_email and accepted_at is null;
  insert into public.staff_invites (email, role, invited_by) values (v_email, p_role, (select auth.uid()));
  perform public.log_audit('user.invited', 'staff_invites', v_email, jsonb_build_object('role', p_role));
  return 'invited';
end $$;
revoke execute on function public.invite_staff(text, public.user_role) from public, anon;
grant execute on function public.invite_staff(text, public.user_role) to authenticated;

-- New accounts: create the profile row, then apply an open, unexpired invite for the address.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_invite public.staff_invites;
begin
  insert into public.users (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  select * into v_invite from public.staff_invites
    where lower(email) = lower(new.email) and accepted_at is null and expires_at > now()
    order by created_at desc limit 1;
  if found then
    update public.users set role = v_invite.role where id = new.id;
    update public.staff_invites set accepted_at = now(), accepted_by = new.id where id = v_invite.id;
    insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
    values (v_invite.invited_by, 'user.invite_accepted', 'users', new.id::text, jsonb_build_object('role', v_invite.role));
  end if;
  return new;
end $$;
