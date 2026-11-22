-- Publicly displayable customer profile photos; writes are restricted to account owners.
create table if not exists public.user_avatars (
  user_id uuid primary key references auth.users(id) on delete cascade,
  storage_path text not null,
  updated_at timestamptz not null default now(),
  constraint user_avatars_owned_path check (storage_path like user_id::text || '/%')
);
alter table public.user_avatars enable row level security;
grant select, insert, update, delete on public.user_avatars to authenticated;
create policy "Users read their avatar" on public.user_avatars for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users add their avatar" on public.user_avatars for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their avatar" on public.user_avatars for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete their avatar" on public.user_avatars for delete to authenticated using ((select auth.uid()) = user_id);
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('avatars','avatars',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy "Avatar owners upload" on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Avatar owners select" on storage.objects for select to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Avatar owners delete" on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
