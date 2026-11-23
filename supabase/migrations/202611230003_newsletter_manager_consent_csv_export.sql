create or replace function public.newsletter_manager_consent_export()
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_total bigint; v_rows jsonb;
begin
  if (select auth.uid()) is null or not private.has_staff_access(null) then
    raise exception 'Verified staff session required' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.staff_roles
    where user_id = (select auth.uid()) and role::text = 'manager' and status = 'active'
  ) then
    raise exception 'Manager access required' using errcode='42501';
  end if;
  select count(*) into v_total from private.newsletter_subscribers;
  if v_total > 10000 then
    raise exception 'Report exceeds 10000 rows; use paginated server export' using errcode='54000';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'email', s.email, 'status', s.status, 'consent_source', s.consent_source,
    'consent_policy_version', s.consent_policy_version, 'consent_at', s.consent_at,
    'confirmed_at', s.confirmed_at, 'unsubscribed_at', s.unsubscribed_at,
    'created_at', s.created_at
  ) order by s.created_at desc, s.id), '[]'::jsonb)
  into v_rows from private.newsletter_subscribers s;
  return jsonb_build_object('subscribers', v_rows, 'count', v_total);
end;
$function$;
revoke all on function public.newsletter_manager_consent_export() from public, anon, authenticated;
grant execute on function public.newsletter_manager_consent_export() to authenticated;
