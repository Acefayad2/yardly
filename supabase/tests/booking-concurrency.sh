#!/usr/bin/env bash
# Proves invariant 7 -- "overlapping reservations for the same listing cannot both be
# valid" -- under GENUINE concurrency.
#
# Why this is not another *-rollback.sql file: those suites run serially inside a single
# transaction. They prove the exclusion constraint rejects an overlap that is already
# committed. They cannot prove the interesting case, which is two sessions racing:
#
#   session A: begin; create_reservation(14:00-16:00); <holds uncommitted row>; commit
#   session B:        begin; create_reservation(15:00-17:00)  -- must BLOCK, then fail
#
# A naive "check availability, then insert" implementation passes every serial test and
# fails this one, because both sessions would see a free slot before either wrote. The
# blocking is the point: B must wait on A's uncommitted row rather than race past it.
#
# Fixtures are COMMITTED, because two sessions must both see them. Everything is
# namespaced by a run id and removed by an EXIT trap, on success or failure.
set -uo pipefail

WORK="$(mktemp -d)"
RUN_ID="$$_$(date +%s)"
CLEANED=0

psql_q() { psql -v ON_ERROR_STOP=1 -q -t -A "$@"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

cleanup() {
  [ "$CLEANED" = "1" ] && return
  CLEANED=1
  wait 2>/dev/null || true
  psql -q -o /dev/null >/dev/null 2>&1 <<SQL || true
    delete from public.reservations where listing_id in (select id from public.listings where title = 'QA concurrency ${RUN_ID}');
    delete from public.listing_addresses where listing_id in (select id from public.listings where title = 'QA concurrency ${RUN_ID}');
    delete from public.listings where title = 'QA concurrency ${RUN_ID}';
    delete from auth.users where email like 'qa-${RUN_ID}-%';
SQL
  rm -rf "$WORK"
}
trap cleanup EXIT

# ---------------------------------------------------------------- fixtures (committed)
HOST="$(psql_q -c "select gen_random_uuid()")"   || fail "cannot reach database"
GUEST_A="$(psql_q -c "select gen_random_uuid()")"
GUEST_B="$(psql_q -c "select gen_random_uuid()")"
LISTING="$(psql_q -c "select gen_random_uuid()")"
BOOKING_DAY="$(psql_q -c "select (current_date + 30)::text")"

psql -v ON_ERROR_STOP=1 -q <<SQL || fail "could not create fixtures"
  insert into auth.users (id, email) values
    ('${HOST}',    'qa-${RUN_ID}-host@example.com'),
    ('${GUEST_A}', 'qa-${RUN_ID}-a@example.com'),
    ('${GUEST_B}', 'qa-${RUN_ID}-b@example.com');
  insert into public.listings
    (id, host_id, title, location, neighborhood, timezone, space_type, hourly_price,
     min_hours, capacity, description, images, latitude, longitude, status)
  values
    ('${LISTING}', '${HOST}', 'QA concurrency ${RUN_ID}', 'Test city', 'Test area',
     'America/Los_Angeles', 'Backyards', 19.99, 2, 5,
     'Temporary concurrency fixture, removed on exit.',
     array['https://example.com/test.jpg'], 34, -118, 'published');
  insert into public.listing_addresses (listing_id, street_address)
  values ('${LISTING}', '1 QA Concurrency Way, Test City, TS 00000');
SQL

# ------------------------------------------------------------------ the race itself
# A books and then holds its transaction open for 6s before committing, giving B a
# window in which A's conflicting row exists but is not yet visible.
psql -v ON_ERROR_STOP=1 -q -t -A >"$WORK/a.out" 2>&1 <<SQL &
  begin;
  select set_config('request.jwt.claim.sub', '${GUEST_A}', true);
  set local role authenticated;
  select 'A-booked:' || (public.create_reservation('${LISTING}', '${BOOKING_DAY}', '14:00', '16:00', 2)).id;
  select pg_sleep(6);
  commit;
SQL
A_PID=$!

sleep 2   # let A get its row in before B starts

B_START=$(date +%s)
psql -v ON_ERROR_STOP=1 -q -t -A >"$WORK/b.out" 2>&1 <<SQL &
  begin;
  select set_config('request.jwt.claim.sub', '${GUEST_B}', true);
  set local role authenticated;
  select 'B-booked:' || (public.create_reservation('${LISTING}', '${BOOKING_DAY}', '15:00', '17:00', 2)).id;
  commit;
SQL
B_PID=$!

wait "$A_PID"; A_STATUS=$?
wait "$B_PID"; B_STATUS=$?
B_ELAPSED=$(( $(date +%s) - B_START ))

# ----------------------------------------------------------------------- assertions
[ "$A_STATUS" = "0" ] || fail "session A could not book an empty slot: $(cat "$WORK/a.out")"
grep -q "A-booked:" "$WORK/a.out" || fail "session A produced no reservation: $(cat "$WORK/a.out")"

if grep -q "B-booked:" "$WORK/b.out"; then
  fail "BOTH sessions booked the same overlapping slot -- invariant 7 is broken: $(cat "$WORK/b.out")"
fi
[ "$B_STATUS" != "0" ] || fail "session B exited 0 despite not booking: $(cat "$WORK/b.out")"

grep -qE "23P01|exclusion|no longer available" "$WORK/b.out" \
  || fail "session B failed, but not with an overlap error -- something else is rejecting it: $(cat "$WORK/b.out")"

# If B had raced past A instead of waiting on the uncommitted row, it would have
# returned almost immediately. Blocking until A committed is the actual guarantee.
[ "$B_ELAPSED" -ge 3 ] \
  || fail "session B failed in ${B_ELAPSED}s without blocking on A -- it was rejected by a check, not serialized by the constraint"

ACTIVE="$(psql_q -c "select count(*) from public.reservations where listing_id = '${LISTING}' and status in ('pending','confirmed')")"
[ "$ACTIVE" = "1" ] || fail "expected exactly 1 active reservation, found ${ACTIVE}"

WINNER="$(psql_q -c "select guest_id from public.reservations where listing_id = '${LISTING}' and status in ('pending','confirmed')")"
[ "$WINNER" = "${GUEST_A}" ] || fail "the committed reservation belongs to the wrong guest: ${WINNER}"

echo "PASS: two concurrent sessions raced for the same slot; the loser blocked ${B_ELAPSED}s on the winner's uncommitted row and then failed with an overlap error; exactly one reservation survived"
