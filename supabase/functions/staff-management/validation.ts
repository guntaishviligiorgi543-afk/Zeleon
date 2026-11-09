export type ManagementInput =
  | { action: 'assign'; email: string; role: 'admin' | 'support' }
  | { action: 'set_status'; targetUserId: string; status: 'active' | 'suspended' | 'on_leave' }
  | { action: 'remove'; targetUserId: string };

export function validManagementInput(value: unknown): value is ManagementInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  if (body.action === 'assign') {
    return Object.keys(body).every(key => ['action', 'email', 'role'].includes(key)) &&
      typeof body.email === 'string' && body.email.length <= 254 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) &&
      (body.role === 'admin' || body.role === 'support');
  }
  if (body.action === 'remove') return Object.keys(body).every(key => ['action','targetUserId'].includes(key)) && typeof body.targetUserId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.targetUserId);
  return body.action === 'set_status' &&
    Object.keys(body).every(key => ['action', 'targetUserId', 'status'].includes(key)) &&
    typeof body.targetUserId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.targetUserId) &&
    (body.status === 'active' || body.status === 'suspended' || body.status === 'on_leave');
}
