import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { StaffAccess } from '../services/staff-access';
import { staffGuard } from './staff.guard';

@Component({ template: 'Staff page' })
class Page {}

describe('staffGuard', () => {
  it('redirects an unverified customer away from staff routes', async () => {
    const staff = { load: vi.fn().mockResolvedValue(null), clear: vi.fn(), assignment: vi.fn().mockReturnValue(null), status: vi.fn().mockReturnValue(null), isVerified: vi.fn().mockReturnValue(false), canAccess: vi.fn().mockReturnValue(false) };
    TestBed.configureTestingModule({
      providers: [
        { provide: StaffAccess, useValue: staff },
        provideRouter([{ path: 'manager', component: Page, canActivate: [staffGuard], data: { staffRole: 'manager' } }, { path: 'profile', component: Page }]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/manager');
    expect(TestBed.inject(Router).url).toBe('/profile');
  });

  it('allows only the verified role assigned to the route', async () => {
    const staff = { load: vi.fn().mockResolvedValue({ role: 'admin', status: 'active' }), clear: vi.fn(), assignment: vi.fn().mockReturnValue({ role: 'admin', status: 'active' }), status: vi.fn().mockReturnValue('active'), isVerified: vi.fn().mockReturnValue(true), canAccess: vi.fn((role: string) => role === 'admin') };
    TestBed.configureTestingModule({
      providers: [
        { provide: StaffAccess, useValue: staff },
        provideRouter([{ path: 'admin', component: Page, canActivate: [staffGuard], data: { staffRole: 'admin' } }]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin');
    expect(TestBed.inject(Router).url).toBe('/admin');
  });

  it('redirects suspended staff and load failures', async () => {
    const staff = { load: vi.fn().mockRejectedValue(new Error('session error')), clear: vi.fn(), assignment: vi.fn(), status: vi.fn(), isVerified: vi.fn(), canAccess: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: StaffAccess, useValue: staff },
        provideRouter([{ path: 'support', component: Page, canActivate: [staffGuard], data: { staffRole: 'support' } }, { path: 'profile', component: Page }]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/support');
    expect(staff.clear).toHaveBeenCalledOnce();
    expect(TestBed.inject(Router).url).toBe('/profile');
  });

  it('does not let support enter admin or manager workspaces', async () => {
    const staff = { load: vi.fn().mockResolvedValue({ role: 'support', status: 'active' }), clear: vi.fn(), assignment: vi.fn().mockReturnValue({ role: 'support', status: 'active' }), status: vi.fn().mockReturnValue('active'), isVerified: vi.fn().mockReturnValue(true), canAccess: vi.fn((role: string) => role === 'support') };
    TestBed.configureTestingModule({
      providers: [
        { provide: StaffAccess, useValue: staff },
        provideRouter([{ path: 'manager', component: Page, canActivate: [staffGuard], data: { staffRole: 'manager' } }, { path: 'admin', component: Page, canActivate: [staffGuard], data: { staffRole: 'admin' } }, { path: 'profile', component: Page }]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin');
    expect(TestBed.inject(Router).url).toBe('/profile');
    await harness.navigateByUrl('/manager');
    expect(TestBed.inject(Router).url).toBe('/profile');
  });

  it('does not let admin enter the manager workspace', async () => {
    const staff = { load: vi.fn().mockResolvedValue({ role: 'admin', status: 'active' }), clear: vi.fn(), assignment: vi.fn().mockReturnValue({ role: 'admin', status: 'active' }), status: vi.fn().mockReturnValue('active'), isVerified: vi.fn().mockReturnValue(true), canAccess: vi.fn((role: string) => role === 'admin') };
    TestBed.configureTestingModule({
      providers: [
        { provide: StaffAccess, useValue: staff },
        provideRouter([{ path: 'manager', component: Page, canActivate: [staffGuard], data: { staffRole: 'manager' } }, { path: 'profile', component: Page }]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/manager');
    expect(TestBed.inject(Router).url).toBe('/profile');
  });

  it('requires MFA before allowing an active staff member into a workspace', async () => {
    const staff = { load: vi.fn().mockResolvedValue({ role: 'support', status: 'active' }), clear: vi.fn(), assignment: vi.fn().mockReturnValue({ role: 'support', status: 'active' }), status: vi.fn().mockReturnValue('active'), isVerified: vi.fn().mockReturnValue(false), canAccess: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: StaffAccess, useValue: staff },
        provideRouter([{ path: 'support', component: Page, canActivate: [staffGuard], data: { staffRole: 'support' } }, { path: 'staff-auth', component: Page }]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/support');
    expect(TestBed.inject(Router).url).toBe('/staff-auth?returnUrl=%2Fsupport');
  });
});
