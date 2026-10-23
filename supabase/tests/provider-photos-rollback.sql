begin;
do $$
declare
  provider uuid := gen_random_uuid();
  staff uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  profile_id uuid;
  path text;
  n integer;
  blocked boolean := false;
begin
  insert into auth.users(id) values (provider), (staff), (outsider);
  insert into public.marketplace_staff(user_id) values (staff);
  path := provider::text || '/photo.jpg';
  perform set_config('request.jwt.claim.sub', provider::text, true);
  execute 'set local role authenticated';
  insert into storage.objects(bucket_id,name) values ('provider-work-samples',path);
  select count(*) into n from storage.objects where bucket_id='provider-work-samples' and name=path;
  if n <> 1 then raise exception 'Owner cannot read uploaded sample'; end if;
  insert into public.provider_profiles(owner_id,kind,business_name,category,service_area,summary,offerings,starting_price,sample_urls)
  values (provider,'service','Photo QA','Photography','DMV','A private profile used only for photo storage rollback verification.',array['Event photos'],250,
    array['https://vfwbtfkmzxaehbsbrojx.supabase.co/storage/v1/object/authenticated/provider-work-samples/' || path]) returning id into profile_id;
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  select count(*) into n from storage.objects where bucket_id='provider-work-samples' and name=path;
  if n <> 0 then raise exception 'Private sample exposed to outsider'; end if;
  begin
    insert into storage.objects(bucket_id,name) values ('provider-work-samples',provider::text || '/forged.jpg');
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Forged upload allowed'; end if;
  perform set_config('request.jwt.claim.sub', provider::text, true);
  perform public.submit_provider_profile(profile_id);
  update storage.objects set name=path where bucket_id='provider-work-samples' and name=path;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Sample overwrite allowed'; end if;
  perform set_config('request.jwt.claim.sub', staff::text, true);
  select count(*) into n from storage.objects where bucket_id='provider-work-samples' and name=path;
  if n <> 1 then raise exception 'Staff cannot read pending sample'; end if;
  perform public.review_provider_profile(profile_id,'approved','Checked work sample and provider details.');
  perform set_config('request.jwt.claim.sub','',true);
  execute 'set local role anon';
  select count(*) into n from storage.objects where bucket_id='provider-work-samples' and name=path;
  if n <> 1 then raise exception 'Approved sample not publicly readable'; end if;
end;
$$;
rollback;
