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

  it('hides the storefront header on Manager routes', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/manager');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-header')).toBeNull();
  });
});
