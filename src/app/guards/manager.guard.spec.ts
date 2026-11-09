import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { StaffAccess } from '../services/staff-access';
import { managerChildGuard, managerGuard } from './manager.guard';

@Component({ template: '<router-outlet />', imports: [RouterOutlet] })
class Shell {}
@Component({ template: 'Page' })
class Page {}

function staffStub(role: string | null, verified: boolean, status = 'active') {
  const assignment = role ? { role, status } : null;
  return {
    load: vi.fn().mockResolvedValue(assignment),
    clear: vi.fn(),
    assignment: vi.fn().mockReturnValue(assignment),
    status: vi.fn().mockReturnValue(role ? status : null),
    isVerified: vi.fn().mockReturnValue(verified),
    canAccess: vi.fn((required: string) => verified && role === required),
  };
}

async function navigate(staff: ReturnType<typeof staffStub>): Promise<string> {
  TestBed.configureTestingModule({
    providers: [
      { provide: StaffAccess, useValue: staff },
      provideRouter([
        {
          path: 'manager',
          component: Shell,
          canActivate: [managerGuard],
          canActivateChild: [managerChildGuard],
          children: [
            { path: '', component: Page },
            { path: 'products', component: Page },
          ],
        },
        { path: 'profile', component: Page },
        { path: 'staff-auth', component: Page },
      ]),
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/manager/products');
  return TestBed.inject(Router).url;
}

describe('managerGuard', () => {
  it('allows an active verified Manager into child routes', async () => {
    expect(await navigate(staffStub('manager', true))).toBe('/manager/products');
  });

  it('rejects ordinary customers', async () => {
    expect(await navigate(staffStub(null, false))).toBe('/profile');
  });

  for (const role of ['admin', 'support']) {
    it(`rejects a verified ${role} from Manager routes`, async () => {
      expect(await navigate(staffStub(role, true))).toBe('/profile');
    });
  }

  it('redirects an active Manager without AAL2/server grant to staff authentication', async () => {
    expect(await navigate(staffStub('manager', false))).toBe(
      '/staff-auth?returnUrl=%2Fmanager%2Fproducts',
    );
  });

  it('rejects a suspended Manager even if stale client state says verified', async () => {
    expect(await navigate(staffStub('manager', true, 'suspended'))).toBe('/profile');
  });
});
