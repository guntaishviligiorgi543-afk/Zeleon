import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { Auth } from '../../../services/auth';
import { Cart } from '../../../services/cart';
import { createAuthStub } from '../../../testing/auth-stub';
import { Security } from './security';

describe('Security', () => {
  let component: Security;
  let fixture: ComponentFixture<Security>;
  let auth: ReturnType<typeof createAuthStub>;

  beforeEach(async () => {
    auth = createAuthStub();
    auth.user.set({ id: 'user-1', email: 'person@example.com' });
    await TestBed.configureTestingModule({
      imports: [Security],
      providers: [
        provideRouter([]),
        { provide: Auth, useValue: auth },
        { provide: Cart, useValue: { clear: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Security);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('requests and verifies the complete eight-digit email-change code', async () => {
    component.start('email');
    component.newEmail.setValue('new@example.com');
    await component.requestEmail();
    expect(auth.requestEmailChange).toHaveBeenCalledWith('new@example.com');
    expect(component.emailCodeSent()).toBe(true);

    component.onEmailCodeInput({ target: { value: '12a3456789' } } as unknown as Event);
    expect(component.code.value).toBe('12345678');
    await component.verifyEmail();

    expect(auth.verifyEmailChangeOtp).toHaveBeenCalledWith('new@example.com', '12345678');
    expect(auth.user()?.email).toBe('new@example.com');
    expect(component.message()).toContain('updated successfully');
  });

  it('keeps the form open when the email-change code is expired', async () => {
    component.start('email');
    component.newEmail.setValue('new@example.com');
    await component.requestEmail();
    component.code.setValue('12345678');
    auth.verifyEmailChangeOtp.mockRejectedValueOnce({ code: 'otp_expired' });

    await component.verifyEmail();

    expect(component.emailCodeSent()).toBe(true);
    expect(component.error()).toContain('invalid or expired');
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('shows the reason when a password change fails', async () => {
    component.start('password');
    component.currentPassword.setValue('old-password');
    component.newPassword.setValue('new-password');
    component.confirmPassword.setValue('new-password');
    auth.changePasswordWithReauthentication.mockRejectedValueOnce({ code: 'same_password' });

    await component.changePassword();

    expect(component.feedbackDialog()?.kind).toBe('error');
    expect(component.feedbackDialog()?.message).toContain('different from your current password');
  });

  it('shows the exact success dialog after Supabase confirms a password change', async () => {
    component.start('password');
    component.currentPassword.setValue('old-password');
    component.newPassword.setValue('new-password');
    component.confirmPassword.setValue('new-password');

    await component.changePassword();

    expect(component.feedbackDialog()).toEqual({
      kind: 'success',
      title: 'Password Changed Successfully',
      message: 'Your password has been updated successfully. You can now sign in using your new password.',
      buttonLabel: 'Continue',
    });
  });

  it.each([
    [{ code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 }, 'Incorrect current password.'],
    [{ code: 'weak_password', message: 'Password should be at least 8 characters', status: 422 }, 'new password is too weak'],
    [{ code: 'same_password', message: 'New password should be different', status: 422 }, 'must be different'],
    [{ code: 'session_expired', message: 'Session expired', status: 401 }, 'session has expired'],
    [{ message: 'Failed to fetch', status: 0 }, 'network or connectivity'],
  ] as const)('shows a meaningful password error for %s', async (supabaseError, expected) => {
    component.start('password');
    component.currentPassword.setValue('old-password');
    component.newPassword.setValue('new-password');
    component.confirmPassword.setValue('new-password');
    auth.changePasswordWithReauthentication.mockRejectedValueOnce(supabaseError);

    await component.changePassword();

    expect(component.feedbackDialog()?.title).toBe('Password Change Failed');
    expect(component.feedbackDialog()?.buttonLabel).toBe('Try Again');
    expect(component.feedbackDialog()?.message.toLowerCase()).toContain(expected.toLowerCase());
  });

  it('preserves safe Supabase error details without exposing token values', async () => {
    component.start('password');
    component.currentPassword.setValue('old-password');
    component.newPassword.setValue('new-password');
    component.confirmPassword.setValue('new-password');
    auth.changePasswordWithReauthentication.mockRejectedValueOnce({
      code: 'unknown_error',
      message: 'Request failed with access_token=secret-value',
      status: 500,
    });

    await component.changePassword();

    const message = component.feedbackDialog()?.message ?? '';
    expect(message).toContain('code: unknown_error');
    expect(message).toContain('HTTP status: 500');
    expect(message).not.toContain('secret-value');
  });

  it('shows the reason when an email change request fails', async () => {
    component.start('email');
    component.newEmail.setValue('new@example.com');
    auth.requestEmailChange.mockRejectedValueOnce({ code: 'email_exists' });

    await component.requestEmail();

    expect(component.feedbackDialog()?.kind).toBe('error');
    expect(component.feedbackDialog()?.message).toContain('That email address cannot be used');
  });

  it('requires the current password before deleting the account', async () => {
    component.deleteOpen.set(true);

    await component.confirmDelete();

    expect(auth.deleteAccount).not.toHaveBeenCalled();
    expect(component.feedbackDialog()?.message).toContain('current password');
  });

  it('deletes only after the current password is provided', async () => {
    component.deleteOpen.set(true);
    component.currentPassword.setValue('current-password');

    await component.confirmDelete();

    expect(auth.deleteAccount).toHaveBeenCalledWith('current-password');
  });
});
