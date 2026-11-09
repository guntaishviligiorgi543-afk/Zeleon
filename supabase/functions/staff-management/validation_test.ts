import { validManagementInput } from './validation.ts';
const targetUserId = '11111111-1111-4111-8111-111111111111';
Deno.test('rejects malformed bodies, actor spoofing and manager assignment', () => {
  for (const body of [null, [], {}, { action: 'assign', targetUserId, role: 'manager' },
    { action: 'assign', targetUserId, role: 'support', actorUserId: targetUserId },
    { action: 'assign', targetUserId: 'bad', role: 'support' },
    { action: 'remove', targetUserId }, { action: 'set_status', targetUserId, status: 'bad' },
    { action: 'set_status', targetUserId, status: 'active', role: 'support' }]) {
    if (validManagementInput(body)) throw new Error('Unsafe input accepted');
  }
});
Deno.test('accepts only supported assignments and status changes', () => {
  for (const role of ['admin', 'support']) {
    if (!validManagementInput({ action: 'assign', targetUserId, role })) throw new Error('Assignment rejected');
  }
  for (const status of ['active', 'suspended', 'on_leave']) {
    if (!validManagementInput({ action: 'set_status', targetUserId, status })) throw new Error('Status rejected');
  }
});
