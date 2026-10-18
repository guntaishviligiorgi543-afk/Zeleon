import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Login } from './login';
import { provideRouter, Router } from '@angular/router';
import { Auth } from '../../services/auth';
import { createAuthStub } from '../../testing/auth-stub';
import { vi } from 'vitest';

describe('Login', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;
  let auth: ReturnType<typeof createAuthStub>;

  beforeEach(async () => {
    auth = createAuthStub();
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), { provide: Auth, useValue: auth }],
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('validates input and signs in through Auth before navigating to Profile', async () => {
    component.submit();
    await fixture.whenStable();
    expect(component.form.invalid).toBe(true);
    expect(fixture.nativeElement.querySelector('#login-email').getAttribute('aria-invalid')).toBe('true');
    expect(component.status()).toBe('');
    component.form.setValue({ email: 'invalid', password: 'short' });
    expect(component.form.invalid).toBe(true);
    component.form.setValue({ email: 'person+test@example.com', password: 'valid passphrase' });
    expect(component.form.valid).toBe(true);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await component.submit();
    expect(auth.signIn).toHaveBeenCalledWith('person+test@example.com', 'valid passphrase');
    expect(navigate).toHaveBeenCalledWith('/profile');
    const links = Array.from(fixture.nativeElement.querySelectorAll('a')) as HTMLAnchorElement[];
    expect(links.map((link) => link.getAttribute('href'))).toContain('/forgot-password');
    expect(links.map((link) => link.getAttribute('href'))).toContain('/signup');
  });

  it('shows a generic incorrect-password error', async () => {
    component.form.setValue({ email: 'person@example.com', password: 'wrongpassword' });
    auth.signIn.mockRejectedValueOnce({ code: 'invalid_credentials' });
    await component.submit();
    expect(component.status()).toContain('Check your email and password');
    expect(component.pending()).toBe(false);
  });
});
