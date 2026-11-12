import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const productionOrigins = new Set(['https://zeleon.store', 'https://www.zeleon.store']);
function isAllowedOrigin(origin: string): boolean {
  if (productionOrigins.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      url.username === '' && url.password === '' &&
      url.pathname === '/' && url.search === '' && url.hash === '';
  } catch { return false; }
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export async function handleRequest(request: Request, makeClient = createClient, send = fetch): Promise<Response> {
  const origin = request.headers.get('Origin');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info,x-supabase-api-version',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
  };
  if (origin && isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !isAllowedOrigin(origin)) return json({ error: 'Origin not allowed' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.match(/^Bearer\s+\S+$/i)) return json({ error: 'Unauthorized' }, 401);
    const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anon || !service) return json({ error: 'Account service unavailable' }, 503);
    const caller = makeClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const claims = await caller.auth.getClaims(authorization.replace(/^Bearer\s+/i, ''));
    if (claims.error || !claims.data?.claims.sub) return json({ error: 'Unauthorized' }, 401);
    if (claims.data.claims.aal !== 'aal2') return json({ error: 'Staff MFA required' }, 403);
    const session = await caller.rpc('staff_session', { p_touch: false });
    if (session.error || session.data !== true) return json({ error: 'Active staff session required' }, 403);
    const assignment = await caller.from('staff_roles').select('role,status').eq('user_id', claims.data.claims.sub).single();
    if (assignment.error || assignment.data?.status !== 'active' || !['admin', 'manager'].includes(assignment.data.role)) return json({ error: 'Forbidden' }, 403);
    const role = assignment.data.role;
    let body: Record<string, unknown>;
    try {
      const value = await request.json();
      if (!value || typeof value !== 'object' || Array.isArray(value)) return json({ error: 'Invalid request' }, 400);
      body = value;
    } catch { return json({ error: 'Invalid request body' }, 400); }
    const action = body['action'];
    if (!['list', 'request', 'decide', 'execute'].includes(String(action))) return json({ error: 'Unknown action' }, 400);
    if ((action === 'decide' && role !== 'manager') || (['request', 'execute'].includes(String(action)) && role !== 'admin')) return json({ error: 'Role not permitted' }, 403);
    const db = makeClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    if (action === 'list') {
      // Do not silently omit customers after the Auth API's first page.
      const customers = [];
      for (let page = 1; ; page++) {
        const result = await db.auth.admin.listUsers({ page, perPage: 500 });
        if (result.error) throw result.error;
        customers.push(...result.data.users);
        if (!result.data.nextPage) break;
        if (page >= 100) throw new Error('Customer directory requires pagination');
      }
      async function rows<T extends Record<string, unknown>>(table: string, columns: string, key: string) {
        const all: T[] = [];
        for (let offset = 0; ; offset += 500) {
          let query = db.from(table).select(columns).order(key).range(offset, offset + 499);
          if (table === 'customer_account_actions' && role === 'admin') query = query.eq('requested_by', claims.data!.claims.sub);
          const result = await query.returns<T[]>();
          if (result.error || !result.data) throw new Error('Customer directory unavailable');
          all.push(...result.data);
          if (result.data.length < 500) return all;
          if (offset >= 50_000) throw new Error('Directory requires server pagination');
        }
      }
      const states = await rows<{user_id:string;status:string}>('customer_account_states', 'user_id,status', 'user_id');
      const roles = await rows<{user_id:string}>('staff_roles', 'user_id', 'user_id');
      const requests = await rows('customer_account_actions', '*', 'id');
      requests.sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)));
      const staffIds = new Set(roles.map(r => r.user_id));
      const statuses = new Map(states.map(r => [r.user_id, r.status]));
      return json({ users: customers.filter(u => !staffIds.has(u.id) && !u.is_anonymous).map(u => ({ id: u.id, email: u.email ?? '', created_at: u.created_at, status: statuses.get(u.id) ?? 'active' })), requests });
    }
    // Every transition reauthorizes and commits atomically under the caller JWT.
    const result = await caller.rpc('customer_account_transition', { p_action: action, p_payload: body });
    if (result.error) {
      const status = result.error.code === '42501' ? 403 : result.error.code === '23505' ? 409 : 400;
      return json({ error: result.error.message }, status);
    }
    const record = result.data;
    const resend = Deno.env.get('RESEND_API_KEY');
    async function mail(to: string, subject: string, message: string): Promise<boolean> {
      if (!resend) return false;
      try {
        const response = await send('https://api.resend.com/emails', {
          method: 'POST', headers: { Authorization: `Bearer ${resend}`, 'Content-Type': 'application/json', 'Idempotency-Key': `${record.id}/${action}/${to}` },
          body: JSON.stringify({ from: 'ZELEON <no-reply@zeleon.store>', to: [to], subject, html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px"><h2>ZELEON</h2><p style="white-space:pre-line;line-height:1.7">${escapeHtml(message)}</p><p>ZELEON Support · zeleon.store</p></div>` }),
        });
        return response.ok;
      } catch { return false; }
    }
    let emailSent = false;
    // Notification failures must not turn a committed action into a retryable error.
    try {
      if (action === 'request') {
        const managers = await db.from('staff_roles').select('user_id').eq('role', 'manager').eq('status', 'active');
        const target = await db.auth.admin.getUserById(record.target_user_id);
        const results = [];
        for (const manager of managers.data ?? []) {
          const recipient = await db.auth.admin.getUserById(manager.user_id);
          if (recipient.data.user?.email) results.push(await mail(recipient.data.user.email, 'ZELEON — Customer action approval requested', `An Admin requested ${record.action} for ${target.data.user?.email ?? record.target_user_id}.\nReason: ${record.reason}\nReview in Manager → Users.`));
        }
        emailSent = !managers.error && results.length > 0 && results.every(Boolean);
      } else {
        const recipient = await db.auth.admin.getUserById(action === 'decide' ? record.requested_by : record.target_user_id);
        if (recipient.data.user?.email) emailSent = await mail(recipient.data.user.email,
          action === 'decide' ? `ZELEON — Manager decision: ${record.status}` : 'ZELEON — Important account notice',
          action === 'decide' ? `Your request to ${record.action} a customer was ${record.status}.\nManager explanation: ${record.manager_reply}\nOpen Admin → Users to review. Approval does not execute the action.` : `Your ZELEON account has been ${record.action === 'suspend' ? 'suspended' : 'deactivated'}.\nReason: ${record.reason}\nYour order and payment records are preserved. For assistance, contact ZELEON Support.`);
      }
    } catch { emailSent = false; }
    if (!emailSent) console.warn('Customer account notification not confirmed', record.id, action);
    return json({ record, emailSent });
  } catch { return json({ error: 'Account service unavailable. Please try again.' }, 503); }
}

if (import.meta.main) Deno.serve(request => handleRequest(request));
