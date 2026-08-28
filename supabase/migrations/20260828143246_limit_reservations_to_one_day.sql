alter table public.reservations
  drop constraint if exists reservations_max_hourly_duration,
  add constraint reservations_max_hourly_duration
    check (end_at <= start_at + interval '14 hours');
