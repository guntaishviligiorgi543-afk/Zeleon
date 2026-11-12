-- Run with ON_ERROR_STOP. All fixtures and actions roll back, including bans.
-- Uses generated test-only Auth users; never references a real customer ID.
begin;
create temporary table account_test_users(name text, id uuid default gen_random_uuid(), sid uuid default gen_random_uuid(), factor uuid default gen_random_uuid());
insert into account_test_users(name) values ('admin'),('other_admin'),('manager'),('support'),('customer'),('deactivation_customer'),('rpc_customer');
insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)
  select id,id::text || '@account-workflow.invalid',now(),now(),now() from account_test_users;
insert into public.staff_roles(user_id,role,status,appointed_by)
  select id,case when name = 'other_admin' then 'admin' else name end,'active',id
  from account_test_users where name in ('admin','other_admin','manager','support');
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
  select factor,id,'totp','verified',now(),now() from account_test_users where name in ('admin','other_admin','manager','support');
insert into auth.sessions(id,user_id,aal,created_at,updated_at)
  select sid,id,'aal2',now(),now() from account_test_users where name in ('admin','other_admin','manager','support');
insert into private.staff_access_grants(session_id,user_id,expires_at)
  select sid,id,now() + interval '15 minutes' from account_test_users where name in ('admin','other_admin','manager','support');
create function pg_temp.claims(p_name text,p_aal text default 'aal2') returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub',id,'session_id',sid,'aal',p_aal,'role','authenticated')::text,true)
  from account_test_users where name = p_name;
$$;
do $$
declare target uuid; second_target uuid; request jsonb; rejected jsonb; deactivation jsonb; id uuid; count_before bigint;
begin
  select u.id into target from account_test_users u where name = 'customer';
  select u.id into second_target from account_test_users u where name = 'deactivation_customer';
  perform pg_temp.claims('admin','aal1');
  begin
    perform public.customer_account_transition('request',jsonb_build_object('targetUserId',target,'kind','suspend','reason','Abusive or offensive communication toward Support — Detailed evidence for review'));
    raise exception 'FAIL: AAL1 accepted';
  exception when insufficient_privilege then null; end;
  perform pg_temp.claims('support');
  begin
    perform public.customer_account_transition('request',jsonb_build_object('targetUserId',target,'kind','suspend','reason','Abusive or offensive communication toward Support — Detailed evidence for review'));
    raise exception 'FAIL: Support accepted';
  exception when insufficient_privilege then null; end;
  perform pg_temp.claims('admin');
  begin
    perform public.customer_account_transition('request',jsonb_build_object('targetUserId',target,'kind','suspend','reason','Unstructured reason'));
    raise exception 'FAIL: Missing reason category accepted';
  exception when invalid_parameter_value then null; end;
  request := public.customer_account_transition('request',jsonb_build_object('targetUserId',target,'kind','suspend','reason','Abusive or offensive communication toward Support — Detailed evidence for review'));
  id := (request->>'id')::uuid;
  begin
    perform public.customer_account_transition('execute',jsonb_build_object('requestId',id));
    raise exception 'FAIL: Pending request executed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.customer_account_transition('request',jsonb_build_object('targetUserId',target,'kind','suspend','reason','Abusive or offensive communication toward Support — Detailed evidence for review'));
    raise exception 'FAIL: Duplicate request accepted';
  exception when unique_violation then null; end;
  perform pg_temp.claims('manager');
  begin
    perform public.customer_account_transition('decide',jsonb_build_object('requestId',id,'decision','approved','reply',''));
    raise exception 'FAIL: Missing explanation accepted';
  exception when invalid_parameter_value then null; end;
  perform public.customer_account_transition('decide',jsonb_build_object('requestId',id,'decision','approved','reply','Evidence reviewed and confirmed.'));
  if exists(select 1 from public.customer_account_states where user_id = target) or exists(select 1 from auth.users where auth.users.id = target and banned_until > now()) then
    raise exception 'FAIL: Approval automatically restricted customer';
  end if;
  begin
    perform public.customer_account_transition('execute',jsonb_build_object('requestId',id));
    raise exception 'FAIL: Manager executed action';
  exception when insufficient_privilege then null; end;
  perform pg_temp.claims('other_admin');
  begin
    perform public.customer_account_transition('execute',jsonb_build_object('requestId',id));
    raise exception 'FAIL: Other Admin executed action';
  exception when insufficient_privilege then null; end;
  perform pg_temp.claims('admin');
  perform public.customer_account_transition('execute',jsonb_build_object('requestId',id));
  if not exists(select 1 from public.customer_account_states where user_id = target and status = 'suspended') or
     not exists(select 1 from auth.users where auth.users.id = target and banned_until > now()) then raise exception 'FAIL: Restriction not applied'; end if;
  begin
    perform public.customer_account_transition('execute',jsonb_build_object('requestId',id));
    raise exception 'FAIL: Duplicate execution accepted';
  exception when insufficient_privilege then null; end;
  perform pg_temp.claims('customer');
  begin
    insert into public.user_preferred_names(user_id,preferred_name) values(target,'Restricted test user');
    raise exception 'FAIL: Existing customer token can write';
  exception when insufficient_privilege then null; end;
  perform pg_temp.claims('admin');
  rejected := public.customer_account_transition('request',jsonb_build_object('targetUserId',second_target,'kind','deactivate','reason','Suspected payment falsification or fraudulent activity — Detailed evidence for review'));
  perform pg_temp.claims('manager');
  perform public.customer_account_transition('decide',jsonb_build_object('requestId',rejected->>'id','decision','rejected','reply','Evidence is insufficient for this action.'));
  perform pg_temp.claims('admin');
  begin
    perform public.customer_account_transition('execute',jsonb_build_object('requestId',rejected->>'id'));
    raise exception 'FAIL: Rejected request executed';
  exception when insufficient_privilege then null; end;
  deactivation := public.customer_account_transition('request',jsonb_build_object('targetUserId',second_target,'kind','deactivate','reason','Suspected payment falsification or fraudulent activity — Additional evidence confirmed.'));
  perform pg_temp.claims('manager');
  perform public.customer_account_transition('decide',jsonb_build_object('requestId',deactivation->>'id','decision','approved','reply','Additional evidence reviewed and confirmed.'));
  perform pg_temp.claims('admin');
  perform public.customer_account_transition('execute',jsonb_build_object('requestId',deactivation->>'id'));
  if not exists(select 1 from auth.users where auth.users.id = second_target) or not exists(select 1 from public.customer_account_states where user_id = second_target and status = 'deactivated') then raise exception 'FAIL: Deactivation deleted Auth user or lost state'; end if;
  if (select count(*) from public.staff_audit_logs where target_user_id in (target,second_target) and action like 'customer_account_%') <> 8 then raise exception 'FAIL: Incomplete audit trail'; end if;
  -- Exercise the actual Data API role, including wrapper/private-schema grants.
  select u.id into second_target from account_test_users u where name='rpc_customer';
  set local role authenticated;
  perform public.customer_account_transition('request',jsonb_build_object('targetUserId',second_target,'kind','suspend','reason','Abusive or offensive communication toward Support — Detailed evidence for review'));
  reset role;
  update private.staff_access_grants set authenticated_at = now() - interval '16 minutes', expires_at = now() - interval '1 second' where user_id = (select u.id from account_test_users u where name='admin');
  begin
    perform public.customer_account_transition('request',jsonb_build_object('targetUserId',target,'kind','suspend','reason','Abusive or offensive communication toward Support — Detailed evidence for review'));
    raise exception 'FAIL: Expired staff grant accepted';
  exception when insufficient_privilege then null; end;
end;
$$;
select 'PASS: AAL2, role checks, reasons, approval, rejection, owner-only execution, duplicate prevention, account preservation, existing-token restriction, audit and expired grants' as result;
rollback;
