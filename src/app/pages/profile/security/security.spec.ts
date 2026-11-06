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
