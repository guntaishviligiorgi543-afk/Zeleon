import { validManagementInput } from './validation.ts';

const targetUserId = '11111111-1111-4111-8111-111111111111';
const email = 'employee@example.com';

Deno.test('accepts email assignment for Admin and Support', () => {
  for (const role of ['admin', 'support']) {
    if (!validManagementInput({ action: 'assign', email, role })) throw new Error('Assignment rejected');
  }
  if (!validManagementInput({ action: 'assign', email: 'Employee+staff@Example.com', role: 'support' })) {
    throw new Error('Valid email rejected');
  }
});

Deno.test('accepts all UUID-based status changes', () => {
  for (const status of ['active', 'suspended', 'on_leave']) {
    if (!validManagementInput({ action: 'set_status', targetUserId, status })) throw new Error('Status rejected');
  }
});

Deno.test('rejects malformed bodies, actor spoofing and unsupported roles', () => {
  for (const body of [null, [], {}, 'assign',
    { action: 'assign', email, role: 'manager' },
    { action: 'assign', email, role: ['support'] },
    { action: 'assign', email },
    { action: 'assign', email, role: 'support', actorUserId: targetUserId },
    { action: 'remove', targetUserId },
    { action: 'set_status', targetUserId, status: 'bad' },
    { action: 'set_status', targetUserId, status: ['active'] },
    { action: 'set_status', targetUserId },
    { action: 'set_status', targetUserId: 'bad', status: 'active' },
    { action: 'set_status', targetUserId: email, status: 'active' },
  ]) {
    if (validManagementInput(body)) throw new Error('Unsafe input accepted');
  }
});

Deno.test('rejects UUID assignments and mixed action fields', () => {
  for (const body of [
    { action: 'assign', targetUserId, role: 'support' },
    { action: 'assign', email, targetUserId, role: 'support' },
    { action: 'assign', email, role: 'support', status: 'active' },
    { action: 'set_status', targetUserId, status: 'active', email },
    { action: 'set_status', targetUserId, status: 'active', role: 'support' },
  ]) {
    if (validManagementInput(body)) throw new Error('Mixed input accepted');
  }
});

Deno.test('rejects missing, invalid and oversized emails', () => {
  for (const invalid of [undefined, null, 123, '', ' ', 'employee', 'employee@',
    '@example.com', 'employee@example', 'employee@@example.com', ' employee@example.com',
    'employee@example.com ', 'employee name@example.com', 'employee@example.com\n',
    'a'.repeat(243) + '@example.com']) {
    if (validManagementInput({ action: 'assign', email: invalid, role: 'support' })) {
      throw new Error('Invalid email accepted');
    }
  }
});
