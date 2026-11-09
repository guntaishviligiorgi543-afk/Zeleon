import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { Auth } from '../../services/auth';
import { StaffAccess } from '../../services/staff-access';
import { SUPABASE_CLIENT } from '../../services/supabase';
import { createAuthStub } from '../../testing/auth-stub';
import { staffGuard } from '../../guards/staff.guard';
import { ManagerNavigation } from './manager-navigation';

@Component({ template: 'Route page' })
class Page {}

describe('ManagerNavigation', () => {
  function setup(role: string | null = 'manager', status = 'active', signedIn = true, grant = false) {
    const auth = createAuthStub();
    if (signedIn) auth.user.set({ id: 'manager-id' });
    const row = role ? { user_id: 'manager-id', role, status } : null;
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'manager-id' } }, error: null }) },
      from: vi.fn(() => ({ select })),
    };
    const staff = {
      load: vi.fn().mockResolvedValue(row), clear: vi.fn(),
      assignment: () => row, status: () => status, isVerified: () => grant,
      canAccess: (required: string) => grant && role === required,
    };
    TestBed.configureTestingModule({ imports: [ManagerNavigation], providers: [
      { provide: Auth, useValue: auth }, { provide: SUPABASE_CLIENT, useValue: client },
      { provide: StaffAccess, useValue: staff },
      provideRouter([
        { path: 'manager', component: Page, canActivate: [staffGuard], data: { staffRole: 'manager' } },
        { path: 'staff-auth', component: Page }, { path: 'profile', component: Page },
        { path: 'shop', component: Page },
      ]),
    ] });
    const fixture = TestBed.createComponent(ManagerNavigation);
    const button = () => fixture.nativeElement.querySelector('a') as HTMLAnchorElement | null;
    return { fixture, button, auth, client, maybeSingle, eq, select, staff, router: TestBed.inject(Router) };
  }

  it('does not query staff roles or display a button while signed out', async () => {
    const test = setup(null, 'active', false);
    await test.fixture.whenStable();
    expect(test.button()).toBeNull();
    expect(test.client.auth.getUser).not.toHaveBeenCalled();
    expect(test.client.from).not.toHaveBeenCalled();
  });

  for (const [role, status] of [[null, 'active'], ['admin', 'active'], ['support', 'active'], ['manager', 'suspended'], ['manager', 'on_leave']]) {
    it(`hides the shortcut for ${role ?? 'customer'} / ${status}`, async () => {
      const test = setup(role, status!);
      await test.fixture.whenStable();
      expect(test.button()).toBeNull();
    });
  }

  it('shows an accessible link only after checking the user and their RLS-protected assignment', async () => {
    const test = setup();
    expect(test.button()).toBeNull();
    await test.fixture.whenStable();
    expect(test.client.auth.getUser).toHaveBeenCalledOnce();
    expect(test.client.from).toHaveBeenCalledWith('staff_roles');
    expect(test.select).toHaveBeenCalledWith('user_id, role, status');
    expect(test.eq).toHaveBeenCalledWith('user_id', 'manager-id');
    expect(test.button()?.getAttribute('href')).toBe('/manager');
    expect(test.button()?.getAttribute('aria-label')).toBe('Manager Dashboard');
    expect(test.button()?.textContent).toContain('Manager Dashboard');
    expect(test.button()?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('uses the existing guard to redirect a Manager needing MFA to staff-auth', async () => {
    const test = setup();
    await test.fixture.whenStable();
    test.button()!.click();
    await test.fixture.whenStable();
    expect(test.staff.load).toHaveBeenCalled();
    expect(test.router.url).toBe('/staff-auth?returnUrl=%2Fmanager');
  });

  it('navigates a Manager with a valid staff grant to the existing manager route', async () => {
    const test = setup('manager', 'active', true, true);
    await test.fixture.whenStable();
    test.button()!.click();
    await test.fixture.whenStable();
    expect(test.router.url).toBe('/manager');
  });

  it('hides the button immediately on logout', async () => {
    const test = setup();
    await test.fixture.whenStable();
    expect(test.button()).not.toBeNull();
    test.auth.user.set(null);
    await test.fixture.whenStable();
    expect(test.button()).toBeNull();
  });

  it('fails closed if the server rejects the session', async () => {
    const test = setup();
    test.client.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'another-user' } }, error: null });
    await test.fixture.whenStable();
    expect(test.button()).toBeNull();
    expect(test.client.from).not.toHaveBeenCalled();
  });

  it('fails closed if the assignment request fails', async () => {
    const test = setup();
    test.maybeSingle.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    await test.fixture.whenStable();
    expect(test.button()).toBeNull();
  });

  it('rejects an assignment returned for a different user', async () => {
    const test = setup();
    test.maybeSingle.mockResolvedValueOnce({ data: { user_id: 'another-user', role: 'manager', status: 'active' }, error: null });
    await test.fixture.whenStable();
    expect(test.button()).toBeNull();
  });

  it('refreshes the server assignment on navigation and hides a suspended Manager', async () => {
    const test = setup();
    await test.fixture.whenStable();
    test.maybeSingle.mockResolvedValue({ data: { user_id: 'manager-id', role: 'manager', status: 'suspended' }, error: null });
    await test.router.navigateByUrl('/shop');
    await test.fixture.whenStable();
    expect(test.button()).toBeNull();
  });

  it('ignores a delayed role response after the account changes', async () => {
    const test = setup();
    let finish!: (value: unknown) => void;
    test.maybeSingle.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    test.fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    test.auth.user.set({ id: 'customer-id' });
    finish({ data: { user_id: 'manager-id', role: 'manager', status: 'active' }, error: null });
    await test.fixture.whenStable();
    expect(test.button()).toBeNull();
  });
});
