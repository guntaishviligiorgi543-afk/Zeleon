-- Isolated PostgreSQL fixture. Never run against a hosted project.
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema private; create schema storage;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
create table auth.users(id uuid primary key);
create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
create table auth.mfa_factors(user_id uuid,factor_type text,status text);
create table public.staff_roles(user_id uuid,role text,status text);
create table private.staff_access_grants(user_id uuid,session_id uuid,revoked_at timestamptz,expires_at timestamptz);
create function private.has_staff_access(allowed_roles text[] default null) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.staff_roles sr join private.staff_access_grants sg on sg.user_id=sr.user_id join auth.sessions s on s.id=sg.session_id and s.user_id=sr.user_id where sr.user_id=auth.uid() and sr.status='active' and (allowed_roles is null or sr.role=any(allowed_roles)) and auth.jwt()->>'aal'='aal2' and sg.session_id=nullif(auth.jwt()->>'session_id','')::uuid and sg.revoked_at is null and sg.expires_at>clock_timestamp() and (s.not_after is null or s.not_after>clock_timestamp()) and exists(select 1 from auth.mfa_factors f where f.user_id=sr.user_id and f.factor_type='totp' and f.status='verified'));
$$;
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
create table storage.buckets(id text primary key,file_size_limit bigint,allowed_mime_types text[]);
create function storage.extension(text) returns text language sql immutable as $$ select split_part($1,'.',-1) $$;
insert into storage.buckets values('product-images',10485760,array['image/png','image/jpeg','image/webp']);

grant usage on schema public,private,auth,storage to anon,authenticated,service_role;
