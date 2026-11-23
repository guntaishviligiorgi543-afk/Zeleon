-- Membership is private: only the authenticated user's verified email may be checked.
create or replace function public.newsletter_my_active_status()
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from auth.users u
    join private.newsletter_subscribers s on s.email_normalized = lower(btrim(u.email))
    where u.id = (select auth.uid())
      and u.email_confirmed_at is not null
      and s.status = 'active'
      and s.confirmed_at is not null
  );
$$;
revoke all on function public.newsletter_my_active_status() from public, anon, authenticated;
grant execute on function public.newsletter_my_active_status() to authenticated;
