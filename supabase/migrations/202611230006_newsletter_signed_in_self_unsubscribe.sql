-- Only the verified, authenticated mailbox owner may unsubscribe this address.
create or replace function public.newsletter_unsubscribe_my_email()
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_subscriber_id uuid;
begin
  if (select auth.uid()) is null then return false; end if;
  select s.id into v_subscriber_id
  from auth.users u
  join private.newsletter_subscribers s on s.email_normalized = lower(btrim(u.email))
  where u.id = (select auth.uid())
    and u.email_confirmed_at is not null
    and s.status = 'active'
    and s.confirmed_at is not null
  for update of s;
  if v_subscriber_id is null then return false; end if;
  update private.newsletter_subscribers
  set status='unsubscribed', unsubscribed_at=now(), updated_at=now()
  where id=v_subscriber_id and status='active';
  insert into private.newsletter_events(subscriber_id,action,actor_user_id,actor_type)
  values(v_subscriber_id,'unsubscribed',(select auth.uid()),'subscriber');
  return true;
end; $$;
revoke all on function public.newsletter_unsubscribe_my_email() from public,anon,authenticated;
grant execute on function public.newsletter_unsubscribe_my_email() to authenticated;
