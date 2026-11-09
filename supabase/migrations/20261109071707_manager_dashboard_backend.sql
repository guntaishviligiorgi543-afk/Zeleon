-- Manager dashboard read model. All privileged reads require the same
-- short-lived AAL2 staff grant used by the existing RLS policies.

create or replace function public.manager_dashboard_snapshot(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := greatest(7, least(coalesce(p_days, 30), 365));
  v_result jsonb;
begin
  if not private.has_staff_access(array['manager']::text[]) then
    raise exception 'Manager access required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total_customers', (
      select count(*) from auth.users u
       where u.deleted_at is null and u.is_anonymous is not true
         and not exists (select 1 from public.staff_roles sr where sr.user_id = u.id)
    ),
    'total_orders', (select count(*) from public.orders),
    'revenue', (select coalesce(sum(total), 0) from public.orders where payment_status = 'paid'),
    'active_products', (select count(*) from public.products where is_active),
    'active_admins', (select count(*) from public.staff_roles where role = 'admin' and status = 'active'),
    'active_support', (select count(*) from public.staff_roles where role = 'support' and status = 'active'),
    'recent_orders', coalesce((
      select jsonb_agg(to_jsonb(recent) order by recent.created_at desc)
      from (
        select id, order_number, customer_email, customer_first_name, customer_last_name,
               total, currency, order_status, payment_status, created_at
          from public.orders order by created_at desc limit 8
      ) recent
    ), '[]'::jsonb),
    'sales_series', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', series.day::date,
        'revenue', coalesce(paid.revenue, 0),
        'orders', coalesce(paid.orders, 0)
      ) order by series.day)
      from generate_series(current_date - (v_days - 1), current_date, interval '1 day') series(day)
      left join (
        select created_at::date day, sum(total) revenue, count(*) orders
          from public.orders
         where payment_status = 'paid' and created_at >= current_date - (v_days - 1)
         group by created_at::date
      ) paid on paid.day = series.day::date
    ), '[]'::jsonb),
    'customer_growth', coalesce((
      select jsonb_agg(jsonb_build_object('day', series.day::date, 'customers', coalesce(joined.customers, 0)) order by series.day)
      from generate_series(current_date - (v_days - 1), current_date, interval '1 day') series(day)
      left join (
        select u.created_at::date day, count(*) customers
          from auth.users u
         where u.deleted_at is null and u.is_anonymous is not true
           and u.created_at >= current_date - (v_days - 1)
           and not exists (select 1 from public.staff_roles sr where sr.user_id = u.id)
         group by u.created_at::date
      ) joined on joined.day = series.day::date
    ), '[]'::jsonb),
    'product_performance', coalesce((
      select jsonb_agg(to_jsonb(product) order by product.revenue desc, product.units desc)
      from (
        select oi.product_id, oi.product_name, sum(oi.quantity)::bigint units, sum(oi.line_total) revenue
          from public.order_items oi
          join public.orders o on o.id = oi.order_id
         where o.payment_status = 'paid'
         group by oi.product_id, oi.product_name
         order by revenue desc, units desc limit 10
      ) product
    ), '[]'::jsonb),
    'recent_activity', coalesce((
      select jsonb_agg(to_jsonb(activity) order by activity.created_at desc)
      from (
        select logs.id, logs.action, actor.email::text actor_email, target.email::text target_email, logs.created_at
          from public.staff_audit_logs logs
          left join auth.users actor on actor.id = logs.actor_user_id
          left join auth.users target on target.id = logs.target_user_id
         order by logs.created_at desc limit 10
      ) activity
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.manager_staff_directory()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_staff_access(array['manager']::text[]) then
    raise exception 'Manager access required' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', sr.user_id,
      'email', u.email,
      'role', sr.role,
      'status', sr.status,
      'appointed_at', sr.appointed_at,
      'updated_at', sr.updated_at
    ) order by case sr.role when 'manager' then 0 when 'admin' then 1 else 2 end, u.email)
    from public.staff_roles sr
    join auth.users u on u.id = sr.user_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.manager_dashboard_snapshot(integer) from public, anon;
revoke all on function public.manager_staff_directory() from public, anon;
grant execute on function public.manager_dashboard_snapshot(integer), public.manager_staff_directory() to authenticated;

-- Manager assignments must point to an active Support employee. The existing
-- policy allowed any UUID; tightening WITH CHECK keeps UI and direct API calls aligned.
drop policy if exists manager_update_conversation on public.support_conversations;
create policy manager_update_conversation
  on public.support_conversations for update to authenticated
  using (private.has_staff_access(array['manager']::text[]))
  with check (
    private.has_staff_access(array['manager']::text[])
    and (
      assigned_support_id is null
      or exists (
        select 1 from public.staff_roles sr
         where sr.user_id = assigned_support_id and sr.role = 'support' and sr.status = 'active'
      )
    )
  );

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_paid_created_at_idx on public.orders (created_at desc) where payment_status = 'paid';
create index if not exists support_conversations_updated_at_idx on public.support_conversations (updated_at desc);
