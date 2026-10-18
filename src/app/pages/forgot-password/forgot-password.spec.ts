import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ForgotPassword } from './forgot-password';
import { provideRouter } from '@angular/router';
import { Auth } from '../../services/auth';
import { createAuthStub } from '../../testing/auth-stub';

describe('ForgotPassword', () => {
  let component: ForgotPassword;
  let fixture: ComponentFixture<ForgotPassword>;
  let auth: ReturnType<typeof createAuthStub>;

  beforeEach(async () => {
    auth = createAuthStub();
    await TestBed.configureTestingModule({
      imports: [ForgotPassword],
      providers: [provideRouter([]), { provide: Auth, useValue: auth }],
    }).compileComponents();

    fixture = TestBed.createComponent(ForgotPassword);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('validates email and requests recovery without disclosing account existence', async () => {
    component.form.controls.email.setValue('invalid');
    component.submit();
    await fixture.whenStable();
    expect(component.form.invalid).toBe(true);
    expect(component.status()).toBe('');
    expect(fixture.nativeElement.querySelector('#reset-email').getAttribute('aria-invalid')).toBe('true');
    component.form.controls.email.setValue('person@example.com');
    await component.submit();
    expect(component.form.valid).toBe(true);
    expect(auth.resetPassword).toHaveBeenCalledWith('person@example.com');
    expect(component.status()).toContain('If an account exists');
  });
});
