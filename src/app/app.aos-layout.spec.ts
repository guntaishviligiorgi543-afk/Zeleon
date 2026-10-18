import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { App } from './app';

@Component({ template: '<div class="sec3box" data-aos="flip-left" data-aos-duration="1500" data-aos-easing="ease-in-out" data-aos-offset="200" data-aos-once="false">Card</div>' })
class LayoutPage {}

describe('AOS layout measurement regression (real library)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('resets an early trigger when images move the box down, then triggers, resets, and replays', async () => {
    let boxTop = 100;
    let resize: ResizeObserverCallback | undefined;
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resize = callback; }
      observe() {}
      disconnect() {}
    });
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('sec3box') ? boxTop : 0;
    });
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    vi.spyOn(window, 'pageYOffset', 'get').mockReturnValue(0);
    await TestBed.configureTestingModule({
      imports: [App], providers: [provideRouter([{ path: '', component: LayoutPage }])],
    }).compileComponents();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();
    const box = fixture.nativeElement.querySelector('.sec3box') as HTMLElement;
    expect(box.classList.contains('aos-init')).toBe(true);
    expect(box.classList.contains('aos-animate')).toBe(true);

    // Reproduce image loading above the element without a route or window resize.
    boxTop = 1800;
    expect(box.classList.contains('aos-animate')).toBe(true); // Cached old offset.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    resize?.([], {} as ResizeObserver);
    frame?.(0);
    expect(box.classList.contains('aos-animate')).toBe(false);

    // Exercise AOS's real scroll handler after the measurements are corrected.
    vi.useFakeTimers();
    const scroll = (y: number) => {
      vi.spyOn(window, 'pageYOffset', 'get').mockReturnValue(y);
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(120);
    };
    scroll(1201); // top + 200 - viewport height = 1200
    expect(box.classList.contains('aos-animate')).toBe(true);
    scroll(1199);
    expect(box.classList.contains('aos-animate')).toBe(false);
    scroll(1201);
    expect(box.classList.contains('aos-animate')).toBe(true);
    fixture.destroy();
  });
});
