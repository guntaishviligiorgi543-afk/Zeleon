import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Auth } from './services/auth';
import { createAuthStub } from './testing/auth-stub';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: Auth, useValue: createAuthStub() }],
    })
      .compileComponents();
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
});
