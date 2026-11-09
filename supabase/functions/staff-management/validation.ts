export interface ManagementInput {
  action: 'assign' | 'set_status';
  targetUserId: string;
  role?: 'admin' | 'support';
  status?: 'active' | 'suspended' | 'on_leave';
}
export function validManagementInput(value: unknown): value is ManagementInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !['action', 'targetUserId', 'role', 'status'].includes(key))) return false;
  if (typeof body.targetUserId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.targetUserId)) return false;
  return body.action === 'assign'
    ? ['admin', 'support'].includes(String(body.role)) && body.status === undefined
    : body.action === 'set_status' && body.role === undefined && ['active', 'suspended', 'on_leave'].includes(String(body.status));
}
