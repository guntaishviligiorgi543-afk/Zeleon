-- Newsletter token status is checked through an Edge Function, never directly from public clients.
create or replace function public.newsletter_token_status(p_hash text)
returns text language plpgsql security definer set search_path = ''
as $$
declare v_purpose text; v_consumed timestamptz; v_expiry timestamptz; v_sub_status text;
begin
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return 'invalid'; end if;
 select t.purpose,t.consumed_at,t.expires_at,s.status into v_purpose,v_consumed,v_expiry,v_sub_status
 from private.newsletter_tokens t join private.newsletter_subscribers s on s.id=t.subscriber_id
 where t.token_hash=p_hash and t.purpose='confirm';
 if not found then return 'invalid'; end if;
 if v_consumed is not null and v_sub_status='active' then return 'confirmed'; end if;
 if v_consumed is not null then return 'invalid'; end if;
 if v_expiry<=now() then return 'expired'; end if;
 if v_sub_status='pending_confirmation' then return 'pending'; end if;
 if v_sub_status='active' then return 'confirmed'; end if;
 return 'invalid';
end $$;
revoke all on function public.newsletter_token_status(text) from public,anon,authenticated;
grant execute on function public.newsletter_token_status(text) to service_role;
