import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Auth } from '../../services/auth';
import { StaffAccess } from '../../services/staff-access';
import { ManagerShell } from './manager-shell';

describe('Workspace theme', () => {
  const key = 'zeleon-workspace-theme';
  beforeEach(() => localStorage.removeItem(key));
  afterEach(() => localStorage.removeItem(key));

  async function create(url: string) {
    await TestBed.configureTestingModule({
      imports: [ManagerShell],
      providers: [
        provideRouter([]),
        { provide: Auth, useValue: { displayName: signal('Test') } },
        { provide: StaffAccess, useValue: {} },
      ],
    }).compileComponents();
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue(url);
    const fixture = TestBed.createComponent(ManagerShell);
    fixture.detectChanges();
    return fixture;
  }

  for (const route of ['/manager', '/admin', '/support']) {
    it(`toggles and saves the theme in ${route}`, async () => {
      const fixture = await create(route);
      const button = fixture.nativeElement.querySelector('.theme-toggle') as HTMLButtonElement;
      expect(button.getAttribute('aria-pressed')).toBe('false');
      button.click();
      fixture.detectChanges();
      expect(fixture.nativeElement.classList.contains('workspace-dark')).toBe(true);
      expect(button.getAttribute('aria-pressed')).toBe('true');
      expect(localStorage.getItem(key)).toBe('dark');
      button.click();
      fixture.detectChanges();
      expect(fixture.nativeElement.classList.contains('workspace-dark')).toBe(false);
      expect(localStorage.getItem(key)).toBe('light');
    });
  }

  it('restores the saved preference', async () => {
    localStorage.setItem(key, 'dark');
    const fixture = await create('/support');
    expect(fixture.nativeElement.classList.contains('workspace-dark')).toBe(true);
  });

  for (const [route, labels] of [
    ['/admin', ['Products', 'Users', 'Support Staff', 'Conversations']],
    [
      '/manager',
      ['Overview', 'Products', 'Users', 'Staff', 'Support', 'Orders', 'Analytics', 'Settings'],
    ],
  ] as const) {
    it(`renders Users in the existing navigation for ${route}`, async () => {
      const fixture = await create(`${route}/users`);
      const links = [...fixture.nativeElement.querySelectorAll('nav a')] as HTMLAnchorElement[];
      expect(links.map((link) => link.textContent!.trim())).toEqual([...labels]);
      const users = links.find((link) => link.textContent!.trim() === 'Users')!;
      expect(users.getAttribute('href')).toBe(`${route}/users`);
      expect(users.querySelector('svg path')).not.toBeNull();
      const toggle = fixture.nativeElement.querySelector('.menu-toggle') as HTMLButtonElement;
      toggle.click();
      fixture.detectChanges();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(fixture.nativeElement.querySelector('.manager-rail.is-open')).not.toBeNull();
    });
  }
});
