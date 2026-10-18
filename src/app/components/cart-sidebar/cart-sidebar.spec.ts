import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { CartSidebar } from './cart-sidebar';
import { Cart } from '../../services/cart';

@Component({ template: '' })
class CartPage {}

describe('CartSidebar', () => {
  it('opens, locks scrolling, closes through each control, and restores focus and styles', async () => {
    await TestBed.configureTestingModule({
      imports: [CartSidebar],
      providers: [provideRouter([{ path: 'shop', component: CartPage }, { path: 'cart', component: CartPage }])],
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
      expect(dialog.textContent).toContain('Quantity: 2');
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
});
