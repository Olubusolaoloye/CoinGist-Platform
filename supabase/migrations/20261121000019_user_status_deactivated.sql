-- Readers can deactivate their own account (kept in the database; signing in again reactivates it).
-- On its own: a new enum value can't be used in the transaction that adds it.
alter type public.user_status add value if not exists 'deactivated';
