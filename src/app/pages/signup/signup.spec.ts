import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Signup } from './signup';
import { provideRouter } from '@angular/router';
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
    component.form.setValue({ name: '   ', email: 'invalid', password: 'short', confirmPassword: 'short' });
    expect(component.form.controls.name.invalid).toBe(true);
    expect(component.form.controls.email.invalid).toBe(true);
    expect(component.form.controls.password.invalid).toBe(true);
    component.form.setValue({ name: 'ნინო', email: 'person+test@example.com', password: 'valid passphrase', confirmPassword: 'different' });
    expect(component.form.hasError('passwordMismatch')).toBe(true);
    component.form.controls.confirmPassword.setValue('valid passphrase');
    expect(component.form.valid).toBe(true);
    await component.submit();
    expect(auth.signUp).toHaveBeenCalledOnce();
    expect(component.status()).toContain('Check your email');
    expect(auth.user()).toBeNull();
    expect(fixture.nativeElement.querySelector('.account-link a').getAttribute('href')).toBe('/login');
  });

  it('prevents duplicate submissions and handles rate limits', async () => {
    component.form.setValue({ name: 'Test', email: 'test@example.com', password: 'longpassword', confirmPassword: 'longpassword' });
    let finish!: (value: { session: null }) => void;
    auth.signUp.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const request = component.submit();
    await component.submit();
    expect(auth.signUp).toHaveBeenCalledOnce();
    expect(component.pending()).toBe(true);
    finish({ session: null });
    await request;
    component.form.patchValue({ password: 'longpassword', confirmPassword: 'longpassword' });
    auth.signUp.mockRejectedValueOnce({ status: 429 });
    await component.submit();
    expect(component.status()).toContain('Too many attempts');
    expect(component.pending()).toBe(false);
  });
});
