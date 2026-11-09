export interface ManagementInput {
  action: 'assign' | 'set_status';
  targetUserId?: string;
  email?: string;
  role?: 'admin' | 'support';
  status?: 'active' | 'suspended' | 'on_leave';
}
export function validManagementInput(value: unknown): value is ManagementInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !['action', 'targetUserId', 'email', 'role', 'status'].includes(key))) return false;
  if (body.action === 'assign') return typeof body.email === 'string' && body.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) && body.targetUserId === undefined && ['admin', 'support'].includes(String(body.role)) && body.status === undefined;
  if (typeof body.targetUserId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.targetUserId)) return false;
  return body.action === 'set_status' && body.email === undefined && body.role === undefined && ['active', 'suspended', 'on_leave'].includes(String(body.status));
}
