import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { validManagementInput } from './validation.ts';

const allowedOrigins = new Set([
  'https://zeleon.store',
  'https://www.zeleon.store',
  'http://localhost:4200',
]);

function escapeHtml(value: string): string { return value.replace(/[&<>\"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch] || ch)); }
function staffEmail(role: 'admin' | 'support', removed: boolean): string {
 const label = role === 'admin' ? 'Admin' : 'Support';
 const title = removed ? 'Your team access has been updated' : 'Welcome to the ZELEON team!';
 const message = removed ? `Your ${label} role has been removed. Your staff workspace access has ended, but your regular ZELEON customer account remains available.` : `Your ZELEON account has been granted the ${label} role. Your team workspace is ready for you.`;
 const action = removed ? 'VISIT ZELEON' : 'ACCESS YOUR WORKSPACE';
 const link = removed ? 'https://zeleon.store' : 'https://zeleon.store/manager';
 return `<!doctype html><html lang="en"><body style="margin:0;background:#eef7ff;font-family:Arial,Helvetica,sans-serif;color:#17324d"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef7ff;padding:36px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #d6e9f8;border-radius:20px"><tr><td align="center" style="padding:32px 22px;background:#eaf5ff;border-bottom:1px solid #d6e9f8"><div style="font-size:30px;font-weight:900;letter-spacing:4px;color:#55aee8">⚡ ZELEON</div><div style="font-size:11px;letter-spacing:2px;color:#6687a1;margin-top:10px">FUEL YOUR AMBITION</div></td></tr><tr><td style="padding:34px 30px"><div style="font-size:11px;font-weight:bold;letter-spacing:2px;color:#8c68d9">TEAM ACCESS UPDATE</div><h1 style="font-size:26px;line-height:1.25;margin:14px 0;color:#17324d">${escapeHtml(title)}</h1><p style="font-size:15px;line-height:1.8;color:#425d75">${escapeHtml(message)}</p><div style="padding:15px;background:#f3f9ff;border:1px solid #d6e9f8;border-radius:12px;font-size:14px"><b>Role:</b> ${label}<br><b>Staff access:</b> ${removed ? 'Removed' : 'Active'}</div><table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px auto"><tr><td bgcolor="#8fd0f5" style="border-radius:30px"><a href="${link}" style="display:inline-block;padding:15px 28px;color:#17324d;text-decoration:none;font-size:12px;font-weight:bold">${action}</a></td></tr></table><p style="font-size:13px;line-height:1.7;color:#647f97">${removed ? 'Thank you for your contribution to our team.' : 'We are excited to have you on board.'} If this change was unexpected, please contact ZELEON support.</p><p style="font-size:14px;color:#425d75">Stay energized,<br><b>The ZELEON Team</b></p></td></tr><tr><td align="center" style="background:#f3f9ff;padding:22px;font-size:12px;color:#718da3">ZELEON.STORE · Automated account notification</td></tr></table></td></tr></table></body></html>`;
}

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
    let recipient = body.action === 'assign' ? body.email : '';
    let notifyRole: 'admin' | 'support' = body.action === 'assign' ? body.role : 'support';
    if (body.action === 'remove') {
      const directory = await caller.rpc('manager_staff_directory');
      if (directory.error) return json({ error: 'Staff directory unavailable' }, 403);
      const target = (directory.data as Array<{user_id:string;email:string;role:string}>).find(row => row.user_id === body.targetUserId);
      if (!target || !['admin','support'].includes(target.role)) return json({ error: 'Staff operation rejected' }, 403);
      recipient = target.email;
      notifyRole = target.role as 'admin' | 'support';
    }
    const result = body.action === 'assign'
      ? await caller.rpc('staff_assign_by_email', { p_email: body.email, p_role: body.role })
      : await caller.rpc('staff_manage', {
        p_action: body.action, p_target_user_id: body.targetUserId,
        p_role: null, p_status: body.action === 'set_status' ? body.status : null,
      });
    if (result.error) return json({ error: 'Staff operation rejected' }, result.error.code === '42501' ? 403 : 400);
    if (body.action === 'set_status') return json({ ok: true });
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ ok: true, notificationSent: false });
    try {
      const removed = body.action === 'remove';
      const sent = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({from:'ZELEON <no-reply@zeleon.store>',to:[recipient],subject:removed ? 'ZELEON — Your Team Access Has Been Updated' : `Welcome to the ZELEON Team — ${notifyRole === 'admin' ? 'Admin' : 'Support'} Access`,html:staffEmail(notifyRole,removed)}),
      });
      if (!sent.ok) console.error('Staff notification rejected:',sent.status);
      return json({ok:true,notificationSent:sent.ok});
    } catch { return json({ok:true,notificationSent:false}); }
  } catch { return json({ error: 'Staff service unavailable' }, 503); }
}

if (import.meta.main) Deno.serve((request) => handleRequest(request));
