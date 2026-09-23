-- profiles.avatar_url has existed since the very first migration but has never had a
-- bucket behind it: no client code reads or writes it today (grep confirms zero
-- references outside this column's own definition), so there is currently no way for a
-- user to actually set one. This adds the storage infrastructure only, mirroring the
-- existing listing-images bucket exactly (public read; write/update/delete confined to
-- a folder named after the uploader's own uid). Wiring up an upload UI and having
-- applySession()/ProfileEditor read and write avatar_url is separate, deliberately
-- out of scope here -- this migration exists so that work has somewhere safe to land.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880, -- 5 MiB: a single profile photo, smaller than the 10 MiB listing-photo limit
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects for select to public
using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
