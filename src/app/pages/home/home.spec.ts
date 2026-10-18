import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Home } from './home';
import { vi } from 'vitest';
import { provideRouter } from '@angular/router';
import { Products } from '../../services/products';

describe('Home', () => {
  let component: Home;
  let fixture: ComponentFixture<Home>;
  let top: number;
  let pending: FrameRequestCallback[];
  let reduced = false;
  let cardWidth = 200;
  let sectionHeight = 300;

  beforeEach(async () => {
    top = window.innerHeight;
    reduced = false;
    cardWidth = 200;
    sectionHeight = 300;
    pending = [];
    vi.stubGlobal('CSS', { supports: () => false });
    vi.stubGlobal('matchMedia', () => ({
      get matches() { return reduced; },
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }));
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideRouter([]), { provide: Products, useValue: { getActiveProducts: vi.fn().mockResolvedValue([
        { id: 4, name: 'Berry Blast', price: 12, currency: 'USD', image: '/berry.jpg', slug: 'berry-blast', category: 'boost-blends', categoryName: 'Boost Blends' },
      ]) } }],
    }).compileComponents();

    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const index = ['boostBlends', 'zeroSugar', 'classic'].findIndex((name) => this.classList.contains(name));
      const offset = reduced ? 0 : parseFloat(this.style.getPropertyValue('--category-x')) || 0;
      const left = index < 0 ? 0 : 50 + index * 300 + offset;
      const width = index < 0 ? 900 : cardWidth;
      return { top, height: this.classList.contains('sec4') ? sectionHeight : 300, left, right: left + width, width } as DOMRect;
    });
    vi.spyOn(SVGSVGElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: SVGSVGElement) {
      const index = Array.from(this.parentElement!.querySelectorAll('svg')).indexOf(this);
      const [x, y] = (this.style.translate || '0px 0px').split(' ').map(parseFloat);
      const scale = Number(this.style.transform.match(/scale\(([^)]+)\)/)?.[1] ?? 1);
      const size = 36.8 * scale;
      return { left: 100 + index * 46 + x - size / 2,
        top: top + 240 + y - size / 2, width: size, height: size } as DOMRect;
    });
    await fixture.whenStable();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      pending.push(callback);
      return pending.length;
    });
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders catalog products with details links and prices', () => {
    const card = fixture.nativeElement.querySelector('.sec3Slider .card') as HTMLAnchorElement;
    expect(card.textContent).toContain('Berry Blast');
    expect(card.textContent).toContain('$12.00');
    expect(card.getAttribute('href')).toBe('/product/4');
    expect(card.querySelector('img')?.getAttribute('src')).toBe('/berry.jpg');
  });

  it('preserves page scrolling and supports horizontal and Shift-wheel slider input', async () => {
    const track = fixture.nativeElement.querySelector('.sec3Slider') as HTMLElement;
    const previous = fixture.nativeElement.querySelector('.slider-prev') as HTMLButtonElement;
    const next = fixture.nativeElement.querySelector('.slider-next') as HTMLButtonElement;
    const catalog = TestBed.inject(Products) as unknown as { getActiveProducts: ReturnType<typeof vi.fn> };
    Object.defineProperty(track, 'scrollTo', {
      configurable: true,
      value: ({ left }: ScrollToOptions) => { track.scrollLeft = left ?? 0; },
    });
    catalog.getActiveProducts.mockResolvedValueOnce([
      { id: 4, name: 'Berry Blast', price: 12, currency: 'USD', image: '/berry.jpg', slug: 'berry-blast', category: 'boost-blends', categoryName: 'Boost Blends' },
      { id: 5, name: 'Citrus Charge', price: 14, currency: 'USD', image: '/citrus.jpg', slug: 'citrus-charge', category: 'boost-blends', categoryName: 'Boost Blends' },
    ]);
    await component.loadProducts();
    fixture.detectChanges();
    await fixture.whenStable();
    Object.defineProperties(track, {
      scrollWidth: { configurable: true, value: 1240 },
      clientWidth: { configurable: true, value: 408 },
      offsetLeft: { configurable: true, value: 0 },
    });
    track.querySelectorAll<HTMLElement>('.card').forEach((card, index) => {
      Object.defineProperties(card, {
        offsetLeft: { configurable: true, value: index * 208 },
        offsetWidth: { configurable: true, value: 200 },
      });
    });
    track.scrollLeft = 416;
    track.dispatchEvent(new Event('scroll'));
    expect(previous.disabled).toBe(false);
    expect(next.disabled).toBe(false);
    const wheel = (deltaX: number, deltaY: number, ctrlKey = false, shiftKey = false) => {
      const event = new WheelEvent('wheel', { deltaX, deltaY, ctrlKey, shiftKey, cancelable: true });
      track.dispatchEvent(event);
      return event;
    };
    expect(wheel(0, 120).defaultPrevented).toBe(false);
    expect(track.scrollLeft).toBe(416);
    expect(wheel(0, 120, false, true).defaultPrevented).toBe(true);
    expect(track.scrollLeft).toBe(482);
    expect(previous.disabled).toBe(false);
    wheel(-80, 0);
    expect(track.scrollLeft).toBe(438);
    wheel(0, -120, false, true);
    expect(track.scrollLeft).toBe(372);
    expect(wheel(0, -120).defaultPrevented).toBe(false);
    wheel(2000, 0);
    expect(track.scrollLeft).toBe(416);
    expect(next.disabled).toBe(false);
    expect(wheel(0, 120).defaultPrevented).toBe(false);
    expect(wheel(0, -120).defaultPrevented).toBe(false);
    expect(track.scrollLeft).toBe(416);
    expect(wheel(0, -120, true).defaultPrevented).toBe(false);
    const scrollBy = vi.fn();
    Object.defineProperty(track, 'scrollBy', { configurable: true, value: scrollBy });
    track.scrollLeft = 416;
    track.dispatchEvent(new Event('scroll'));
    next.click();
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 200, behavior: 'smooth' });
    expect(scrollBy.mock.calls[0][0].left).toBe(200);
    next.click();
    expect(scrollBy).toHaveBeenCalledTimes(1);
    track.dispatchEvent(new Event('scrollend'));
    expect(scrollBy).toHaveBeenCalledTimes(2);
    expect(scrollBy.mock.calls[1][0].left).toBe(200);
    track.dispatchEvent(new Event('scrollend'));
    previous.click();
    expect(scrollBy.mock.calls[2][0].left).toBe(-200);
    track.dispatchEvent(new Event('scrollend'));
    reduced = true;
    next.click();
    expect(scrollBy.mock.calls[3][0].behavior).toBe('instant');
    fixture.destroy();
    expect(wheel(0, 120).defaultPrevented).toBe(false);
    expect(track.scrollLeft).toBe(416);
  });

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function scroll(progress: number, distance = 300) {
    top = window.innerHeight - progress * distance;
    window.dispatchEvent(new Event('scroll'));
    flushFrames();
  }

  function flushFrames() {
    const callbacks = pending;
    pending = [];
    callbacks.forEach((callback) => callback(0));
  }

  function positions() {
    return Array.from(fixture.nativeElement.querySelectorAll('.productCategories > a'))
      .map((card) => parseFloat((card as HTMLElement).style.getPropertyValue('--category-x')));
  }

  function expectPositions(expected: number[]) {
    positions().forEach((value, index) => expect(value).toBeCloseTo(expected[index], 8));
  }

  it('enters as a half-overlapping group, spreads, freezes, and reverses', () => {
    scroll(0);
    expect(positions()).toEqual([-451, -651, -851]);
    const handoff = 401 / 851;
    scroll(handoff / 2);
    expectPositions([-250.5, -450.5, -650.5]);
    scroll(handoff);
    expectPositions([-50, -250, -450]);
    // The group now occupies x=0..400, not the center of the 900px container.
    expect(pending).toHaveLength(0);
    scroll(handoff + 0.0001);
    expect(positions()[0]).toBeGreaterThan(-50);
    expect(positions()[0]).toBeLessThan(-49.9);
    scroll((1 + handoff) / 2);
    expectPositions([-25, -125, -225]);
    scroll(1);
    expect(positions()).toEqual([0, 0, 0]);
    scroll(handoff);
    expectPositions([-50, -250, -450]);
    scroll(handoff / 2);
    expectPositions([-250.5, -450.5, -650.5]);
  });

  it('shows all cards when reduced motion is requested', () => {
    reduced = true;
    scroll(0);
    expect(positions()).toEqual([0, 0, 0]);
  });

  it('remeasures actual widths without accumulating the previous transforms', () => {
    scroll(201 / 751);
    cardWidth = 100;
    window.dispatchEvent(new Event('resize'));
    flushFrames();
    expectPositions([-50, -300, -550]);
    scroll(1);
    expect(positions()).toEqual([0, 0, 0]);
  });

  it('synchronizes Section 4 images, clamps progress, and reverses without trailing frames', () => {
    // A section taller than the viewport must continue beyond top alignment.
    sectionHeight = window.innerHeight * 2;
    const first = fixture.nativeElement.querySelector('.sec4img1') as HTMLElement;
    const second = fixture.nativeElement.querySelector('.sec4img2') as HTMLElement;
    for (const progress of [-1, 0, 0.25, 0.5, 0.75, 1, 2, 0.75, 0.5, 0]) {
      scroll(progress, sectionHeight);
      const clamped = Math.max(0, Math.min(1, progress));
      expect(first.style.transform).toBe(`translateY(${-50 * clamped}px) rotate(${20 - 55 * clamped}deg)`);
      expect(second.style.transform).toBe(`translateY(${50 * clamped}px) rotate(${-20 + 55 * clamped}deg)`);
      expect(pending).toHaveLength(0);
    }
    reduced = true;
    scroll(1, sectionHeight);
    expect(first.style.transform).toBe('translateY(0px) rotate(20deg)');
    expect(second.style.transform).toBe('translateY(0px) rotate(-20deg)');
  });

  it('zooms and pans only the Section 6 background safely, reversibly, and after image loads', () => {
    const image = fixture.nativeElement.querySelector('.sec6 > img') as HTMLImageElement;
    const form = fixture.nativeElement.querySelector('.subscriptionForm') as HTMLElement;
    const originalFormStyle = form.getAttribute('style');
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 1901 },
      naturalHeight: { configurable: true, value: 1286 },
    });
    image.dispatchEvent(new Event('load'));
    flushFrames();
    const height = Math.max(300, 900 / (1901 / 1286));
    expect(parseFloat(image.style.height)).toBeCloseTo(height);
    expect(parseFloat(image.style.width)).toBeCloseTo(1901 / 1286 * height);
    for (const progress of [-1, 0, 0.25, 0.5, 0.75, 1, 2, 0.75, 0.5, 0]) {
      scroll(progress);
      const clamped = Math.max(0, Math.min(1, progress));
      const zoom = 1 + 0.5 * Math.abs(2 * clamped - 1);
      const y = -(height * zoom - 300) * clamped;
      expect(image.style.transform).toBe(`translateX(-50%) translateY(${y}px) scale(${zoom})`);
      expect(y).toBeLessThanOrEqual(0);
      expect(y + height * zoom).toBeGreaterThanOrEqual(300);
      expect(form.getAttribute('style')).toBe(originalFormStyle);
      expect(pending).toHaveLength(0);
    }
    // A different cover ratio after loading must be remeasured, not accumulated.
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 4000 });
    image.dispatchEvent(new Event('load'));
    window.dispatchEvent(new Event('resize'));
    flushFrames();
    expect(image.style.height).toBe('300px');
    reduced = true;
    scroll(0);
    expect(image.style.transform).toBe('translateX(-50%) translateY(0px) scale(1)');
  });

  it('removes Section 4 listeners and cancels queued work when destroyed', () => {
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    window.dispatchEvent(new Event('scroll'));
    fixture.destroy();
    expect(cancel).toHaveBeenCalled();
    pending = [];
    window.dispatchEvent(new Event('scroll'));
    expect(pending).toHaveLength(0);
  });

  it('moves Section 5 images from opposite sides and converges the same five arc stars', () => {
    const first = fixture.nativeElement.querySelector('.sec5img1') as HTMLElement;
    const second = fixture.nativeElement.querySelector('.sec5img2') as HTMLElement;
    const stars = Array.from(fixture.nativeElement.querySelectorAll('.sec5 .stars svg')) as SVGSVGElement[];
    const rating = fixture.nativeElement.querySelector('.sec5 .stars p') as HTMLElement;
    scroll(0);
    expect(first.style.transform).toBe('translateX(-100%)');
    expect(second.style.transform).toBe('translateX(100%)');
    const start = stars.map((star) => star.style.translate.split(' ').map(parseFloat));
    start.forEach(([x, y], index) => {
      expect(100 + index * 46 + x).toBeCloseTo(900 * (0.1 + index * 0.2));
      expect(240 + y).toBeCloseTo(300 * [0.38, 0.23, 0.18, 0.23, 0.38][index]);
      expect(stars[index].style.transform).toBe('scale(1.8)');
    });
    for (const progress of [0.5, 1, 2, 0.5, 0, -1]) {
      scroll(progress);
      const clamped = Math.max(0, Math.min(1, progress));
      const remaining = 1 - clamped * clamped * (3 - 2 * clamped);
      expect(first.style.transform).toBe(`translateX(${-100 * remaining}%)`);
      expect(second.style.transform).toBe(`translateX(${100 * remaining}%)`);
      stars.forEach((star, index) => {
        const [x, y] = star.style.translate.split(' ').map(parseFloat);
        expect(x).toBeCloseTo(start[index][0] * remaining);
        expect(y).toBeCloseTo(start[index][1] * remaining);
      });
      expect(pending).toHaveLength(0);
    }
    window.dispatchEvent(new Event('resize'));
    flushFrames();
    stars.forEach((star, index) => {
      const [x, y] = star.style.translate.split(' ').map(parseFloat);
      expect(x).toBeCloseTo(start[index][0]);
      expect(y).toBeCloseTo(start[index][1]);
      expect(star.style.transform).toBe('scale(1.8)');
    });
    reduced = true;
    scroll(0);
    expect(first.style.transform).toBe('translateX(0%)');
    expect(second.style.transform).toBe('translateX(0%)');
    stars.forEach((star) => {
      expect(star.style.translate).toBe('0px 0px');
      expect(star.style.transform).toBe('scale(1)');
    });
    expect(rating.textContent).toBe('5.0');
    expect(rating.style.transform).toBe('');
    expect(fixture.nativeElement.querySelectorAll('.sec5 .stars svg')).toHaveLength(5);
  });
});
