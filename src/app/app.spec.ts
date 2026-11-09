import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Auth } from './services/auth';
import { createAuthStub } from './testing/auth-stub';
import { App } from './app';

@Component({ template: '' })
class RoutedPage {}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: '', component: RoutedPage },
          { path: 'manager', component: RoutedPage },
          { path: 'admin', component: RoutedPage },
          { path: 'admin/staff', component: RoutedPage },
          { path: 'support', component: RoutedPage },
        ]),
        { provide: Auth, useValue: createAuthStub() },
      ],
    }).compileComponents();
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
