import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Header } from './header';
import { provideRouter, Router } from '@angular/router';
import { routes } from '../../app.routes';
import { Auth } from '../../services/auth';
import { createAuthStub } from '../../testing/auth-stub';
import { User } from '@supabase/supabase-js';
import { vi } from 'vitest';

describe('Header', () => {
  let component: Header;
  let fixture: ComponentFixture<Header>;
  let auth: ReturnType<typeof createAuthStub>;

  beforeEach(async () => {
    auth = createAuthStub();
    await TestBed.configureTestingModule({
      imports: [Header],
      providers: [provideRouter(routes), { provide: Auth, useValue: auth }],
    }).compileComponents();

    fixture = TestBed.createComponent(Header);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('shows the supplied sign-out icon for an authenticated session and logs out on click', async () => {
    auth.user.set({ id: 'user-1' } as User);
    fixture.detectChanges();
    const sessionButton = fixture.nativeElement.querySelector('.auth-session-button') as HTMLButtonElement;
    const profileLink = fixture.nativeElement.querySelector('.profile-link') as HTMLAnchorElement;
    expect(profileLink.getAttribute('href')).toBe('/profile');
    expect(profileLink.textContent.trim()).toBe('Profile');
    expect(sessionButton.getAttribute('aria-label')).toBe('Log out');
    expect(sessionButton.querySelector('g[fill="currentColor"]')).not.toBeNull();
    expect(sessionButton.querySelectorAll('path')[2].getAttribute('d')).toBe(
      'm13.842 17.385l1.42-1.408l-3.92-3.953h9.144a1 1 0 1 0 0-2h-9.162l3.98-3.947l-1.408-1.42l-6.391 6.337z',
    );
    expect(fixture.nativeElement.querySelector('.login-link').getAttribute('href')).toBe('/profile');
    expect(fixture.nativeElement.querySelector('.logout-link')).not.toBeNull();
    auth.signOut.mockImplementationOnce(async () => { auth.user.set(null); });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    sessionButton.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/');
    expect(fixture.nativeElement.querySelector('.auth-session-button')).toBeNull();
    expect(fixture.nativeElement.querySelector('.logout-link')).toBeNull();
    expect(fixture.nativeElement.querySelector('.auth-session-link').getAttribute('href')).toBe('/login');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the supplied sign-in icon and Login route without a session', () => {
    const loginLink = fixture.nativeElement.querySelector('.auth-session-link') as HTMLAnchorElement;
    expect(loginLink.getAttribute('href')).toBe('/login');
    expect(loginLink.getAttribute('aria-label')).toBe('Login');
    expect(fixture.nativeElement.querySelector('.profile-link')).toBeNull();
    expect(loginLink.querySelector('path[stroke="currentColor"]')?.getAttribute('d')).toBe(
      'M15 4L17 4C19.2091 4 21 5.7909 21 8L21 16C21 18.2091 19.2091 20 17 20L15 20M13.1214 12L3 12M8.0607 6.5L13.7266 11.6314C13.9454 11.8296 13.9454 12.1704 13.7266 12.3686L8.0607 17.5',
    );
  });

  it('returns to Home when local logout clears auth state despite a provider error', async () => {
    auth.user.set({ id: 'user-1' } as User);
    auth.signOut.mockImplementationOnce(async () => {
      auth.user.set(null);
      throw { code: 'network_error' };
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await component.logout();
    expect(auth.user()).toBeNull();
    expect(component.authError()).toContain('could not be completed');
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('navigates through each header link using the configured routes', async () => {
    const router = TestBed.inject(Router);
    const links = Array.from(fixture.nativeElement.querySelectorAll('.logo, .auth-session-link')) as HTMLAnchorElement[];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/', '/login',
    ]);
    for (const link of links) {
      link.click();
      await fixture.whenStable();
      expect(router.url).toBe(link.getAttribute('href'));
    }
  });
});
