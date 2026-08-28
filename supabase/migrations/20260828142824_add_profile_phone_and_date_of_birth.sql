alter table public.profiles
  add column if not exists phone_number text,
  add column if not exists date_of_birth date;

alter table public.profiles
  drop constraint if exists profiles_phone_number_format,
  add constraint profiles_phone_number_format
    check (phone_number is null or phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  drop constraint if exists profiles_date_of_birth_range,
  add constraint profiles_date_of_birth_range
    check (date_of_birth is null or date_of_birth between date '1900-01-01' and current_date);
