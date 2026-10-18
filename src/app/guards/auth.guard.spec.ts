import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { User } from '@supabase/supabase-js';
import { Auth } from '../services/auth';
import { createAuthStub } from '../testing/auth-stub';
import { authGuard, guestGuard } from './auth.guard';

@Component({ template: 'Test page' })
class Page {}

describe('auth guards', () => {
  let auth: ReturnType<typeof createAuthStub>;
  beforeEach(() => {
    auth = createAuthStub();
    TestBed.configureTestingModule({ providers: [{ provide: Auth, useValue: auth }, provideRouter([
      { path: 'profile', component: Page, canActivate: [authGuard] },
      { path: 'login', component: Page, canActivate: [guestGuard] },
      { path: 'signup', component: Page, canActivate: [guestGuard] },
      { path: 'reset-password', component: Page },
    ])] });
  });

  it('redirects logged-out Profile access and preserves the destination', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/profile');
    expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Fprofile');
  });

  it('waits for session restoration and redirects authenticated Login/Signup to Profile', async () => {
    let resolve!: () => void;
    auth.ready = new Promise<void>((done) => { resolve = done; });
    const harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl('/profile');
    auth.user.set({ id: 'user-1' } as User);
    resolve();
    await navigation;
    expect(TestBed.inject(Router).url).toBe('/profile');
    await harness.navigateByUrl('/login');
    expect(TestBed.inject(Router).url).toBe('/profile');
    await harness.navigateByUrl('/signup');
    expect(TestBed.inject(Router).url).toBe('/profile');
  });

  it('sends a recovery session to password update', async () => {
    auth.user.set({ id: 'user-1' } as User);
    auth.recovering.set(true);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/profile');
    expect(TestBed.inject(Router).url).toBe('/reset-password');
  });
});
