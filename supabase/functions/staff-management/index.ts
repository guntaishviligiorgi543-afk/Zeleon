import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { validManagementInput } from './validation.ts';

const allowedOrigins = new Set([
  'https://zeleon.store',
  'https://www.zeleon.store',
  'http://localhost:4200',
]);

export async function handleRequest(
  request: Request,
  createCaller: typeof createClient = createClient,
): Promise<Response> {
  const origin = request.headers.get('Origin');
  const cors: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (origin && allowedOrigins.has(origin)) cors['Access-Control-Allow-Origin'] = origin;
  const json = (body: object, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  // Origin checks supplement JWT/MFA and database authorization, never replace them.
  if (origin && !allowedOrigins.has(origin)) return json({ error: 'Origin not allowed' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.match(/^Bearer\s+\S+$/i)) return json({ error: 'Unauthorized' }, 401);
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !key) return json({ error: 'Staff service unavailable' }, 503);
    const caller = createCaller(url, key, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await caller.auth.getClaims(authorization.replace(/^Bearer\s+/i, ''));
    if (error || !data?.claims.sub) return json({ error: 'Unauthorized' }, 401);
    if (data.claims.aal !== 'aal2') return json({ error: 'Staff MFA required' }, 403);
    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: 'Invalid request body' }, 400); }
    if (!validManagementInput(body)) return json({ error: 'Invalid staff action' }, 400);
    // Caller JWT context: database validates live role/session, grant and MFA.
    const result = body.action === 'assign'
      ? await caller.rpc('staff_assign_by_email', { p_email: body.email, p_role: body.role })
      : await caller.rpc('staff_manage', {
        p_action: body.action, p_target_user_id: body.targetUserId,
        p_role: null, p_status: body.status,
      });
    if (result.error) return json({ error: 'Staff operation rejected' }, result.error.code === '42501' ? 403 : 400);
    return json({ ok: true });
  } catch { return json({ error: 'Staff service unavailable' }, 503); }
}

if (import.meta.main) Deno.serve((request) => handleRequest(request));
