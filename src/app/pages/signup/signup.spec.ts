import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Signup } from './signup';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { Auth } from '../../services/auth';
import { createAuthStub } from '../../testing/auth-stub';

describe('Signup', () => {
  let component: Signup;
  let fixture: ComponentFixture<Signup>;
  let auth: ReturnType<typeof createAuthStub>;

  beforeEach(async () => {
    auth = createAuthStub();
    await TestBed.configureTestingModule({
      imports: [Signup],
      providers: [provideRouter([]), { provide: Auth, useValue: auth }],
    }).compileComponents();

    fixture = TestBed.createComponent(Signup);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('validates names, email, password length, and matching passwords', async () => {
    component.submit();
    await fixture.whenStable();
    expect(component.form.invalid).toBe(true);
    expect(component.status()).toBe('');
    expect(fixture.nativeElement.querySelector('#signup-email').getAttribute('aria-invalid')).toBe('true');
    component.form.setValue({ firstName: '   ', lastName: 'Example', preferredName: '', phoneNumber: 'bad', email: 'invalid', password: 'short', confirmPassword: 'short' });
    expect(component.form.controls.firstName.invalid).toBe(true);
    expect(component.form.controls.phoneNumber.invalid).toBe(true);
    expect(component.form.controls.email.invalid).toBe(true);
    expect(component.form.controls.password.invalid).toBe(true);
    component.form.setValue({ firstName: 'Nino', lastName: 'Example', preferredName: 'Nini', phoneNumber: '+995555123456', email: 'person+test@example.com', password: 'valid passphrase', confirmPassword: 'different' });
    expect(component.form.hasError('passwordMismatch')).toBe(true);
    component.form.controls.confirmPassword.setValue('valid passphrase');
    expect(component.form.valid).toBe(true);
    await component.submit();
    expect(auth.signUp).toHaveBeenCalledExactlyOnceWith('person+test@example.com', 'valid passphrase', {
      firstName: 'Nino', lastName: 'Example', preferredName: 'Nini', phoneNumber: '+995555123456',
    });
    expect(component.result()?.success).toBe(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.registration-dialog h2').textContent).toContain('Registration Successful');
    expect(fixture.nativeElement.querySelector('.registration-dialog p').textContent).toContain('Your account has been created successfully.');
    expect(auth.user()).toBeTruthy();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture.nativeElement.querySelector('.registration-action').click();
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith('/');
    expect(component.result()).toBeNull();
    expect(fixture.nativeElement.querySelector('.account-link a').getAttribute('href')).toBe('/login');
  });

  it('prevents duplicate submissions and handles rate limits', async () => {
    component.form.setValue({ firstName: 'Test', lastName: 'Person', preferredName: '', phoneNumber: '+995555123456', email: 'test@example.com', password: 'longpassword', confirmPassword: 'longpassword' });
    let finish!: (value: any) => void;
    auth.signUp.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const request = component.submit();
    await component.submit();
    expect(auth.signUp).toHaveBeenCalledOnce();
    expect(component.pending()).toBe(true);
    finish({ hasSession: true });
    await request;
    component.form.patchValue({ password: 'longpassword', confirmPassword: 'longpassword' });
    auth.signUp.mockRejectedValueOnce({ status: 429 });
    await component.submit();
    expect(component.result()?.success).toBe(false);
    expect(component.result()?.message).toContain('Too many attempts');
    fixture.detectChanges();
    const phone = component.form.controls.phoneNumber.value;
    fixture.nativeElement.querySelector('.registration-action').click();
    expect(component.result()).toBeNull();
    expect(component.form.controls.phoneNumber.value).toBe(phone);
    expect(component.pending()).toBe(false);
  });

  it('verifies a six-digit signup code before showing the success dialog', async () => {
    auth.signUp.mockResolvedValueOnce({ hasSession: false });
    component.form.setValue({ firstName: 'Nino', lastName: 'Example', preferredName: 'Nini', phoneNumber: '+995555123456', email: 'person@example.com', password: 'valid passphrase', confirmPassword: 'valid passphrase' });
    await component.submit();
    expect(component.verificationOpen()).toBe(true);
    expect(component.result()).toBeNull();
    expect(auth.user()).toBeNull();

    const input = document.createElement('input');
    input.value = '12a3456';
    component.onVerificationInput({ target: input } as unknown as Event);
    expect(input.value).toBe('123456');
    await component.verifyEmail();
    expect(auth.verifyEmailOtp).toHaveBeenCalledWith('person@example.com', '123456', 'email');
    expect(component.verificationOpen()).toBe(false);
    expect(component.result()?.success).toBe(true);
  });

  it('keeps the code dialog open and shows a safe message for an invalid code', async () => {
    auth.signUp.mockResolvedValueOnce({ hasSession: false });
    component.form.setValue({ firstName: 'Nino', lastName: 'Example', preferredName: '', phoneNumber: '+995555123456', email: 'person@example.com', password: 'valid passphrase', confirmPassword: 'valid passphrase' });
    await component.submit();
    component.verificationCode.set('000000');
    auth.verifyEmailOtp.mockRejectedValueOnce({ code: 'otp_expired' });
    await component.verifyEmail();
    expect(component.verificationOpen()).toBe(true);
    expect(component.result()).toBeNull();
    expect(component.verificationStatus()).toContain('invalid or expired');
    expect(component.verificationStatus()).not.toContain('otp_expired');
  });

  it('cancels signup verification and restores page state', async () => {
    auth.signUp.mockResolvedValueOnce({ hasSession: false });
    component.form.setValue({ firstName: 'Nino', lastName: 'Example', preferredName: '', phoneNumber: '+995555123456', email: 'person@example.com', password: 'valid passphrase', confirmPassword: 'valid passphrase' });
    await component.submit();
    expect(component.verificationOpen()).toBe(true);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.registration-cancel').click();
    expect(component.verificationOpen()).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });
});
