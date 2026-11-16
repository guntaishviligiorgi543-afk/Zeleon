import { Auth } from '../../services/auth';
import { createAuthenticatedAuthStub } from '../../testing/auth-stub';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { CartSidebar } from './cart-sidebar';
import { Cart } from '../../services/cart';

@Component({ template: '' })
class CartPage {}

describe('CartSidebar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it('opens, locks scrolling, closes through each control, and restores focus and styles', async () => {
    await TestBed.configureTestingModule({
      imports: [CartSidebar],
      providers: [{ provide: Auth, useFactory: createAuthenticatedAuthStub }, provideRouter([{ path: 'shop', component: CartPage }, { path: 'cart', component: CartPage }])],
    }).compileComponents();
    const fixture = TestBed.createComponent(CartSidebar);
    await fixture.whenStable();
    const sidebar = fixture.componentInstance;
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    const trigger = document.createElement('button');
    document.body.append(trigger);
    dialog.showModal = vi.fn(() => dialog.setAttribute('open', ''));
    dialog.close = vi.fn(() => dialog.removeAttribute('open'));
    const saved = document.body.style.overflow;
    try {
      document.body.style.overflow = 'auto';
      trigger.focus();
      sidebar.open();
      expect(dialog.open).toBe(true);
      expect(document.body.style.overflow).toBe('hidden');
      (dialog.querySelector('.cart-panel') as HTMLElement).click();
      expect(sidebar.opened()).toBe(true);
      (dialog.querySelector('.cart-close') as HTMLButtonElement).click();
      expect(sidebar.opened()).toBe(false);
      expect(document.body.style.overflow).toBe('auto');
      expect(document.activeElement).toBe(trigger);
      sidebar.open();
      dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
      expect(dialog.open).toBe(false);
      sidebar.open();
      dialog.click();
      expect(dialog.open).toBe(false);
      sidebar.open();
      await TestBed.inject(Router).navigateByUrl('/shop');
      expect(dialog.open).toBe(false);
      const cart = TestBed.inject(Cart);
      cart.add({ id: 1, name: 'Test product', slug: 'test', price: 12, currency: 'USD',
        category: 'classic', categoryName: 'Classic', image: '' }, 2);
      cart.openRequests.next();
      await fixture.whenStable();
      expect(sidebar.opened()).toBe(true);
      expect(dialog.textContent).toContain('Test product');
      expect(dialog.querySelector('.quantity-value')?.textContent).toBe('2');
      expect(dialog.textContent).toContain('$24.00');
      (dialog.querySelector('.remove-item') as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(cart.items()).toEqual([]);
      expect(dialog.textContent).toContain('Your cart is currently empty');
      sidebar.close();
      sidebar.open();
      fixture.destroy();
      expect(document.body.style.overflow).toBe('auto');
    } finally {
      fixture.destroy();
      trigger.remove();
      document.body.style.overflow = saved;
    }
  });

  async function setup(animated = false) {
    vi.stubGlobal('matchMedia', () => ({ matches: !animated }));
    await TestBed.configureTestingModule({
      imports: [CartSidebar], providers: [{ provide: Auth, useFactory: createAuthenticatedAuthStub }, provideRouter([{ path: 'cart', component: CartPage }])],
    }).compileComponents();
    const fixture = TestBed.createComponent(CartSidebar);
    await fixture.whenStable();
    const sidebar = fixture.componentInstance;
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    dialog.showModal = vi.fn(() => dialog.setAttribute('open', ''));
    dialog.close = vi.fn(() => dialog.removeAttribute('open'));
    if (animated) vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({
      transform: 'matrix(1, 0, 0, 1, 100, 0)', opacity: '0.5',
    }) as CSSStyleDeclaration);
    const product = { id: 1, name: 'Test product', slug: 'test', price: 12, currency: 'USD',
      category: 'classic', categoryName: 'Classic', image: '' };
    return { fixture, sidebar, dialog, cart: TestBed.inject(Cart), product };
  }

  function finishPanel(dialog: HTMLDialogElement, name: string) {
    const event = new Event('animationend', { bubbles: true });
    Object.defineProperty(event, 'animationName', { value: name });
    dialog.querySelector('.cart-panel')!.dispatchEvent(event);
  }

  it('uses the shared cart for quantity changes and totals without combining currencies', async () => {
    const { sidebar, cart, product, fixture } = await setup();
    cart.add(product, 2);
    cart.add({ ...product, id: 2, currency: 'EUR' }, 3);
    expect(sidebar.totals()).toEqual([{ currency: 'USD', amount: 24 }, { currency: 'EUR', amount: 36 }]);
    sidebar.changeQuantity(cart.items()[0], 1);
    expect(cart.items()[0].quantity).toBe(3);
    expect(sidebar.totals()[0].amount).toBe(36);
    sidebar.changeQuantity(cart.items()[0], -1);
    expect(sidebar.totals()[0].amount).toBe(24);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.checkout-button').getAttribute('href')).toBe('/checkout');
    expect(fixture.nativeElement.querySelector('.view-cart').getAttribute('href')).toBe('/cart');
    fixture.destroy();
  });

  it('keeps the native modal locked through exit, can reopen mid-exit, and restores scrolling', async () => {
    const { sidebar, dialog, fixture } = await setup(true);
    vi.useFakeTimers();
    const previous = document.body.style.overflow;
    sidebar.open();
    expect(sidebar.phase()).toBe('opening');
    finishPanel(dialog, 'cart-enter');
    expect(sidebar.phase()).toBe('open');
    sidebar.close();
    expect(sidebar.phase()).toBe('closing');
    expect(dialog.open).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    sidebar.open();
    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(sidebar.phase()).toBe('opening');
    expect((dialog.querySelector('.cart-panel') as HTMLElement).style.getPropertyValue('--cart-enter-from'))
      .toBe('matrix(1, 0, 0, 1, 100, 0)');
    vi.advanceTimersByTime(500);
    expect(dialog.open).toBe(true);
    expect(sidebar.phase()).toBe('open');
    sidebar.close();
    finishPanel(dialog, 'cart-exit');
    expect(sidebar.opened()).toBe(false);
    expect(document.body.style.overflow).toBe(previous);
    // Late native close notifications must not close a new modal.
    sidebar.open();
    dialog.dispatchEvent(new Event('close'));
    expect(sidebar.opened()).toBe(true);
    sidebar.close();
    vi.advanceTimersByTime(400);
    expect(sidebar.opened()).toBe(false);
    fixture.destroy();
  });

  it('waits for exit before navigation and respects modified link clicks', async () => {
    const { sidebar, dialog, fixture } = await setup(true);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    sidebar.open();
    const modified = new MouseEvent('click', { ctrlKey: true, cancelable: true });
    sidebar.navigateAfterClose(modified, '/cart');
    expect(modified.defaultPrevented).toBe(false);
    expect(sidebar.phase()).toBe('opening');
    const click = new MouseEvent('click', { cancelable: true });
    sidebar.navigateAfterClose(click, '/cart');
    expect(click.defaultPrevented).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    finishPanel(dialog, 'cart-exit');
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/cart');
    fixture.destroy();
  });

  it('animates only the requested removal, rejects duplicate clicks and preserves a replacement line', async () => {
    const { sidebar, cart, product, fixture } = await setup(true);
    vi.useFakeTimers();
    cart.add(product, 2);
    cart.add({ ...product, id: 2 }, 1);
    const first = cart.items()[0];
    sidebar.removeLine(first);
    sidebar.removeLine(first);
    expect(cart.items()).toHaveLength(2);
    expect(sidebar.removingIds().has(1)).toBe(true);
    sidebar.changeQuantity(first, 1);
    expect(cart.items()[0].quantity).toBe(2);
    vi.advanceTimersByTime(340);
    expect(cart.items().map(line => line.product.id)).toEqual([2]);
    expect(sidebar.totals()[0].amount).toBe(12);
    const second = cart.items()[0];
    sidebar.removeLine(second);
    cart.remove(2);
    cart.add({ ...product, id: 2 }, 3);
    vi.advanceTimersByTime(340);
    expect(cart.items()[0].quantity).toBe(3);
    expect(sidebar.removingIds().size).toBe(0);
    sidebar.removeLine(cart.items()[0]);
    fixture.destroy();
    vi.advanceTimersByTime(1000);
    expect(cart.items()).toEqual([]);
  });
  it('shows the locked state in the same drawer and closes on session loss', async () => {
    const { fixture, sidebar, dialog, cart, product } = await setup();
    const auth = TestBed.inject(Auth) as unknown as ReturnType<typeof createAuthenticatedAuthStub>;
    cart.add(product, 2); sidebar.open();
    await fixture.whenStable();
    auth.user.set(null);
    expect(cart.items()).toEqual([]);
    await fixture.whenStable();
    expect(sidebar.opened()).toBe(false);
    sidebar.open(); fixture.detectChanges();
    expect(dialog.textContent).toContain('Your Cart Is Locked');
    expect(dialog.textContent).toContain('Please log in to view your cart and start shopping.');
    expect(dialog.querySelector('.cart-line')).toBeNull();
    expect(dialog.querySelector('.cart-footer')).toBeNull();
    expect(dialog.querySelector('a[href="/signup"]')).toBeTruthy();
    fixture.destroy();
  });

});
