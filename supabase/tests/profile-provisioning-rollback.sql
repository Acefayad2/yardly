-- Transactional fixtures only; safe to run as database owner. No external effects.
begin;
do $$
declare
  bare uuid := gen_random_uuid();
  named uuid := gen_random_uuid();
  blank uuid := gen_random_uuid();
  long_name uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  n integer; rejected boolean; got_name text; got_type text;
begin
  -- A bare insert (no email, no metadata) still provisions a usable profile row --
  -- exactly the shape every other rollback suite's fixtures use.
  insert into auth.users(id) values(bare);
  select full_name, account_type into got_name, got_type from public.profiles where id = bare;
  if got_name <> 'Yardly user' then raise exception 'FAIL: bare signup got full_name %, expected the fallback', got_name; end if;
  if got_type <> 'guest' then raise exception 'FAIL: bare signup got account_type %, expected guest', got_type; end if;

  -- Metadata full_name is used when present.
  insert into auth.users(id, raw_user_meta_data) values(named, jsonb_build_object('full_name', 'Real Name'));
  select full_name into got_name from public.profiles where id = named;
  if got_name <> 'Real Name' then raise exception 'FAIL: metadata full_name not used, got %', got_name; end if;

  -- Empty/whitespace metadata falls back to the email local-part, then the literal fallback.
  insert into auth.users(id, email, raw_user_meta_data) values(blank, 'qa.fixture@example.com', jsonb_build_object('full_name', '   '));
  select full_name into got_name from public.profiles where id = blank;
  if got_name <> 'qa.fixture' then raise exception 'FAIL: blank metadata did not fall back to email local-part, got %', got_name; end if;

  -- An overlong name is truncated to satisfy the 100-char check rather than aborting signup.
  insert into auth.users(id, raw_user_meta_data) values(long_name, jsonb_build_object('full_name', repeat('x', 250)));
  select full_name into got_name from public.profiles where id = long_name;
  if char_length(got_name) <> 100 then raise exception 'FAIL: overlong name not truncated, length %', char_length(got_name); end if;

  -- Idempotency: re-provisioning an id the trigger already handled is a no-op.
  insert into public.profiles(id, full_name) values(bare, 'Should not overwrite') on conflict (id) do nothing;
  select full_name into got_name from public.profiles where id = bare;
  if got_name <> 'Yardly user' then raise exception 'FAIL: on-conflict-do-nothing did not hold, got %', got_name; end if;

  -- profiles_insert_own is unchanged: an ordinary authenticated user still cannot insert
  -- a profile row for someone else. The trigger is the only privileged path in.
  insert into auth.users(id) values(outsider);
  -- Remove the trigger-provisioned row (as table owner, pre-role-switch, bypassing RLS)
  -- so the next insert genuinely exercises profiles_insert_own instead of colliding
  -- with the primary key the trigger already claimed.
  delete from public.profiles where id = outsider;

  perform set_config('request.jwt.claim.sub', bare::text, true);
  execute 'set local role authenticated';
  rejected := false;
  begin insert into public.profiles(id, full_name) values(outsider, 'Forged');
  exception when sqlstate '42501' then rejected := true; end;
  if not rejected then raise exception 'FAIL: an authenticated user inserted a profile for another id'; end if;
end;
$$;
rollback;
select 'PASS: signup trigger provisions profiles with safe fallbacks, is idempotent, and profiles_insert_own is unchanged; fixtures rolled back' as result;
