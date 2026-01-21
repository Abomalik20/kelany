-- Create storage bucket for guest identity documents and permissive dev policies

-- Create bucket (public read for simplicity in dev) using upsert
insert into storage.buckets (id, name, public)
values ('guest-ids', 'guest-ids', true)
on conflict (id) do update set public = excluded.public;

-- Policies on storage.objects for this bucket (DROP then CREATE; IF NOT EXISTS is not supported)
drop policy if exists dev_select_guest_ids on storage.objects;
create policy dev_select_guest_ids on storage.objects
for select to anon, authenticated
using (bucket_id = 'guest-ids');

drop policy if exists dev_insert_guest_ids on storage.objects;
create policy dev_insert_guest_ids on storage.objects
for insert to anon, authenticated
with check (bucket_id = 'guest-ids');

drop policy if exists dev_update_guest_ids on storage.objects;
create policy dev_update_guest_ids on storage.objects
for update to anon, authenticated
using (bucket_id = 'guest-ids')
with check (bucket_id = 'guest-ids');

drop policy if exists dev_delete_guest_ids on storage.objects;
create policy dev_delete_guest_ids on storage.objects
for delete to anon, authenticated
using (bucket_id = 'guest-ids');
