-- Apply transactionally through Supabase migration tooling against
-- project nunxmgltzvknnmkdvjsw, then record with Supabase apply_migration.
-- No customer tables, policies, auth settings, or data are changed.

create or replace function private.has_staff_access(allowed_roles text[] default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_roles sr
    join private.staff_access_grants sg on sg.user_id = sr.user_id
    join auth.sessions s on s.id = sg.session_id and s.user_id = sr.user_id
    where sr.user_id = (select auth.uid()) and sr.status = 'active'
      and (allowed_roles is null or sr.role = any(allowed_roles))
      and auth.jwt()->>'aal' = 'aal2'
      and sg.session_id = nullif(auth.jwt()->>'session_id', '')::uuid
      and sg.revoked_at is null and sg.expires_at > clock_timestamp()
      and (s.not_after is null or s.not_after > clock_timestamp())
      and exists (select 1 from auth.mfa_factors f where f.user_id = sr.user_id
        and f.factor_type = 'totp' and f.status = 'verified')
  );
$$;
revoke all on function private.has_staff_access(text[]) from public, anon;
grant execute on function private.has_staff_access(text[]) to authenticated;

-- JWT AMR claims originate from Supabase Auth, never from request body/metadata.
-- One issuance per newly password-authenticated session. Expired/revoked grants
-- cannot be reopened with an old aal2 token: sign in and verify TOTP again.
create function public.staff_open_session()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_session uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
begin
  perform 1 from public.staff_roles where user_id = v_user and status = 'active' for update;
  if not found or auth.jwt()->>'aal' is distinct from 'aal2' then
    raise exception 'Active staff and MFA required' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.sessions where id = v_session and user_id = v_user
    and created_at > clock_timestamp() - interval '5 minutes'
    and (not_after is null or not_after > clock_timestamp()))
    or not exists (select 1 from auth.mfa_factors where user_id = v_user
      and factor_type = 'totp' and status = 'verified')
    or not exists (select 1 from jsonb_array_elements(auth.jwt()->'amr') a
      where a->>'method' = 'password'
      and (a->>'timestamp')::numeric between extract(epoch from clock_timestamp() - interval '5 minutes') and extract(epoch from clock_timestamp() + interval '30 seconds'))
    or not exists (select 1 from jsonb_array_elements(auth.jwt()->'amr') a
      where a->>'method' = 'totp'
      and (a->>'timestamp')::numeric between extract(epoch from clock_timestamp() - interval '1 minute') and extract(epoch from clock_timestamp() + interval '30 seconds')) then
    raise exception 'Fresh password and TOTP authentication required' using errcode = '42501';
  end if;
  insert into private.staff_access_grants(session_id, user_id, authenticated_at, expires_at)
    values (v_session, v_user, clock_timestamp(), clock_timestamp() + interval '15 minutes');
  insert into public.staff_audit_logs(actor_user_id,target_user_id,action)
    values(v_user,v_user,'staff_session_opened');
end;
$$;

create function public.staff_session(p_touch boolean default false, p_revoke boolean default false)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  -- Lock role before grant, matching mutation and issuance lock order.
  perform 1 from public.staff_roles where user_id = auth.uid() for share;
  if p_revoke then
    update private.staff_access_grants set revoked_at = now()
      where session_id = nullif(auth.jwt()->>'session_id','')::uuid and user_id = auth.uid() and revoked_at is null;
    return false;
  end if;
  if not private.has_staff_access(null) then return false; end if;
  if p_touch then
    update private.staff_access_grants set expires_at = clock_timestamp() + interval '15 minutes'
      where session_id = nullif(auth.jwt()->>'session_id','')::uuid and user_id = auth.uid()
        and revoked_at is null and expires_at > clock_timestamp();
    return found;
  end if;
  return true;
end;
$$;

create function private.revoke_changed_staff_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update private.staff_access_grants set revoked_at = now()
    where user_id = old.user_id and revoked_at is null;
  return null;
end;
$$;
create trigger staff_role_access_revocation after update of role,status or delete on public.staff_roles
for each row execute function private.revoke_changed_staff_access();
revoke all on function private.revoke_changed_staff_access() from public,anon,authenticated;

-- Called in the caller's JWT context; no client-supplied actor ID.
create function public.staff_manage(p_action text, p_target_user_id uuid, p_role text default null, p_status text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_existing text;
  v_role text;
begin
  -- Serialize management and bootstrap; protects missing-row assignment races.
  perform pg_advisory_xact_lock(82814001);
  select role into v_actor_role from public.staff_roles where user_id=v_actor and status='active' for update;
  if not private.has_staff_access(array['manager','admin']) then
    raise exception 'Staff management denied' using errcode='42501';
  end if;
  if p_target_user_id is null or p_target_user_id=v_actor then raise exception 'Invalid target'; end if;
  select role into v_existing from public.staff_roles where user_id=p_target_user_id for update;
  v_role := coalesce(p_role,v_existing);
  if v_existing='manager' or v_role is null or v_role not in ('admin','support')
    or (v_actor_role='admin' and (v_existing='admin' or v_role<>'support')) then
    raise exception 'Role hierarchy denied' using errcode='42501';
  end if;
  if p_action='assign' then
    if p_status is not null then raise exception 'Unexpected status'; end if;
    insert into public.staff_roles(user_id,role,status,appointed_by)
      values(p_target_user_id,v_role,'active',v_actor)
      on conflict(user_id) do update set role=excluded.role,status='active',appointed_by=v_actor,appointed_at=now(),updated_at=now();
  elsif p_action='set_status' and p_role is null and p_status in ('active','suspended','on_leave') then
    update public.staff_roles set status=p_status,updated_at=now() where user_id=p_target_user_id;
    if not found then raise exception 'Staff assignment not found'; end if;
  else raise exception 'Unsupported action'; end if;
  insert into public.staff_audit_logs(actor_user_id,target_user_id,action,details)
    values(v_actor,p_target_user_id,p_action,jsonb_build_object('old_role',v_existing,'role',v_role,'status',p_status));
  return jsonb_build_object('ok',true);
end;
$$;

-- Service only, invoked by bootstrap-manager AFTER validating secret + caller.
-- Lock, assignment and audit are atomic; auth account must already exist.
create function public.staff_bootstrap_manager(p_user_id uuid, p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(82814001);
  if exists(select 1 from public.staff_roles where role='manager')
    or exists(select 1 from public.staff_audit_logs where action='manager_bootstrapped') then
    raise exception 'Bootstrap already consumed';
  end if;
  if not exists(select 1 from auth.users where id=p_user_id and deleted_at is null and is_anonymous is not true and email_confirmed_at is not null)
    then raise exception 'Existing account required'; end if;
  if not exists(select 1 from auth.sessions where id=p_session_id and user_id=p_user_id
    and (not_after is null or not_after>clock_timestamp())) then
    raise exception 'Live authenticated session required';
  end if;
  insert into public.staff_roles(user_id,role,status) values(p_user_id,'manager','active');
  insert into public.staff_audit_logs(actor_user_id,target_user_id,action)
    values(p_user_id,p_user_id,'manager_bootstrapped');
end;
$$;

revoke all on function public.staff_open_session() from public,anon;
revoke all on function public.staff_session(boolean,boolean) from public,anon;
revoke all on function public.staff_manage(text,uuid,text,text) from public,anon;
grant execute on function public.staff_open_session(),public.staff_session(boolean,boolean),public.staff_manage(text,uuid,text,text) to authenticated;
revoke all on function public.staff_bootstrap_manager(uuid,uuid) from public,anon,authenticated;
grant execute on function public.staff_bootstrap_manager(uuid,uuid) to service_role;

-- Durable throttling for authenticated bootstrap requests; no secrets logged.
create function public.staff_bootstrap_attempt(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(82814002);
  if (select count(*) from public.staff_audit_logs where action='manager_bootstrap_attempt'
      and actor_user_id=p_user_id and created_at>now()-interval '15 minutes') >= 5
    or (select count(*) from public.staff_audit_logs where action='manager_bootstrap_attempt'
      and created_at>now()-interval '15 minutes') >= 30 then return false; end if;
  insert into public.staff_audit_logs(actor_user_id,action) values(p_user_id,'manager_bootstrap_attempt');
  return true;
end;
$$;
revoke all on function public.staff_bootstrap_attempt(uuid) from public,anon,authenticated;
grant execute on function public.staff_bootstrap_attempt(uuid) to service_role;
