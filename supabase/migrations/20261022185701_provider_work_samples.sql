-- Originals stay private until referenced by an approved profile. No overwrites:
-- approved content cannot be swapped after staff review.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('provider-work-samples', 'provider-work-samples', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp']);

create policy "provider_samples_owner_insert" on storage.objects
for insert to authenticated with check (
  bucket_id = 'provider-work-samples'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "provider_samples_reviewed_read" on storage.objects
for select to anon, authenticated using (
  bucket_id = 'provider-work-samples'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (select 1 from public.marketplace_staff where user_id = (select auth.uid()))
    or exists (
      select 1 from public.provider_profiles p, unnest(p.sample_urls) as sample(url)
      where p.review_state = 'approved'
        and p.owner_id::text = (storage.foldername(name))[1]
        and right(sample.url, length('/storage/v1/object/authenticated/provider-work-samples/' || name))
          = '/storage/v1/object/authenticated/provider-work-samples/' || name
    )
  )
);
