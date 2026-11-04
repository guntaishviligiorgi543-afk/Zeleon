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
  });

  it('verifies the recovery code before navigating to password change', async () => {
    const component = fixture.componentInstance;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    component.form.controls.email.setValue('person@example.com');
    await component.submit();
    component.code.set('123456');
    await component.verifyCode();
    expect(auth.verifyEmailOtp).toHaveBeenCalledWith('person@example.com', '123456', 'recovery');
    expect(auth.recovering()).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/reset-password');
  });

  it('does not navigate when the recovery code is rejected', async () => {
    const component = fixture.componentInstance;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    component.form.controls.email.setValue('person@example.com');
    await component.submit();
    component.code.set('123456');
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
