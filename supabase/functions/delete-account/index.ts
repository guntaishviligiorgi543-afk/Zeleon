import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const authorization = request.headers.get('Authorization');
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!authorization || !url || !anonKey || !serviceRoleKey) return new Response('Unauthorized', { status: 401 });

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: userError } = await caller.auth.getUser();
  if (userError || !user) return new Response('Unauthorized', { status: 401 });

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return new Response('Account deletion failed', { status: 500 });
  return new Response(null, { status: 204 });
});
