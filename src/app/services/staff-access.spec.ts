import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Auth } from './auth';
import { SUPABASE_CLIENT } from './supabase';
import { StaffAccess } from './staff-access';

describe('StaffAccess server grants', () => {
  function setup(status = 'active', granted = false) {
    const client = {
      from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id: 'user', role: 'admin', status }, error: null }) }) }) })),
      rpc: vi.fn().mockResolvedValue({ data: granted, error: null }),
      auth: {
        signInWithPassword: vi.fn(),
        mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal2' }, error: null }) },
      },
    };
    TestBed.configureTestingModule({ providers: [
      { provide: SUPABASE_CLIENT, useValue: client },
      { provide: Auth, useValue: { ready: Promise.resolve(), getCurrentUser: async () => ({ id: 'user' }) } },
    ] });
    return { client, staff: TestBed.inject(StaffAccess) };
  }
  it('rejects an aal2 session without a live server grant', async () => {
    const { staff, client } = setup();
    await staff.load();
    expect(client.rpc).toHaveBeenCalledWith('staff_session');
    expect(staff.isVerified()).toBe(false);
    expect(staff.canAccess('admin')).toBe(false);
  });
  it('allows only the assigned workspace with a live server grant', async () => {
    const { staff } = setup('active', true);
    await staff.load();
    expect(staff.canAccess('admin')).toBe(true);
    expect(staff.canAccess('manager')).toBe(false);
    expect(staff.canAccess('support')).toBe(false);
  });
  for (const status of ['suspended', 'on_leave']) {
    it(`rejects ${status} staff before password authentication`, async () => {
      const { staff, client } = setup(status, true);
      await expect(staff.verifySecondaryAuthentication('password', '123456')).rejects.toThrow('Active staff');
      expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
      expect(client.rpc).not.toHaveBeenCalled();
      expect(staff.isVerified()).toBe(false);
    });
  }
});
