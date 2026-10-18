import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import AOS from 'aos';
import { vi } from 'vitest';
import { App } from './app';

vi.mock('aos', () => ({
  default: { init: vi.fn(), refresh: vi.fn(), refreshHard: vi.fn() },
}));

@Component({ template: '<div data-aos="flip-left">Test card</div>' })
class AnimatedPage {}

@Component({ template: '<p>Other route</p>' })
class OtherPage {}

describe('App AOS routing', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('initializes once, refreshes rendered routes, and unsubscribes on destruction', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([
        { path: '', component: AnimatedPage },
        { path: 'other', component: OtherPage },
      ])],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(AOS.init).toHaveBeenCalledExactlyOnceWith({
      duration: 1500, easing: 'ease-in-out', once: false,
      mirror: true, offset: 200, disableMutationObserver: true,
    });

    await router.navigateByUrl('/other');
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Other route');
    const refreshCount = vi.mocked(AOS.refreshHard).mock.calls.length;
    expect(refreshCount).toBeGreaterThan(0);

    await router.navigateByUrl('/');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[data-aos="flip-left"]')).toBeTruthy();
    expect(AOS.refreshHard).toHaveBeenCalledTimes(refreshCount + 1);
    expect(AOS.init).toHaveBeenCalledTimes(1);

    fixture.destroy();
    const finalCount = vi.mocked(AOS.refreshHard).mock.calls.length;
    await router.navigateByUrl('/other');
    expect(AOS.refreshHard).toHaveBeenCalledTimes(finalCount);
  });
});
