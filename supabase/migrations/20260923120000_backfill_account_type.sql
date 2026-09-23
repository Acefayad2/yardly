-- Until now the client wrote account_type = 'both' into every profile on every session
-- sync, so the column carried no information. The client no longer sends the column at
-- all; this one-shot backfill undoes the damage by demoting profiles that have never
-- owned a listing. Anyone who actually hosts keeps 'both'.
--
-- account_type is a UX capability flag only. Listing and reservation access is granted
-- by ownership (listings.host_id = auth.uid()) in RLS; no policy or function reads this
-- column, and none should.
update public.profiles p
set account_type = 'guest'
where p.account_type <> 'guest'
  and not exists (select 1 from public.listings l where l.host_id = p.id);
