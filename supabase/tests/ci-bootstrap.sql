-- Minimal Supabase roles/schemas for an isolated PostgreSQL CI database.
-- Not a replacement for integration testing against Supabase Auth/Storage.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema storage;
create schema extensions;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth, storage, extensions to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/'); $$;
create publication supabase_realtime;
