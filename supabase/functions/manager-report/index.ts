import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { createManagerPdf, ReportSnapshot } from './pdf.ts';

const allowedOrigins = new Set(['https://zeleon.store', 'https://www.zeleon.store', 'http://localhost:4200']);
const isAllowedOrigin = (origin: string): boolean => {
  if (allowedOrigins.has(origin)) return true;
  try { const url = new URL(origin); return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.pathname === '/' && !url.search && !url.hash; } catch { return false; }
};
const corsFor = (request: Request): Record<string, string> => {
  const origin = request.headers.get('Origin') ?? '';
  return {
    ...(origin && isAllowedOrigin(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, x-supabase-api-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
};
const json = (request: Request, body: object, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsFor(request),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });

Deno.serve(async (request: Request) => {
  const cors = corsFor(request);
  const origin = request.headers.get('Origin');
  if (origin && !isAllowedOrigin(origin)) return json(request, { error: 'Origin not allowed' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);
  try {
    const authorization = request.headers.get('Authorization');
    const token = authorization?.replace(/^Bearer\s+/i, '');
    if (!authorization?.match(/^Bearer\s+\S+$/i) || !token)
      return json(request, { error: 'Unauthorized' }, 401);
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !key) return json(request, { error: 'Report service unavailable' }, 503);
    const caller = createClient(url, key, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const claims = await caller.auth.getClaims(token);
    if (claims.error || !claims.data?.claims.sub)
      return json(request, { error: 'Unauthorized' }, 401);
    if (claims.data.claims.aal !== 'aal2')
      return json(request, { error: 'Manager MFA required' }, 403);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json(request, { error: 'Invalid request body' }, 400);
    }
    const days =
      typeof body === 'object' && body !== null && !Array.isArray(body)
        ? Number((body as Record<string, unknown>)['days'])
        : NaN;
    if (![7, 30, 90, 365].includes(days))
      return json(request, { error: 'Invalid reporting period' }, 400);
    const grant = await caller.rpc('staff_session');
    if (grant.error || grant.data !== true)
      return json(request, { error: 'Manager session expired' }, 403);
    const snapshot = await caller.rpc('manager_dashboard_snapshot', { p_days: days });
    if (snapshot.error || !snapshot.data)
      return json(
        request,
        { error: 'Manager report denied' },
        snapshot.error?.code === '42501' ? 403 : 500,
      );
    const pdf = createManagerPdf(snapshot.data as ReportSnapshot, days);
    const pdfBody = pdf.buffer.slice(
      pdf.byteOffset,
      pdf.byteOffset + pdf.byteLength,
    ) as ArrayBuffer;
    return new Response(pdfBody, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="zeleon-manager-report-${new Date().toISOString().slice(0, 10)}.pdf"`,
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return json(request, { error: 'Report service unavailable' }, 503);
  }
});
