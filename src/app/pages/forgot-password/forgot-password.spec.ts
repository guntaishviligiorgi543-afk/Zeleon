import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { Auth } from '../../services/auth';
import { createAuthStub } from '../../testing/auth-stub';
import { ForgotPassword } from './forgot-password';

describe('ForgotPassword', () => {
  let fixture: ComponentFixture<ForgotPassword>;
  let auth: ReturnType<typeof createAuthStub>;

  beforeEach(async () => {
    auth = createAuthStub();
    await TestBed.configureTestingModule({ imports: [ForgotPassword], providers: [
      provideRouter([]), { provide: Auth, useValue: auth },
    ] }).compileComponents();
    fixture = TestBed.createComponent(ForgotPassword);
    await fixture.whenStable();
  });

  it('validates email and requests recovery without exposing the address in success feedback', async () => {
    const component = fixture.componentInstance;
    await component.submit();
    expect(component.form.invalid).toBe(true);
    component.form.controls.email.setValue('person@example.com');
    await component.submit();
    expect(auth.resetPassword).toHaveBeenCalledWith('person@example.com');
    expect(component.status()).toContain('If an account exists');
    expect(component.status()).not.toContain('person@example.com');
    expect(component.otpRequested()).toBe(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#recovery-otp')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('#recovery-otp').getAttribute('maxlength')).toBe('8');
  });

  it('verifies the recovery code before navigating to password change', async () => {
    const component = fixture.componentInstance;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    component.form.controls.email.setValue('person@example.com');
    await component.submit();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('#recovery-otp') as HTMLInputElement;
    input.value = '12345678';
    component.onCodeInput({ target: input } as unknown as Event);
    const otpForm = fixture.nativeElement.querySelector('.otp-form') as HTMLFormElement;
    otpForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(auth.verifyEmailOtp).toHaveBeenCalledWith('person@example.com', '12345678', 'recovery');
    expect(auth.recovering()).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/reset-password');
  });

  it('keeps recovery open when the code is invalid or expired', async () => {
    const component = fixture.componentInstance;
    component.form.controls.email.setValue('person@example.com');
    await component.submit();
    component.code.set('00000000');
    auth.verifyEmailOtp.mockRejectedValueOnce({ code: 'otp_expired' });
    await component.verifyCode();
    expect(auth.verifyEmailOtp).toHaveBeenCalledWith('person@example.com', '00000000', 'recovery');
    expect(component.otpRequested()).toBe(true);
    expect(component.status()).toContain('invalid or expired');
  });

  it('does not navigate when the recovery code is rejected', async () => {
    const component = fixture.componentInstance;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    component.form.controls.email.setValue('person@example.com');
    await component.submit();
    component.code.set('12345678');
    auth.verifyEmailOtp.mockRejectedValueOnce({ code: 'otp_expired' });
    await component.verifyCode();
    expect(navigate).not.toHaveBeenCalled();
    expect(component.status()).toContain('invalid or expired');
  });

  it('prevents duplicate requests', async () => {
    const component = fixture.componentInstance;
    component.form.controls.email.setValue('person@example.com');
    let finish!: () => void;
    auth.resetPassword.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const request = component.submit();
    await component.submit();
    expect(auth.resetPassword).toHaveBeenCalledOnce();
    expect(component.pending()).toBe(true);
    finish();
    await request;
    expect(component.pending()).toBe(false);
  });
});
