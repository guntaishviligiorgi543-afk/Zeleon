import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Auth } from './services/auth';
import { createAuthStub } from './testing/auth-stub';
import { App } from './app';
import { Products } from './services/products';

@Component({ template: '' })
class RoutedPage {}

describe('App', () => {
  beforeEach(async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: '', component: RoutedPage },
          { path: 'manager', component: RoutedPage },
          { path: 'admin', component: RoutedPage },
          { path: 'admin/staff', component: RoutedPage },
          { path: 'support', component: RoutedPage },
          { path: 'rate-support/:id', loadComponent: () => import('./pages/support-rating/support-rating').then(m => m.SupportRatingPage) },
        ]),
        { provide: Auth, useValue: createAuthStub() },
        { provide: Products, useValue: { getActiveProducts: async () => [] } },
      ],
    }).compileComponents();
  });

  it('renders the actual homepage behind the rating modal and removes the chat widget', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/rate-support/00000000-0000-4000-8000-000000000001?stars=3');
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-home .hero h1')?.textContent).toContain('born to');
    expect(root.querySelector('.rating-overlay [role="dialog"] h1')?.textContent).toBe('Rate your experience');
    expect(root.querySelector('app-customer-chat')).toBeNull();
    expect(root.querySelector('app-header')?.hasAttribute('inert')).toBe(true);
    expect(root.querySelector('app-home')?.hasAttribute('inert')).toBe(true);
    expect(root.querySelector('app-footer')?.hasAttribute('inert')).toBe(true);
    expect(root.querySelector('a.rate-submit')?.getAttribute('href')).toContain('stars%3D3');
    await TestBed.inject(Router).navigateByUrl('/');
    fixture.detectChanges();
    expect(root.querySelector('.rating-overlay')).toBeNull();
    expect(root.querySelector('app-header')?.hasAttribute('inert')).toBe(false);
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the ZELEON application shell', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.logo span')?.textContent).toContain('Zeleon');
  });

  it('hides storefront chrome in workspaces and restores it on the storefront', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    for (const url of ['/manager', '/admin', '/admin/staff', '/support?tab=tickets']) {
      await router.navigateByUrl(url);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-header')).toBeNull();
      expect(fixture.nativeElement.querySelector('app-footer')).toBeNull();
    }
    await router.navigateByUrl('/');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-header')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-footer')).not.toBeNull();
  });
});
