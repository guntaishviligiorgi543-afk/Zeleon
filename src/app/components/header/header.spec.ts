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

  it('reactively shows Profile and Logout and performs real service logout', async () => {
    auth.user.set({ id: 'user-1' } as User);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.headerIcons a').getAttribute('href')).toBe('/profile');
    expect(fixture.nativeElement.querySelector('.logout-button').textContent).toContain('Logout');
    expect(fixture.nativeElement.querySelector('.login-link').getAttribute('href')).toBe('/profile');
    expect(fixture.nativeElement.querySelector('.logout-link')).not.toBeNull();
    auth.signOut.mockImplementationOnce(async () => { auth.user.set(null); });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await component.logout();
    fixture.detectChanges();
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/');
    expect(fixture.nativeElement.querySelector('.logout-button')).toBeNull();
    expect(fixture.nativeElement.querySelector('.logout-link')).toBeNull();
    expect(fixture.nativeElement.querySelector('.headerIcons a').getAttribute('href')).toBe('/login');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('navigates through each header link using the configured routes', async () => {
    const router = TestBed.inject(Router);
    const links = Array.from(fixture.nativeElement.querySelectorAll('.logo, .navbar a, .headerIcons a')) as HTMLAnchorElement[];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/', '/our-story', '/shop', '/contact', '/login',
    ]);
    for (const link of links) {
      link.click();
      await fixture.whenStable();
      expect(router.url).toBe(link.getAttribute('href'));
      if (link.closest('.navbar')) {
        expect(link.classList.contains('active')).toBe(true);
        expect(link.getAttribute('aria-current')).toBe('page');
      }
    }
  });
});
