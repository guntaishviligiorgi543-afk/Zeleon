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

  it('validates input and signs in through Auth before navigating to Home', async () => {
    component.submit();
    await fixture.whenStable();
    expect(component.form.invalid).toBe(true);
    expect(fixture.nativeElement.querySelector('#login-email').getAttribute('aria-invalid')).toBe('true');
    expect(component.status()).toBe('');
    component.form.setValue({ email: 'invalid', password: 'short' });
    expect(component.form.invalid).toBe(true);
    component.form.setValue({ email: 'person@example.com', password: 'valid passphrase' });
    expect(component.form.valid).toBe(true);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await component.submit();
    expect(auth.signIn).toHaveBeenCalledWith('person@example.com', 'valid passphrase');
    expect(navigate).toHaveBeenCalledWith('/');
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

  for (const legacy of [true, false]) {
    it(`preserves ${legacy ? 'legacy' : 'new'} rating intent after sign-in`, async () => {
      const id = '00000000-0000-4000-8000-000000000001';
      const destination = `/rate-support/${id}?stars=3`;
      const router = TestBed.inject(Router);
      vi.spyOn(router, 'url', 'get').mockReturnValue(legacy
        ? `/login?supportChat=${id}&supportRating=3`
        : '/login?returnUrl=' + encodeURIComponent(destination));
      const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      component.form.setValue({ email: 'person@example.com', password: 'valid passphrase' });
      await component.submit();
      expect(navigate).toHaveBeenCalledWith(destination);
    });
  }
});
