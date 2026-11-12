-- Reconcile the previously dashboard-only schema into source control.
create table if not exists public.customer_account_actions (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id),
  requested_by uuid not null references auth.users(id),
  action text not null check (action in ('suspend','deactivate')),
  reason text not null check (length(trim(reason)) between 10 and 2000),
  status text not null default 'pending' check (status in ('pending','approved','rejected','executed')),
  manager_id uuid references auth.users(id), manager_reply text,
  created_at timestamptz not null default now(), reviewed_at timestamptz,
  executed_at timestamptz, executed_by uuid references auth.users(id)
);
create table if not exists public.customer_account_states (
  user_id uuid primary key references auth.users(id),
  status text not null check (status in ('suspended','deactivated')),
  reason text not null, action_id uuid references public.customer_account_actions(id),
  changed_at timestamptz not null default now()
);
alter table public.customer_account_actions enable row level security;
alter table public.customer_account_states enable row level security;
revoke all on public.customer_account_actions, public.customer_account_states from anon, authenticated;
grant select on public.customer_account_actions, public.customer_account_states to service_role;

-- The private implementation serializes with staff_manage, then revalidates the
-- live staff role, MFA, auth session, and unexpired workspace grant on every call.
create or replace function private.customer_account_transition(p_action text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_role text; v_target uuid;
  v_record public.customer_account_actions; v_reason text; v_reply text; v_label text;
begin
  perform pg_advisory_xact_lock(82814001);
  select role into v_role from public.staff_roles where user_id = v_actor and status = 'active' for update;
  if not private.has_staff_access(array['admin','manager']) then
    raise exception 'Active staff MFA session required' using errcode = '42501';
  end if;
  if p_action = 'request' then
    if v_role <> 'admin' then raise exception 'Admin role required' using errcode = '42501'; end if;
    v_target := (p_payload->>'targetUserId')::uuid;
    v_reason := trim(p_payload->>'reason');
    if p_payload->>'kind' is null or p_payload->>'kind' not in ('suspend','deactivate') or v_reason is null or length(v_reason) > 2000 then
      raise exception 'Invalid request' using errcode = '22023';
    end if;
    select label into v_label from unnest(array[
      'Abusive or offensive communication toward Support',
      'Suspected payment falsification or fraudulent activity',
      -- Accept the same categories from already-open, previous frontend builds.
      'Abusive or offensive language toward Support',
      'Suspected payment falsification or fraud attempt'
    ]) label where starts_with(v_reason, label || ' — ') and length(trim(substr(v_reason, length(label) + 4))) >= 10;
    if v_label is null then raise exception 'Select a reason and provide supporting details' using errcode = '22023'; end if;
    perform 1 from auth.users where id = v_target and deleted_at is null and is_anonymous is not true for update;
    if not found then raise exception 'Customer not found' using errcode = '22023'; end if;
    if exists(select 1 from public.staff_roles where user_id = v_target) or exists(select 1 from public.customer_account_states where user_id = v_target) then
      raise exception 'An active customer account is required' using errcode = '42501';
    end if;
    if exists(select 1 from public.customer_account_actions where target_user_id = v_target and status in ('pending','approved')) then
      raise exception 'An active request already exists' using errcode = '23505';
    end if;
    insert into public.customer_account_actions(target_user_id, requested_by, action, reason)
      values(v_target, v_actor, p_payload->>'kind', v_reason) returning * into v_record;
  elsif p_action in ('decide','execute') then
    select * into v_record from public.customer_account_actions where id = (p_payload->>'requestId')::uuid for update;
    if not found then raise exception 'Request not found' using errcode = '22023'; end if;
    if p_action = 'decide' then
      if v_role <> 'manager' or v_record.requested_by = v_actor then raise exception 'Independent Manager required' using errcode = '42501'; end if;
      v_reply := trim(p_payload->>'reply');
      if p_payload->>'decision' is null or p_payload->>'decision' not in ('approved','rejected') or v_reply is null or length(v_reply) not between 10 and 2000 then
        raise exception 'Provide a decision and explanation of 10 to 2000 characters' using errcode = '22023';
      end if;
      if v_record.status <> 'pending' then raise exception 'Request no longer pending' using errcode = '23505'; end if;
      update public.customer_account_actions set status = p_payload->>'decision', manager_id = v_actor,
        manager_reply = v_reply, reviewed_at = now() where id = v_record.id returning * into v_record;
    else
      if v_role <> 'admin' or v_record.requested_by <> v_actor or v_record.status <> 'approved' or v_record.manager_id is null or v_record.manager_id = v_actor then
        raise exception 'Only the requesting Admin can execute an approved action' using errcode = '42501';
      end if;
      if exists(select 1 from public.staff_roles where user_id = v_record.target_user_id) then raise exception 'Cannot restrict staff' using errcode = '42501'; end if;
      -- Ban, backend restriction, request status and audit entry commit together.
      -- Never delete the Auth user or any order/payment/history record.
      update auth.users set banned_until = now() + interval '100 years', updated_at = now()
        where id = v_record.target_user_id and deleted_at is null;
      if not found then raise exception 'Customer not found' using errcode = '22023'; end if;
      insert into public.customer_account_states(user_id,status,reason,action_id,changed_at)
        values(v_record.target_user_id,case when v_record.action = 'suspend' then 'suspended' else 'deactivated' end,v_record.reason,v_record.id,now())
        on conflict(user_id) do update set status = excluded.status, reason = excluded.reason, action_id = excluded.action_id, changed_at = excluded.changed_at;
      update public.customer_account_actions set status = 'executed', executed_by = v_actor, executed_at = now()
        where id = v_record.id returning * into v_record;
    end if;
  else raise exception 'Unknown action' using errcode = '22023';
  end if;
  insert into public.staff_audit_logs(actor_user_id,target_user_id,action,details)
    values(v_actor,v_record.target_user_id,'customer_account_' || p_action,
      jsonb_build_object('request_id',v_record.id,'status',v_record.status,'action',v_record.action));
  return to_jsonb(v_record);
end;
$$;
revoke all on function private.customer_account_transition(text,jsonb) from public, anon;
grant execute on function private.customer_account_transition(text,jsonb) to authenticated;
create or replace function public.customer_account_transition(p_action text, p_payload jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.customer_account_transition(p_action,p_payload);
$$;
revoke all on function public.customer_account_transition(text,jsonb) from public, anon;
grant execute on function public.customer_account_transition(text,jsonb) to authenticated;

-- Auth bans stop new sign-ins; these checks also stop already-issued JWTs.
-- Triggers cover definer RPC writes as well as ordinary Data API writes.
create or replace function private.enforce_customer_account_active()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and exists(select 1 from public.customer_account_states where user_id = auth.uid()) then
    raise exception 'Customer account is restricted' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_customer_account_active() from public, anon, authenticated;
do $$
declare v_table text;
begin
  foreach v_table in array array['orders','order_items','support_conversations','support_messages','support_ratings','support_chat_presence','support_chat_hidden_conversations','support_acknowledgements','user_preferred_names'] loop
    execute format('create trigger customer_account_active before insert or update on public.%I for each row execute function private.enforce_customer_account_active()', v_table);
  end loop;
end;
$$;
