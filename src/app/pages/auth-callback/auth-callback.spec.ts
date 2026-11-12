import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { Auth } from '../../services/auth';
import { createAuthStub } from '../../testing/auth-stub';
import { AuthCallback } from './auth-callback';

describe('AuthCallback', () => {
  const originalUrl = window.location.href;
  afterEach(() => window.history.replaceState(null, '', originalUrl));

  async function setup(url: string, result = 'confirmation', reject = false) {
    window.history.replaceState(null, '', url);
    const auth = createAuthStub();
    auth.completeCallback.mockResolvedValue(result);
    if (reject) auth.completeCallback.mockRejectedValueOnce(new Error('Expired'));
    TestBed.configureTestingModule({ imports: [AuthCallback], providers: [provideRouter([]), { provide: Auth, useValue: auth }] });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(AuthCallback);
    await fixture.whenStable();
    return { auth, navigate, fixture, component: fixture.componentInstance };
  }

  it('exchanges the code once, clears URL credentials, and shows verification feedback', async () => {
    const { auth, component } = await setup('/auth/callback?code=test-code&sb_flow_id=test-flow');
    expect(auth.completeCallback).toHaveBeenCalledExactlyOnceWith('test-code', 'test-flow');
    expect(window.location.search).toBe('');
    expect(component.verified()).toBe(true);
  });

  it('navigates a verified recovery flow to password update', async () => {
    const { navigate } = await setup('/auth/callback?code=test-recovery', 'recovery');
    expect(navigate).toHaveBeenCalledWith('/reset-password', { replaceUrl: true });
  });

  it('sends Google sign-in to Profile without claiming email verification', async () => {
    const { navigate, component } = await setup('/auth/callback?code=google-code');
    expect(navigate).toHaveBeenCalledWith('/profile', { replaceUrl: true });
    expect(component.verified()).toBe(false);
    expect(window.location.search).toBe('');
  });

  it('handles cancellation and clears fragment credentials without exchanging', async () => {
    const { auth, component } = await setup('/auth/callback#error=access_denied&error_description=private&access_token=secret');
    expect(auth.completeCallback).not.toHaveBeenCalled();
    expect(component.status()).toContain('cancelled');
    expect(component.status()).not.toContain('private');
    expect(window.location.hash).toBe('');
  });

  it('rejects an expired link even when a prior session might exist', async () => {
    const { component, navigate } = await setup('/auth/callback?code=expired', 'confirmation', true);
    expect(component.failed()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('rejects missing codes/provider errors without exposing URL error details', async () => {
    const { auth, component } = await setup('/auth/callback?error=access_denied&error_description=secret-detail');
    expect(auth.completeCallback).not.toHaveBeenCalled();
    expect(component.status()).not.toContain('secret-detail');
    expect(component.failed()).toBe(true);
    expect(window.location.search).toBe('');
  });
});
