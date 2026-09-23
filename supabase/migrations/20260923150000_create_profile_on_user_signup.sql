-- Guarantee every auth.users row gets a matching public.profiles row even if the
-- client never runs its post-login upsert (tab closed right after email
-- confirmation, crash, network failure). Fires AFTER INSERT on auth.users, in the
-- same transaction as signup, so it must never raise: any exception here rolls
-- back the entire signup. Insert is deliberately minimal -- id + full_name only.
-- account_type/avatar_url/created_at/updated_at all have defaults; phone_number/
-- date_of_birth are nullable. applySession() in src/lib/store.tsx fills those in
-- from validated form input once a real session exists.
create or replace function private.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Yardly user'
      ),
      100
    )
  )
  on conflict (id) do nothing;
  return new;
exception
  when others then
    -- Never block a real signup over a profile-row problem; applySession()'s
    -- own upsert is a second chance to create this row.
    raise warning 'private.handle_new_user_profile failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

revoke all on function private.handle_new_user_profile() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user_profile();
