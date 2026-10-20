-- Run as the database owner using psql -v ON_ERROR_STOP=1 -f this-file.sql.
-- Only random, transaction-local fixtures are touched.
--
-- No storage policy in this project had a test before this file -- listing-images has
-- shipped since the very first migration with the same shape, untested. This exercises
-- that shape (public read; write/update/delete confined to a folder named after the
-- uploader's own uid) via the avatars bucket, as different roles.
begin;
do $$
declare
  owner uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  n integer;
begin
  insert into auth.users (id) values (owner), (outsider);
  -- Seed as the table owner, not anon -- the point of the next block is to prove ANON
  -- CAN READ an object it did not create, not to prove anon can write one.
  insert into storage.objects (bucket_id, name) values ('avatars', owner::text || '/avatar.jpg');

  -- Anonymous can read from a public bucket.
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  select count(*) into n from storage.objects where bucket_id = 'avatars';
  if n <> 1 then raise exception 'FAIL: anon could not see a public avatar object'; end if;

  -- Anonymous cannot upload.
  begin
    insert into storage.objects (bucket_id, name) values ('avatars', owner::text || '/anon-upload.jpg');
    raise exception 'FAIL: anon uploaded an avatar';
  exception when insufficient_privilege then null;
  end;

  -- The owner can upload into their own folder.
  reset role;
  perform set_config('request.jwt.claim.sub', owner::text, true);
  execute 'set local role authenticated';
  insert into storage.objects (bucket_id, name) values ('avatars', owner::text || '/profile.jpg');
  select count(*) into n from storage.objects where bucket_id = 'avatars' and name = owner::text || '/profile.jpg';
  if n <> 1 then raise exception 'FAIL: owner could not upload their own avatar'; end if;

  -- The owner can replace/update their own object.
  update storage.objects set name = owner::text || '/profile-v2.jpg' where name = owner::text || '/profile.jpg';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: owner could not update their own avatar'; end if;

  -- A different authenticated user cannot upload into someone else's folder.
  reset role;
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  execute 'set local role authenticated';
  begin
    insert into storage.objects (bucket_id, name) values ('avatars', owner::text || '/hijack.jpg');
    raise exception 'FAIL: outsider uploaded into another user''s avatar folder';
  exception when insufficient_privilege then null;
  end;

  -- ...nor update...
  update storage.objects set name = 'moved.jpg' where name = owner::text || '/profile-v2.jpg';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: outsider updated another user''s avatar'; end if;

  -- ...nor delete another user's avatar.
  delete from storage.objects where name = owner::text || '/profile-v2.jpg';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: outsider deleted another user''s avatar'; end if;

  -- The owner can delete their own avatar.
  reset role;
  perform set_config('request.jwt.claim.sub', owner::text, true);
  execute 'set local role authenticated';
  delete from storage.objects where name = owner::text || '/profile-v2.jpg';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: owner could not delete their own avatar'; end if;

  raise notice 'PASS: avatars bucket is public-read, owner-scoped for write/update/delete, and denies uploads/edits/deletes outside the caller''s own uid folder';
end $$;
rollback;
select 'PASS: avatar storage rollback suite completed' as result;
