begin;
do $$
declare
  staff_id uuid := gen_random_uuid(); outsider_id uuid := gen_random_uuid(); v_space_id uuid; v_revision bigint; n integer; blocked boolean;
begin
  insert into auth.users(id) values (staff_id), (outsider_id);
  insert into public.marketplace_staff(user_id) values (staff_id);
  perform set_config('request.jwt.claim.sub', outsider_id::text, true); execute 'set local role authenticated';
  blocked := false;
  begin
    perform public.save_community_space(null, 'Forged Park', 'park', 'Washington, DC', 100, array['Tables'], 'See official site', 'Permit required', 'https://example.gov/park', 'City parks');
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'FAIL: outsider created directory entry'; end if;

  perform set_config('request.jwt.claim.sub', staff_id::text, true);
  select id, content_revision into v_space_id, v_revision from public.save_community_space(null, 'QA Recreation Center', 'recreation_center', 'Washington, DC', 180, array['Gym','Kitchen'], '$75 per hour', 'Permit and insurance may be required.', 'https://example.gov/recreation', 'District recreation department');

  -- Never verified: both verification fields are NULL.
  blocked := false;
  begin perform public.set_community_space_published(v_space_id, true); exception when invalid_parameter_value then blocked := true; end;
  if not blocked then raise exception 'FAIL: never-verified directory entry published'; end if;
  blocked := false;
  begin perform public.set_community_space_published(v_space_id, null); exception when invalid_parameter_value then blocked := true; end;
  if not blocked then raise exception 'FAIL: NULL publication decision was accepted'; end if;

  -- A fresh timestamp must not compensate for a NULL verified revision.
  execute 'reset role';
  update public.community_spaces set last_checked_at = now(), verified_revision = null where id = v_space_id;
  execute 'set local role authenticated';
  blocked := false;
  begin perform public.set_community_space_published(v_space_id, true); exception when invalid_parameter_value then blocked := true; end;
  if not blocked then raise exception 'FAIL: NULL verified revision published'; end if;

  -- A failed source check must remain unpublished.
  perform public.record_community_space_check(v_space_id, v_revision, 'changed', 'Official source changed before initial publication.');
  blocked := false;
  begin perform public.set_community_space_published(v_space_id, true); exception when invalid_parameter_value then blocked := true; end;
  if not blocked then raise exception 'FAIL: failed source check published'; end if;

  -- A matching verification expires after seven days.
  perform public.record_community_space_check(v_space_id, v_revision, 'current', 'Official page checked; displayed price and restrictions are current.');
  execute 'reset role';
  update public.community_spaces set last_checked_at = now() - interval '8 days' where id = v_space_id;
  execute 'set local role authenticated';
  blocked := false;
  begin perform public.set_community_space_published(v_space_id, true); exception when invalid_parameter_value then blocked := true; end;
  if not blocked then raise exception 'FAIL: stale source check published'; end if;

  -- Only a matching, fresh successful check can publish.
  perform public.record_community_space_check(v_space_id, v_revision, 'current', 'Official page rechecked; displayed price and restrictions are current.');
  perform public.set_community_space_published(v_space_id, true);
  select count(*) into n from public.community_spaces
  where id = v_space_id and is_published and verified_revision = content_revision
    and last_checked_at >= now() - interval '7 days';
  if n <> 1 then raise exception 'FAIL: matching fresh verification did not publish'; end if;

  perform set_config('request.jwt.claim.sub', outsider_id::text, true);
  select count(*) into n from public.community_spaces where id = v_space_id and is_published;
  if n <> 1 then raise exception 'FAIL: verified directory entry not public'; end if;
  select count(*) into n from public.community_space_sources where community_space_sources.space_id = v_space_id;
  if n <> 1 then raise exception 'FAIL: fresh official source link not public'; end if;

  perform set_config('request.jwt.claim.sub', staff_id::text, true);
  select content_revision into v_revision from public.save_community_space(v_space_id, 'QA Recreation Center', 'recreation_center', 'Washington, DC', 180, array['Gym','Kitchen'], '$80 per hour', 'Permit and insurance may be required.', 'https://example.gov/recreation', 'District recreation department');
  blocked := false;
  begin perform public.record_community_space_check(v_space_id, v_revision - 1, 'current', 'This review targeted stale content and must be rejected.'); exception when serialization_failure then blocked := true; end;
  if not blocked then raise exception 'FAIL: stale content revision was marked verified'; end if;
  blocked := false;
  begin perform public.set_community_space_published(v_space_id, true); exception when invalid_parameter_value then blocked := true; end;
  if not blocked then raise exception 'FAIL: edited revision published using an older successful verification'; end if;
  perform public.record_community_space_check(v_space_id, v_revision, 'current', 'Updated price and restrictions verified against the saved entry.');
  perform public.set_community_space_published(v_space_id, true);
  perform public.record_community_space_check(v_space_id, v_revision, 'changed', 'Official source changed; entry requires a staff update.');
  blocked := false;
  begin perform public.set_community_space_published(v_space_id, true); exception when invalid_parameter_value then blocked := true; end;
  if not blocked then raise exception 'FAIL: changed source check allowed immediate republishing'; end if;
  perform set_config('request.jwt.claim.sub', outsider_id::text, true);
  select count(*) into n from public.community_spaces where id = v_space_id;
  if n <> 0 then raise exception 'FAIL: changed entry remained public'; end if;
  select count(*) into n from public.community_space_sources where community_space_sources.space_id = v_space_id;
  if n <> 0 then raise exception 'FAIL: stale or changed official link remained public'; end if;
end;
$$;
rollback;
select 'PASS: staff-only directory, source checks, publish gate, and unpublish-on-change; fixtures rolled back' as result;
