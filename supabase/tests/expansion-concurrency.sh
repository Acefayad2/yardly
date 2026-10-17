#!/usr/bin/env bash
# Exercises the expansion workflow locks with genuinely concurrent PostgreSQL
# sessions. Fixtures are committed so both sessions can see them, then removed
# by the EXIT trap. Every racing statement has bounded lock/statement timeouts.
set -uo pipefail

WORK="$(mktemp -d)"
RUN_ID="$$_$(date +%s)"
CLEANED=0
export PGCONNECT_TIMEOUT=5
PSQL_GUARD_OPTIONS="-c statement_timeout=5000 -c lock_timeout=3000"
PROVIDER_OWNER_ID="00000000-0000-0000-0000-000000000000"
CUSTOMER_ID="00000000-0000-0000-0000-000000000000"
STAFF_ID="00000000-0000-0000-0000-000000000000"
SECOND_STAFF_ID="00000000-0000-0000-0000-000000000000"
PROVIDER_ID="00000000-0000-0000-0000-000000000000"
REQUEST_ID="00000000-0000-0000-0000-000000000000"
CLOSE_CASE_ID="00000000-0000-0000-0000-000000000000"
CLOSE_APPLICATION_ID="00000000-0000-0000-0000-000000000000"
EXPIRE_CASE_ID="00000000-0000-0000-0000-000000000000"
EXPIRE_APPLICATION_ID="00000000-0000-0000-0000-000000000000"
SPACE_ID="00000000-0000-0000-0000-000000000000"

psql_q() { PGOPTIONS="$PSQL_GUARD_OPTIONS" timeout 10s psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -q -t -A "$@"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

cleanup() {
  local original_status=$?
  local cleanup_status=0
  local cleanup_log="$WORK/cleanup.out"
  [ "$CLEANED" = "1" ] && return
  CLEANED=1
  trap - EXIT
  wait 2>/dev/null || true
  if ! PGOPTIONS="$PSQL_GUARD_OPTIONS" timeout 20s psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -q >"$cleanup_log" 2>&1 <<SQL
    begin;
    delete from public.provider_request_messages where request_id = '${REQUEST_ID}';
    delete from public.provider_quotes where request_id = '${REQUEST_ID}';
    delete from public.provider_request_items where request_id = '${REQUEST_ID}';
    delete from public.provider_requests where id = '${REQUEST_ID}';
    delete from public.provider_inventory_items where provider_id = '${PROVIDER_ID}';
    delete from public.provider_profiles where id = '${PROVIDER_ID}';
    delete from public.booking_assistance_applications where case_id in ('${CLOSE_CASE_ID}', '${EXPIRE_CASE_ID}');
    delete from public.booking_assistance_suggestions where case_id in ('${CLOSE_CASE_ID}', '${EXPIRE_CASE_ID}');
    delete from public.booking_assistance_fee_previews where case_id in ('${CLOSE_CASE_ID}', '${EXPIRE_CASE_ID}');
    delete from public.booking_assistance_cases where id in ('${CLOSE_CASE_ID}', '${EXPIRE_CASE_ID}');
    delete from public.community_space_checks where space_id = '${SPACE_ID}';
    delete from public.community_space_sources where space_id = '${SPACE_ID}';
    delete from public.community_spaces where id = '${SPACE_ID}';
    delete from public.marketplace_staff where user_id in ('${STAFF_ID}', '${SECOND_STAFF_ID}');
    delete from auth.users where email like 'qa-expansion-concurrency-${RUN_ID}-%';
    do \$cleanup_verify\$
    begin
      if exists (select 1 from public.provider_requests where id = '${REQUEST_ID}')
        or exists (select 1 from public.provider_profiles where id = '${PROVIDER_ID}')
        or exists (select 1 from public.booking_assistance_cases where id in ('${CLOSE_CASE_ID}', '${EXPIRE_CASE_ID}'))
        or exists (select 1 from public.community_spaces where id = '${SPACE_ID}')
        or exists (select 1 from auth.users where email like 'qa-expansion-concurrency-${RUN_ID}-%') then
        raise exception 'Expansion concurrency fixtures remain after cleanup.';
      end if;
    end
    \$cleanup_verify\$;
    commit;
SQL
  then
    cleanup_status=1
    echo "CLEANUP FAIL: expansion concurrency fixture cleanup did not complete" >&2
    cat "$cleanup_log" >&2
  else
    echo "PASS: expansion concurrency fixtures removed and verified absent"
  fi
  if ! rm -rf "$WORK"; then
    cleanup_status=1
    echo "CLEANUP FAIL: could not remove temporary concurrency files at $WORK" >&2
  fi
  if [ "$original_status" -ne 0 ]; then
    [ "$cleanup_status" -eq 0 ] || echo "CLEANUP FAIL: original test failure preserved as exit ${original_status}" >&2
    exit "$original_status"
  fi
  exit "$cleanup_status"
}
trap cleanup EXIT

# Committed synthetic fixtures shared by every concurrent session.
PROVIDER_OWNER_ID="$(psql_q -c 'select gen_random_uuid()')" || fail "cannot reach database"
CUSTOMER_ID="$(psql_q -c 'select gen_random_uuid()')" || fail "could not allocate customer fixture id"
STAFF_ID="$(psql_q -c 'select gen_random_uuid()')" || fail "could not allocate staff fixture id"
SECOND_STAFF_ID="$(psql_q -c 'select gen_random_uuid()')" || fail "could not allocate second staff fixture id"
PROVIDER_ID="$(psql_q -c 'select gen_random_uuid()')" || fail "could not allocate provider fixture id"
REQUEST_ID="$(psql_q -c 'select gen_random_uuid()')" || fail "could not allocate request fixture id"
CLOSE_CASE_ID="$(psql_q -c 'select gen_random_uuid()')" || fail "could not allocate closure fixture id"
CLOSE_APPLICATION_ID="$(psql_q -c 'select gen_random_uuid()')" || fail "could not allocate closure application fixture id"
EXPIRE_CASE_ID="$(psql_q -c 'select gen_random_uuid()')" || fail "could not allocate expiry fixture id"
EXPIRE_APPLICATION_ID="$(psql_q -c 'select gen_random_uuid()')" || fail "could not allocate expiry application fixture id"
SPACE_ID="$(psql_q -c 'select gen_random_uuid()')" || fail "could not allocate directory fixture id"

PGOPTIONS="$PSQL_GUARD_OPTIONS" timeout 20s psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -q <<SQL || fail "could not create expansion concurrency fixtures"
  begin;
  insert into auth.users (id, email) values
    ('${PROVIDER_OWNER_ID}', 'qa-expansion-concurrency-${RUN_ID}-provider@example.com'),
    ('${CUSTOMER_ID}', 'qa-expansion-concurrency-${RUN_ID}-customer@example.com'),
    ('${STAFF_ID}', 'qa-expansion-concurrency-${RUN_ID}-staff@example.com'),
    ('${SECOND_STAFF_ID}', 'qa-expansion-concurrency-${RUN_ID}-second-staff@example.com');
  insert into public.marketplace_staff(user_id) values ('${STAFF_ID}'), ('${SECOND_STAFF_ID}');

  insert into public.provider_profiles(
    id, owner_id, kind, business_name, category, service_area, summary, offerings,
    starting_price, sample_urls, review_state, submitted_at, reviewed_at
  ) values (
    '${PROVIDER_ID}', '${PROVIDER_OWNER_ID}', 'service', 'QA concurrency provider ${RUN_ID}',
    'Photography', 'Test area', 'Synthetic reviewed provider for isolated concurrency testing only.',
    array['Event photography'], 300, array['https://example.com/sample.jpg'], 'approved', now(), now()
  );
  insert into public.provider_requests(
    id, provider_id, customer_id, event_date, start_time, end_time, event_location,
    guest_count, needs, status
  ) values (
    '${REQUEST_ID}', '${PROVIDER_ID}', '${CUSTOMER_ID}', current_date + 30, '14:00', '18:00',
    'Synthetic venue', 50, 'Synthetic request used only to race quote revision and acceptance.', 'quoted'
  );
  insert into public.provider_quotes(
    request_id, full_price, deposit_amount, cancellation_terms, inclusions, revision
  ) values (
    '${REQUEST_ID}', 450, 100, 'Synthetic cancellation terms for concurrency verification.',
    'Synthetic photography coverage and edited gallery.', 1
  );

  insert into public.booking_assistance_cases(
    id, customer_id, event_date, location, guest_count, event_type, needs,
    service_deadline, status, customer_service_accepted_at
  ) values
    ('${CLOSE_CASE_ID}', '${CUSTOMER_ID}', current_date + 40, 'Test city', 40, 'Workshop',
     'Synthetic assistance case used to race closure and submission.', current_date + 35,
     'customer_approved', now()),
    ('${EXPIRE_CASE_ID}', '${CUSTOMER_ID}', current_date + 5, 'Test city', 25, 'Meeting',
     'Synthetic assistance case used to race expiry and confirmation.', current_date - 1,
     'submitted', now());
  insert into public.booking_assistance_fee_previews(case_id) values ('${CLOSE_CASE_ID}'), ('${EXPIRE_CASE_ID}');
  insert into public.booking_assistance_applications(
    id, case_id, sequence, venue_name, official_url, application_text,
    requires_venue_payment, requires_permit, staff_checked_by, customer_approved_at, submitted_at
  ) values
    ('${CLOSE_APPLICATION_ID}', '${CLOSE_CASE_ID}', 1, 'Synthetic Hall', 'https://example.gov/hall',
     'Synthetic approved application used only for isolated concurrency verification.', false, false,
     '${STAFF_ID}', now(), null),
    ('${EXPIRE_APPLICATION_ID}', '${EXPIRE_CASE_ID}', 1, 'Synthetic Center', 'https://example.gov/center',
     'Synthetic submitted application used only for isolated concurrency verification.', false, false,
     '${STAFF_ID}', now(), now());

  insert into public.community_spaces(
    id, name, space_type, location, capacity, amenities, published_pricing,
    restrictions, source_name, created_by, content_revision
  ) values (
    '${SPACE_ID}', 'QA concurrency community space ${RUN_ID}', 'community_center', 'Test city', 100,
    array['Tables'], 'Synthetic published pricing', 'Synthetic restrictions', 'Synthetic official source',
    '${STAFF_ID}', 1
  );
  insert into public.community_space_sources(space_id, official_url)
  values ('${SPACE_ID}', 'https://example.gov/community');
  commit;
SQL

run_race() {
  local race_name="$1" winner_file="$2" loser_file="$3" expected_marker="$4" expected_error="$5"
  local winner_app="yardly-${RUN_ID}-${race_name}-winner"
  local loser_app="yardly-${RUN_ID}-${race_name}-loser"
  local winner_pid loser_pid loser_status ready observed attempt

  PGAPPNAME="$winner_app" timeout 20s psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -q -t -A >"$winner_file" 2>&1 <"${winner_file}.sql" &
  winner_pid=$!

  # The winner calls its RPC before pg_sleep. Seeing that backend in PgSleep
  # proves the RPC returned while its transaction still holds the row lock.
  ready=0
  for attempt in $(seq 1 50); do
    if [ "$(psql_q -c "select count(*) from pg_stat_activity where application_name = '${winner_app}' and state = 'active' and wait_event_type = 'Timeout' and wait_event = 'PgSleep'")" = "1" ]; then
      ready=1
      break
    fi
    kill -0 "$winner_pid" 2>/dev/null || fail "${race_name} winner exited before holding its transaction open: $(cat "$winner_file")"
    sleep 0.1
  done
  [ "$ready" = "1" ] || fail "${race_name} winner did not reach the post-RPC lock-holding window"

  PGAPPNAME="$loser_app" timeout 20s psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -q -t -A >"$loser_file" 2>&1 <"${loser_file}.sql" &
  loser_pid=$!

  # Observe PostgreSQL itself reporting that the loser is blocked by this
  # exact winner. A quick validation failure or unrelated wait cannot pass.
  observed=0
  for attempt in $(seq 1 50); do
    if [ "$(psql_q -c "select count(*) from pg_stat_activity loser join lateral unnest(pg_blocking_pids(loser.pid)) blocker(blocker_pid) on true join pg_stat_activity winner on winner.pid = blocker.blocker_pid where loser.application_name = '${loser_app}' and winner.application_name = '${winner_app}'")" = "1" ]; then
      observed=1
      break
    fi
    kill -0 "$loser_pid" 2>/dev/null || break
    kill -0 "$winner_pid" 2>/dev/null || break
    sleep 0.1
  done
  [ "$observed" = "1" ] || fail "${race_name} loser was never observed blocked by the winning PostgreSQL backend: $(cat "$loser_file")"

  wait "$winner_pid" || fail "winning session failed: $(cat "$winner_file")"
  wait "$loser_pid"; loser_status=$?

  grep -q "$expected_marker" "$winner_file" || fail "winning session produced no marker: $(cat "$winner_file")"
  [ "$loser_status" != "0" ] || fail "losing session unexpectedly succeeded: $(cat "$loser_file")"
  grep -qE "$expected_error" "$loser_file" || fail "losing session failed for the wrong reason: $(cat "$loser_file")"
}

# Provider revision wins its request-row lock; stale acceptance must wait, then fail.
cat >"$WORK/quote-winner.out.sql" <<SQL
begin;
set local statement_timeout = '15s'; set local lock_timeout = '10s';
select set_config('request.jwt.claim.sub', '${PROVIDER_OWNER_ID}', true); set local role authenticated;
select 'QUOTE_REVISED:' || (public.quote_provider_request('${REQUEST_ID}', 500, 125,
  'Revised synthetic cancellation terms for concurrency verification.',
  'Revised synthetic photography coverage and edited gallery.')).id;
select pg_sleep(6);
commit;
SQL
cat >"$WORK/quote-loser.out.sql" <<SQL
begin;
set local statement_timeout = '15s'; set local lock_timeout = '10s';
select set_config('request.jwt.claim.sub', '${CUSTOMER_ID}', true); set local role authenticated;
select (public.accept_provider_quote('${REQUEST_ID}', 1, true)).id;
commit;
SQL
run_race "quote" "$WORK/quote-winner.out" "$WORK/quote-loser.out" "QUOTE_REVISED:${REQUEST_ID}" "40001: The provider changed this quote"

QUOTE_STATE="$(psql_q -c "select revision || ':' || (accepted_at is null)::text from public.provider_quotes where request_id = '${REQUEST_ID}'")"
[ "$QUOTE_STATE" = "2:true" ] || fail "stale acceptance changed the revised quote: ${QUOTE_STATE}"

# Customer closure wins the case-row lock; staff submission must wait, then fail closed.
cat >"$WORK/close-winner.out.sql" <<SQL
begin;
set local statement_timeout = '15s'; set local lock_timeout = '10s';
select set_config('request.jwt.claim.sub', '${CUSTOMER_ID}', true); set local role authenticated;
select 'CASE_CLOSED:' || (public.close_booking_assistance_case('${CLOSE_CASE_ID}', 'Synthetic customer closure won the race.')).id;
select pg_sleep(6);
commit;
SQL
cat >"$WORK/close-loser.out.sql" <<SQL
begin;
set local statement_timeout = '15s'; set local lock_timeout = '10s';
select set_config('request.jwt.claim.sub', '${STAFF_ID}', true); set local role authenticated;
select (public.record_booking_assistance_submission('${CLOSE_APPLICATION_ID}')).id;
commit;
SQL
run_race "close" "$WORK/close-winner.out" "$WORK/close-loser.out" "CASE_CLOSED:${CLOSE_CASE_ID}" "P0002: This assistance case is no longer active for that step"

CLOSE_STATE="$(psql_q -c "select c.status || ':' || (a.submitted_at is null)::text || ':' || f.preview_state from public.booking_assistance_cases c join public.booking_assistance_applications a on a.case_id = c.id join public.booking_assistance_fee_previews f on f.case_id = c.id where c.id = '${CLOSE_CASE_ID}'")"
[ "$CLOSE_STATE" = "closed:true:no_fee" ] || fail "closure/submission race left an invalid state: ${CLOSE_STATE}"

# Expiry wins the same parent lock; a simultaneous confirmation must wait and fail.
cat >"$WORK/expire-winner.out.sql" <<SQL
begin;
set local statement_timeout = '15s'; set local lock_timeout = '10s';
select set_config('request.jwt.claim.sub', '${STAFF_ID}', true); set local role authenticated;
select 'CASE_EXPIRED:' || (public.expire_booking_assistance_case('${EXPIRE_CASE_ID}')).id;
select pg_sleep(6);
commit;
SQL
cat >"$WORK/expire-loser.out.sql" <<SQL
begin;
set local statement_timeout = '15s'; set local lock_timeout = '10s';
select set_config('request.jwt.claim.sub', '${SECOND_STAFF_ID}', true); set local role authenticated;
select (public.confirm_booking_assistance_application('${EXPIRE_APPLICATION_ID}',
  'Synthetic written venue approval evidence.', '', '')).id;
commit;
SQL
run_race "expire" "$WORK/expire-winner.out" "$WORK/expire-loser.out" "CASE_EXPIRED:${EXPIRE_CASE_ID}" "P0002: This assistance case is no longer active for that step"

EXPIRE_STATE="$(psql_q -c "select c.status || ':' || (c.confirmed_at is null)::text || ':' || (a.confirmed_at is null)::text || ':' || f.preview_state from public.booking_assistance_cases c join public.booking_assistance_applications a on a.case_id = c.id join public.booking_assistance_fee_previews f on f.case_id = c.id where c.id = '${EXPIRE_CASE_ID}'")"
[ "$EXPIRE_STATE" = "expired:true:true:no_fee" ] || fail "expiry/confirmation race left an invalid state: ${EXPIRE_STATE}"

# Edit wins the directory-row lock; a check of the old revision must wait and fail.
cat >"$WORK/edit-winner.out.sql" <<SQL
begin;
set local statement_timeout = '15s'; set local lock_timeout = '10s';
select set_config('request.jwt.claim.sub', '${STAFF_ID}', true); set local role authenticated;
select 'SPACE_EDITED:' || (public.save_community_space('${SPACE_ID}',
  'QA concurrency community space ${RUN_ID}', 'community_center', 'Test city', 120,
  array['Tables','Kitchen'], 'Updated synthetic pricing', 'Updated synthetic restrictions',
  'https://example.gov/community-updated', 'Synthetic official source')).id;
select pg_sleep(6);
commit;
SQL
cat >"$WORK/edit-loser.out.sql" <<SQL
begin;
set local statement_timeout = '15s'; set local lock_timeout = '10s';
select set_config('request.jwt.claim.sub', '${SECOND_STAFF_ID}', true); set local role authenticated;
select (public.record_community_space_check('${SPACE_ID}', 1, 'current',
  'Synthetic stale source review must lose to the committed edit.')).id;
commit;
SQL
run_race "edit" "$WORK/edit-winner.out" "$WORK/edit-loser.out" "SPACE_EDITED:${SPACE_ID}" "40001: This directory entry changed. Reload"

SPACE_STATE="$(psql_q -c "select content_revision || ':' || (verified_revision is null)::text || ':' || (last_checked_at is null)::text || ':' || (select count(*) from public.community_space_checks where space_id = '${SPACE_ID}') from public.community_spaces where id = '${SPACE_ID}'")"
[ "$SPACE_STATE" = "2:true:true:0" ] || fail "edit/source-review race left stale verification state: ${SPACE_STATE}"

echo "PASS: pg_blocking_pids observed every stale loser blocked by its winning backend; quote acceptance, assistance terminal transitions, and community source review failed closed after release"
