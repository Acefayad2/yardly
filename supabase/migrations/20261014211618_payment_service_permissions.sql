-- Payment RPCs are invoker-rights: explicitly grant their server role only the
-- existing marketplace privileges they need. Client privileges are unchanged.
grant select on public.listings to service_role;
grant select, insert, update on public.reservations to service_role;
