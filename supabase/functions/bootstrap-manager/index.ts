import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';

const response = (status: number, error?: string) => new Response(JSON.stringify(error ? { ok: false, error } : { ok: status === 200 }), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
async function equalSecret(actual: string, expected: string): Promise<boolean> {
  const digest = (value: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const [a, b] = await Promise.all([digest(actual), digest(expected)]);
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return response(405);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_ANON_KEY');
    const authorization = request.headers.get('Authorization');
    if (!authorization?.match(/^Bearer\s+\S+$/i)) return response(401);
    if (!url || !key) return response(503);
    const rawBody = await request.text();
    if (rawBody.trim()) {
      let body: unknown;
      try { body = JSON.parse(rawBody); } catch { return response(400, 'Invalid JSON request body'); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0) return response(400, 'Request body must be empty');
    }
    const caller = createClient(url, key, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await caller.auth.getUser();
    if (error || !data.user || data.user.is_anonymous) return response(403);
    const verified = await caller.auth.getClaims(authorization.replace(/^Bearer\s+/i, ''));
    const sessionId = verified.data?.claims.session_id;
    if (verified.error || verified.data?.claims.sub !== data.user.id || typeof sessionId !== 'string') return response(401);
    if (verified.data?.claims.aal !== 'aal2') return response(403);
    // Configuration is examined only after authenticating a real caller.
    const secret = Deno.env.get('STAFF_BOOTSTRAP_SECRET');
    const target = '81282c6b-37a8-42b9-8e46-409f56b2fb05';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!secret || secret.length < 32 || !serviceKey) return response(503, 'Bootstrap service is not configured');
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const attempt = await admin.rpc('staff_bootstrap_attempt', { p_user_id: data.user.id });
    if (attempt.error) return response(503, 'Bootstrap throttling is unavailable');
    if (attempt.data !== true) return response(429, 'Bootstrap rate limit exceeded');
    const supplied = request.headers.get('x-staff-bootstrap-secret') ?? '';
    if (supplied.length > 512 || !await equalSecret(supplied, secret)) return response(401, 'Bootstrap secret rejected');
    if (data.user.id !== target) return response(403, 'Bootstrap target mismatch');
    const result = await admin.rpc('staff_bootstrap_manager', { p_user_id: data.user.id, p_session_id: sessionId });
    return response(result.error ? 409 : 200, result.error ? 'Bootstrap was rejected by the server' : undefined);
  } catch { return response(503); }
});
