import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../../../services/supabase';
import { StaffAccess } from '../../../services/staff-access';
import { Auth } from '../../../services/auth';
import { ManagerUsers } from './manager-users';
import { MANAGER_ROUTES } from '../manager.routes';
import { ADMIN_ROUTES } from '../../staff-workspace/admin.routes';

describe('Customer account workspace', () => {
  const customer = {
    id: 'customer',
    email: 'customer@example.test',
    created_at: '2026-11-01',
    status: 'active' as const,
  };
  const approved = {
    id: 'request',
    target_user_id: customer.id,
    requested_by: 'admin',
    action: 'suspend' as const,
    reason: 'Supporting evidence',
    status: 'approved' as const,
    manager_reply: 'Approved after review',
    created_at: '2026-11-01',
  };
  let role: 'admin' | 'manager';
  let invoke: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    role = 'admin';
    invoke = vi
      .fn()
      .mockResolvedValue({ data: { users: [customer], requests: [approved] }, error: null });
    TestBed.configureTestingModule({
      imports: [ManagerUsers],
      providers: [
        { provide: SUPABASE_CLIENT, useValue: { functions: { invoke } } },
        { provide: StaffAccess, useValue: { role: () => role } },
        { provide: Auth, useValue: { user: signal({ id: 'admin' }) } },
      ],
    });
  });
  afterEach(() => vi.restoreAllMocks());
  async function create() {
    const fixture = TestBed.createComponent(ManagerUsers);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  it('resolves both lazy Users routes to the shared component', async () => {
    for (const routes of [ADMIN_ROUTES, MANAGER_ROUTES]) {
      const loader = routes.find((route) => route.path === 'users')!.loadComponent!;
      expect(await TestBed.runInInjectionContext(() => loader())).toBe(ManagerUsers);
    }
    expect(ADMIN_ROUTES.find((route) => route.path === 'users')!.data?.['staffRole']).toBe('admin');
  });
  it('lists email, registration date and status, and searches case-insensitively', async () => {
    const fixture = await create();
    const page = fixture.componentInstance;
    expect(fixture.nativeElement.textContent).toContain(customer.email);
    expect(fixture.nativeElement.textContent).toContain('Nov 1, 2026');
    expect(fixture.nativeElement.textContent).toContain('active');
    page.search.set('CUSTOMER@');
    expect(page.filtered()).toEqual([customer]);
    page.search.set('missing');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No matching customers');
  });
  it('requires a reason and detailed evidence before requesting either restriction', async () => {
    const page = (await create()).componentInstance;
    invoke.mockClear();
    page.request(customer, 'suspend');
    expect(invoke).not.toHaveBeenCalled();
    page.setReasonCategory(customer.id, 'abusive_support');
    page.setReason(customer.id, 'short');
    page.request(customer, 'deactivate');
    expect(invoke).not.toHaveBeenCalled();
    page.setReason(customer.id, 'Detailed supporting evidence');
    page.request(customer, 'suspend');
    expect(invoke).toHaveBeenCalledWith('customer-account-management', {
      body: {
        action: 'request',
        targetUserId: customer.id,
        kind: 'suspend',
        reason: 'Abusive or offensive communication toward Support — Detailed supporting evidence',
      },
    });
  });
  it('shows decisions to the Admin and permits execution only for the owner', async () => {
    const fixture = await create();
    const page = fixture.componentInstance;
    expect(fixture.nativeElement.textContent).toContain('Approved after review');
    expect(page.canExecute(approved)).toBe(true);
    expect(page.canExecute({ ...approved, requested_by: 'another-admin' })).toBe(false);
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    invoke.mockClear();
    page.execute({ ...approved, requested_by: 'another-admin' });
    expect(confirm).not.toHaveBeenCalled();
    page.execute(approved);
    expect(invoke).toHaveBeenCalledWith('customer-account-management', {
      body: { action: 'execute', requestId: approved.id },
    });
  });
  it('requires a Manager explanation and never executes approval automatically', async () => {
    role = 'manager';
    const fixture = await create();
    const page = fixture.componentInstance;
    const pending = { ...approved, status: 'pending' as const };
    invoke.mockClear();
    page.decide(pending, 'approved');
    expect(invoke).not.toHaveBeenCalled();
    page.setDecision(pending.id, 'Evidence reviewed and confirmed.');
    page.decide(pending, 'approved');
    expect(invoke).toHaveBeenCalledWith('customer-account-management', {
      body: {
        action: 'decide',
        requestId: pending.id,
        decision: 'approved',
        reply: 'Evidence reviewed and confirmed.',
      },
    });
    expect(invoke.mock.calls.some((call) => call[1].body.action === 'execute')).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Request suspension');
    expect(page.canExecute(approved)).toBe(false);
  });
  it('surfaces backend authorization errors without claiming success', async () => {
    const fixture = await create();
    invoke.mockResolvedValueOnce({
      data: null,
      error: { context: new Response(JSON.stringify({ error: 'Staff MFA required' })) },
    });
    await fixture.componentInstance.perform('execute', { requestId: approved.id }, 'Completed');
    expect(fixture.componentInstance.error()).toBe('Staff MFA required');
    expect(fixture.componentInstance.success()).toBe('');
  });
});
