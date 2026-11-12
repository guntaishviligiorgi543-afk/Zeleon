import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Auth } from '../services/auth';
import { createAuthStub } from '../testing/auth-stub';
import { Login } from './login/login';
import { Signup } from './signup/signup';

for (const page of [Login, Signup]) {
  describe(`${page.name} Google sign-in`, () => {
    function setup() {
      const auth = createAuthStub();
      TestBed.configureTestingModule({ imports: [page], providers: [provideRouter([]), { provide: Auth, useValue: auth }] });
      const router = TestBed.inject(Router);
      vi.spyOn(router, 'url', 'get').mockReturnValue('/login?returnUrl=%2Fprofile%2Fsecurity');
      const fixture = TestBed.createComponent(page as Type<Login | Signup>);
      fixture.detectChanges();
      return { auth, fixture, component: fixture.componentInstance };
    }

    it('renders an enabled Google button and starts without email/password form validation', async () => {
      const { auth, fixture, component } = setup();
      expect(component.form.invalid).toBe(true);
      const button = fixture.nativeElement.querySelector('.google-oauth-button') as HTMLButtonElement;
      expect(button.textContent).toContain('Continue with Google');
      expect(button.type).toBe('button');
      expect(button.disabled).toBe(false);
      expect(button.querySelector('svg')).not.toBeNull();
      button.click();
      fixture.detectChanges();
      expect(auth.signInWithGoogle).toHaveBeenCalledExactlyOnceWith('/profile/security');
      expect(auth.signUp).not.toHaveBeenCalled();
      expect(auth.signIn).not.toHaveBeenCalled();
      expect(button.disabled).toBe(true);
      expect(button.getAttribute('aria-busy')).toBe('true');
    });

    it('blocks duplicate OAuth and password requests until redirect or browser back', async () => {
      const { auth, component } = setup();
      let finish!: () => void;
      auth.signInWithGoogle.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
      const first = component.googleSignIn();
      await component.googleSignIn();
      await component.submit();
      expect(auth.signInWithGoogle).toHaveBeenCalledOnce();
      expect(auth.signIn).not.toHaveBeenCalled();
      expect(auth.signUp).not.toHaveBeenCalled();
      finish();
      await first;
      component.restoreAfterBackNavigation({ persisted: true } as PageTransitionEvent);
      expect(component.pending()).toBe(false);
    });

    it('shows a safe OAuth error and allows retry', async () => {
      const { auth, component } = setup();
      auth.signInWithGoogle.mockRejectedValueOnce(new Error('Provider secret should not be shown'));
      await component.googleSignIn();
      expect(component.pending()).toBe(false);
      expect(component.status()).toContain('Please try again');
      expect(component.status()).not.toContain('secret');
      await component.googleSignIn();
      expect(auth.signInWithGoogle).toHaveBeenCalledTimes(2);
    });
  });
}
