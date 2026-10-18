import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Auth } from '../../services/auth';
import { createAuthStub } from '../../testing/auth-stub';
import { ConfirmationResend } from './confirmation-resend';

describe('ConfirmationResend', () => {
  it('validates email, limits resend attempts and clears its cooldown timer', async () => {
    const auth = createAuthStub();
    TestBed.configureTestingModule({ providers: [{ provide: Auth, useValue: auth }] });
    const fixture = TestBed.createComponent(ConfirmationResend);
    const component = fixture.componentInstance;
    await component.resend();
    expect(auth.resendConfirmationEmail).not.toHaveBeenCalled();
    fixture.componentRef.setInput('email', 'person@example.com');
    auth.resendConfirmationEmail.mockRejectedValueOnce({ status: 429 });
    vi.useFakeTimers();
    try {
      await component.resend();
      expect(component.status()).toContain('Too many attempts');
      await component.resend();
      expect(auth.resendConfirmationEmail).toHaveBeenCalledOnce();
      vi.advanceTimersByTime(60_000);
      await component.resend();
      expect(component.status()).toContain('If confirmation is needed');
      fixture.destroy();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});
