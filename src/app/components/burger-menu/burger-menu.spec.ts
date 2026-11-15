import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BurgerMenu } from './burger-menu';
import { Component } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

@Component({ template: '' })
class MenuPage {}

describe('BurgerMenu', () => {
  let component: BurgerMenu;
  let fixture: ComponentFixture<BurgerMenu>;
  let mobile: boolean;
  let reducedMotion: boolean;
  let resized: () => void;
  let removed: ReturnType<typeof vi.fn>;
  let dialog: HTMLDialogElement;
  const links = [
    { path: '/our-story', label: 'our-story' },
    { path: '/shop', label: 'Shop All' },
    { path: '/contact', label: 'Contact' },
  ];

  beforeEach(async () => {
    mobile = true;
    reducedMotion = true;
    removed = vi.fn();
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() { return query.includes('prefers-reduced-motion') ? reducedMotion : mobile; },
      addEventListener: (_: string, callback: () => void) => { resized = callback; },
      removeEventListener: removed,
    }));
    await TestBed.configureTestingModule({
      imports: [BurgerMenu],
      providers: [provideRouter([
        ...links.map((link) => ({ path: link.path.slice(1), component: MenuPage })),
        { path: 'login', component: MenuPage },
        { path: 'cart', component: MenuPage },
      ])],
    }).compileComponents();

    fixture = TestBed.createComponent(BurgerMenu);
    // jsdom does not evaluate viewport media queries; expose the mobile host.
    fixture.nativeElement.style.display = 'block';
    component = fixture.componentInstance;
    fixture.componentRef.setInput('links', links);
    await fixture.whenStable();
    dialog = fixture.nativeElement.querySelector('dialog');
    // jsdom has no native modal UI. Test component behavior around its native API.
    dialog.showModal = vi.fn(() => {
      dialog.setAttribute('open', '');
      (dialog.querySelector('.menu-close') as HTMLElement).focus();
    });
    dialog.close = vi.fn(() => dialog.removeAttribute('open'));
  });

  afterEach(() => {
    fixture.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('opens, locks scrolling, closes with Escape and restores scroll styles and focus', async () => {
    const toggle = fixture.nativeElement.querySelector('.menu-toggle') as HTMLButtonElement;
    const saved = document.body.style.overflow;
    document.body.style.overflow = 'auto';
    try {
      toggle.click();
      await fixture.whenStable();
      expect(dialog.open).toBe(true);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(document.body.style.overflow).toBe('hidden');
      expect(document.activeElement).toBe(dialog.querySelector('.menu-close'));
      const cancel = new Event('cancel', { cancelable: true });
      dialog.dispatchEvent(cancel);
      await fixture.whenStable();
      expect(cancel.defaultPrevented).toBe(true);
      expect(dialog.open).toBe(false);
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(document.body.style.overflow).toBe('auto');
      expect(document.activeElement).toBe(toggle);
    } finally { document.body.style.overflow = saved; }
  });

  it('closes via the close button, outside click, desktop resize, and destruction', () => {
    component.open();
    (dialog.querySelector('.menu-panel') as HTMLElement).click();
    expect(component.opened()).toBe(true);
    (dialog.querySelector('.menu-close') as HTMLButtonElement).click();
    expect(component.opened()).toBe(false);
    component.open();
    dialog.click();
    expect(component.opened()).toBe(false);
    component.open();
    mobile = false;
    resized();
    expect(dialog.open).toBe(false);
    component.open();
    expect(component.opened()).toBe(false);
    mobile = true;
    component.open();
    fixture.destroy();
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(removed).toHaveBeenCalled();
  });

  it('uses the same navigation links, provides Login and Cart, and closes after navigation', async () => {
    const router = TestBed.inject(Router);
    const anchors = Array.from(dialog.querySelectorAll('a'));
    expect(anchors.map((anchor) => anchor.getAttribute('href'))).toEqual([
      ...links.map((link) => link.path), '/login',
    ]);
    expect(Array.from(dialog.querySelectorAll('nav a')).map((anchor) => anchor.textContent?.trim())).toEqual(
      links.map((link) => link.label),
    );
    expect(dialog.textContent).not.toContain('Logout');
    for (const anchor of anchors) {
      component.open();
      anchor.click();
      expect(component.opened()).toBe(false);
      await fixture.whenStable();
      expect(router.url).toBe(anchor.getAttribute('href'));
    }
    component.open();
    await router.navigateByUrl('/shop');
    expect(component.opened()).toBe(false);
  });

  it('closes the menu before requesting the cart sidebar', () => {
    const requested = vi.fn();
    component.cartRequested.subscribe(requested);
    component.open();
    (dialog.querySelector('.cart-link') as HTMLButtonElement).click();
    expect(component.opened()).toBe(false);
    expect(requested).toHaveBeenCalledOnce();
  });

  function enableAnimatedClose(): void {
    reducedMotion = false;
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({
      transform: 'matrix(1, 0, 0, 1, 80, 0)', opacity: '0.7',
    }) as CSSStyleDeclaration);
  }

  function finishExit(target = dialog.querySelector('.menu-panel')!): void {
    const event = new Event('animationend', { bubbles: true });
    Object.defineProperty(event, 'animationName', { value: 'menu-exit' });
    target.dispatchEvent(event);
  }

  it('keeps focus and scroll locked until the panel finishes exiting, including an interrupted entrance', () => {
    enableAnimatedClose();
    component.open();
    component.close();
    fixture.detectChanges();
    expect(component.closing()).toBe(true);
    expect(dialog.open).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    expect((dialog.querySelector('.menu-panel') as HTMLElement).style.getPropertyValue('--menu-exit-from'))
      .toBe('matrix(1, 0, 0, 1, 80, 0)');
    finishExit(dialog.querySelector('.menu-heading span')!);
    expect(component.opened()).toBe(true);
    finishExit();
    expect(component.opened()).toBe(false);
    expect(component.closing()).toBe(false);
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.menu-toggle'));
  });

  it('opens the cart once after the animated menu has closed', () => {
    enableAnimatedClose();
    const requested = vi.fn();
    component.cartRequested.subscribe(requested);
    component.open();
    component.openCart();
    component.openCart();
    expect(requested).not.toHaveBeenCalled();
    finishExit();
    expect(dialog.open).toBe(false);
    expect(requested).toHaveBeenCalledOnce();
  });

  it('releases the modal if animationend is missing and cancels the fallback on destruction', () => {
    enableAnimatedClose();
    vi.useFakeTimers();
    component.open();
    component.close();
    vi.advanceTimersByTime(400);
    expect(component.opened()).toBe(false);
    component.open();
    component.close();
    fixture.destroy();
    const calls = vi.mocked(dialog.close).mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(dialog.close).toHaveBeenCalledTimes(calls);
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
