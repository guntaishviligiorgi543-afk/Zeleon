-- Removing customer history never deletes support messages, ratings or staff records.
create table public.support_chat_hidden_conversations (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);
create index support_chat_hidden_conversation_idx on public.support_chat_hidden_conversations(conversation_id);
alter table public.support_chat_hidden_conversations enable row level security;
revoke all on public.support_chat_hidden_conversations from anon, authenticated;
grant select, insert, delete on public.support_chat_hidden_conversations to authenticated;

create policy "customers read own hidden history"
  on public.support_chat_hidden_conversations for select to authenticated
  using (user_id = (select auth.uid()));
create policy "customers hide own conversations"
  on public.support_chat_hidden_conversations for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.support_conversations c
    where c.id = conversation_id and c.customer_user_id = (select auth.uid())
  ));
create policy "customers restore own history"
  on public.support_chat_hidden_conversations for delete to authenticated
  using (user_id = (select auth.uid()));

create function public.customer_support_history()
returns table(id uuid, subject text, status text, updated_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.subject, c.status, c.updated_at
  from public.support_conversations c
  where c.customer_user_id = (select auth.uid())
    and not exists (select 1 from public.support_chat_hidden_conversations h
      where h.user_id = (select auth.uid()) and h.conversation_id = c.id)
  order by c.updated_at desc, c.id;
$$;

create function public.customer_hide_support_history(p_conversation_id uuid default null)
returns uuid[] language sql security invoker set search_path = '' as $$
  with hidden as (
    insert into public.support_chat_hidden_conversations(user_id, conversation_id)
    select (select auth.uid()), c.id from public.support_conversations c
    where c.customer_user_id = (select auth.uid())
      and (p_conversation_id is null or c.id = p_conversation_id)
    on conflict do nothing
    returning conversation_id
  ) select coalesce(array_agg(conversation_id), '{}'::uuid[]) from hidden;
$$;

create function public.customer_restore_support_history(p_conversation_ids uuid[])
returns bigint language sql security invoker set search_path = '' as $$
  with restored as (
    delete from public.support_chat_hidden_conversations
    where user_id = (select auth.uid()) and conversation_id = any(p_conversation_ids)
    returning conversation_id
  ) select count(*) from restored;
$$;

revoke all on function public.customer_support_history() from public, anon;
revoke all on function public.customer_hide_support_history(uuid) from public, anon;
revoke all on function public.customer_restore_support_history(uuid[]) from public, anon;
grant execute on function public.customer_support_history() to authenticated;
grant execute on function public.customer_hide_support_history(uuid) to authenticated;
grant execute on function public.customer_restore_support_history(uuid[]) to authenticated;
