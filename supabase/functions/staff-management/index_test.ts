import { handleRequest } from './index.ts';

const origins = ['https://zeleon.store', 'https://www.zeleon.store', 'http://localhost:4200'];
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function request(origin: string, method = 'POST', body = '{"action":"assign","email":"employee@example.com","role":"support"}', authenticated = true) {
  return new Request('https://example.com/functions/v1/staff-management', {
    method,
    headers: { Origin: origin, ...(authenticated ? { Authorization: 'Bearer test-user-jwt' } : {}),
      'Content-Type': 'application/json', 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,apikey,content-type,x-client-info' },
    ...(method === 'POST' ? { body } : {}),
  });
}
function checkCors(response: Response, origin: string) {
  assert(response.headers.get('Access-Control-Allow-Origin') === origin, 'Origin mismatch');
  assert(response.headers.get('Vary') === 'Origin', 'Missing Vary');
  assert(response.headers.get('Access-Control-Allow-Methods') === 'POST, OPTIONS', 'Wrong methods');
  for (const header of ['authorization', 'apikey', 'content-type', 'x-client-info']) {
    assert(response.headers.get('Access-Control-Allow-Headers')?.includes(header), 'Missing header');
  }
}

Deno.test('preflight allows each explicit origin without authentication', async () => {
  for (const origin of origins) {
    const response = await handleRequest(request(origin, 'OPTIONS', '', false));
    assert(response.status === 204, 'Preflight rejected');
    checkCors(response, origin);
  }
});

Deno.test('rejects untrusted origins without reflecting them or using wildcard CORS', async () => {
  for (const origin of ['https://evil.example', 'https://zeleon.store.evil.example', 'null']) {
    for (const method of ['OPTIONS', 'POST']) {
      const response = await handleRequest(request(origin, method));
      assert(response.status === 403, 'Untrusted origin accepted');
      assert(!response.headers.has('Access-Control-Allow-Origin'), 'Untrusted origin exposed');
    }
  }
});

Deno.test('success and every handler error retain CORS; caller JWT and RPC routing preserved', async () => {
  const oldUrl = Deno.env.get('SUPABASE_URL');
  const oldKey = Deno.env.get('SUPABASE_ANON_KEY');
  try {
    Deno.env.set('SUPABASE_URL', 'https://example.supabase.co');
    Deno.env.set('SUPABASE_ANON_KEY', 'test-public-key');
    for (const origin of origins) {
      for (const scenario of ['assign', 'status', 'jwt', 'mfa', 'json', 'input', 'permission', 'rpc', 'throw', 'missing-auth', 'method', 'config']) {
        const calls: Array<[string, unknown]> = [];
        const createCaller = ((_url: string, _key: string, options: { global: { headers: { Authorization: string } } }) => {
          assert(options.global.headers.Authorization === 'Bearer test-user-jwt', 'Caller JWT lost');
          return {
            auth: { getClaims: (token: string) => {
              assert(token === 'test-user-jwt', 'Wrong verification token');
              return Promise.resolve({ data: { claims: { sub: 'caller-id', aal: scenario === 'mfa' ? 'aal1' : 'aal2' } }, error: scenario === 'jwt' ? {} : null });
            } },
            rpc: (name: string, args: unknown) => {
              calls.push([name, args]);
              if (scenario === 'throw') throw new Error('private database details');
              return Promise.resolve({ error: scenario === 'permission' ? { code: '42501' } : scenario === 'rpc' ? { code: 'other' } : null });
            },
          };
        }) as unknown as NonNullable<Parameters<typeof handleRequest>[1]>;
        const body = scenario === 'status'
          ? '{"action":"set_status","targetUserId":"11111111-1111-4111-8111-111111111111","status":"active"}'
          : scenario === 'json' ? '{' : scenario === 'input' ? '{}' : undefined;
        if (scenario === 'config') Deno.env.delete('SUPABASE_ANON_KEY');
        const response = await handleRequest(request(origin, scenario === 'method' ? 'GET' : 'POST', body, scenario !== 'missing-auth'), createCaller);
        Deno.env.set('SUPABASE_ANON_KEY', 'test-public-key');
        checkCors(response, origin);
        const expected = ['assign', 'status'].includes(scenario) ? 200
          : ['jwt', 'missing-auth'].includes(scenario) ? 401
          : ['mfa', 'permission'].includes(scenario) ? 403
          : scenario === 'method' ? 405 : ['throw', 'config'].includes(scenario) ? 503 : 400;
        assert(response.status === expected, `Wrong status for ${scenario}`);
        const text = await response.text();
        assert(!text.includes('private database details'), 'Internal error exposed');
        if (scenario === 'assign') {
          assert(JSON.stringify(calls) === JSON.stringify([['staff_assign_by_email', { p_email: 'employee@example.com', p_role: 'support' }]]), 'Assignment routing changed');
        } else if (scenario === 'status') {
          assert(JSON.stringify(calls) === JSON.stringify([['staff_manage', { p_action: 'set_status', p_target_user_id: '11111111-1111-4111-8111-111111111111', p_role: null, p_status: 'active' }]]), 'Status routing changed');
        } else if (!['permission', 'rpc', 'throw'].includes(scenario)) {
          assert(calls.length === 0, 'Unauthorized/invalid RPC executed');
        }
      }
    }
  } finally {
    if (oldUrl === undefined) Deno.env.delete('SUPABASE_URL'); else Deno.env.set('SUPABASE_URL', oldUrl);
    if (oldKey === undefined) Deno.env.delete('SUPABASE_ANON_KEY'); else Deno.env.set('SUPABASE_ANON_KEY', oldKey);
  }
});
