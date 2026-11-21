-- Editable imagery: a cover image per category (shown on the home page and category pages),
-- and a public "media" bucket that staff upload images to from Studio.

alter table public.categories
  add column image_url text check (image_url is null or image_url ~ '^(https://|/)'),
  add column image_alt text check (image_alt is null or length(image_alt) between 1 and 300),
  add constraint categories_image_alt_required check (image_url is null or image_alt is not null);

-- Supabase Storage. Skipped where the storage schema doesn't exist (local tests).
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('media', 'media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- Anyone can view (public bucket). Staff (writer and up, with MFA) upload; editors and
  -- admins, or the uploader, can replace or delete.
  execute $p$
    create policy media_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'media' and public.staff_at_least('writer'))
  $p$;
  execute $p$
    create policy media_update on storage.objects for update to authenticated
      using (bucket_id = 'media' and (owner_id = auth.uid()::text or public.staff_at_least('editor')))
      with check (bucket_id = 'media' and public.staff_at_least('writer'))
  $p$;
  execute $p$
    create policy media_delete on storage.objects for delete to authenticated
      using (bucket_id = 'media' and (owner_id = auth.uid()::text or public.staff_at_least('editor')))
  $p$;
end
$$;
