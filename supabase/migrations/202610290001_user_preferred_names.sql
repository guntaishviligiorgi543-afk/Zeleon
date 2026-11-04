create table if not exists public.user_preferred_names (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_name text null check (preferred_name is null or char_length(preferred_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_user_preferred_names_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_preferred_names_updated_at
  on public.user_preferred_names;
create trigger set_user_preferred_names_updated_at
  before update on public.user_preferred_names
  for each row
  execute function public.set_user_preferred_names_updated_at();

alter table public.user_preferred_names enable row level security;
revoke all on public.user_preferred_names from anon, authenticated;
grant select, insert, update on public.user_preferred_names to authenticated;
drop policy if exists "Users can read their own preferred name"
  on public.user_preferred_names;

drop policy if exists "Users can insert their own preferred name"
  on public.user_preferred_names;

drop policy if exists "Users can update their own preferred name"
  on public.user_preferred_names;
create policy "Users can read their own preferred name"
  on public.user_preferred_names for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can insert their own preferred name"
  on public.user_preferred_names for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own preferred name"
  on public.user_preferred_names for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
