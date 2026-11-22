import { Auth } from '../../services/auth';
import { createAuthenticatedAuthStub } from '../../testing/auth-stub';
﻿import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { Cart } from './cart';
import { Cart as CartStore } from '../../services/cart';
import { CheckoutCatalog, CheckoutProductFacts } from '../../services/checkout-catalog';

describe('Cart page', () => {
  const product = (id: number) => ({ id, name: `Product ${id}`, slug: `${id}`, price: 10, currency: 'USD', stock: 99, category: 'classic', categoryName: 'Classic', image: '' });
  let facts: Map<string, CheckoutProductFacts>;
  let page: Cart;
  let store: CartStore;
  let fixture: ReturnType<typeof TestBed.createComponent<Cart>>;
  beforeEach(async () => {
    facts = new Map(Array.from({ length: 6 }, (_, i) => [String(i + 1), {
      price: 10, currency: 'USD', active: true, stock: i === 0 ? 2 : 99,
      sales: i === 0 ? [{ sale_price: 8, is_active: true, starts_at: null, ends_at: null }] : [],
    }]));
    await TestBed.configureTestingModule({ imports: [Cart], providers: [{ provide: Auth, useFactory: createAuthenticatedAuthStub }, provideRouter([]),
      { provide: CheckoutCatalog, useValue: { quote: vi.fn().mockResolvedValue(undefined), load: vi.fn(async () => facts) } },
    ] }).compileComponents();
    store = TestBed.inject(CartStore);
    for (let i = 1; i <= 6; i++) store.add(product(i), 1);
    fixture = TestBed.createComponent(Cart);
    page = fixture.componentInstance;
    fixture.detectChanges();
    await page.refresh();
    fixture.detectChanges();
  });
  it('pages through pairs, preserves quantities, and totals every item', () => {
    expect(page.last()).toBe(2);
    page.changeQuantity(1, 1);
    page.move(1);
    expect(page.first()).toBe(2);
    expect(page.itemCount()).toBe(7);
    expect(page.totals()[0]).toMatchObject({ subtotal: 70, discount: 4, total: 66 });
    page.move(-1);
    expect(page.lines()[0].quantity).toBe(2);
    page.changeQuantity(1, 1);
    expect(page.lines()[0].quantity).toBe(2);
    expect(page.canIncrease(page.lines()[1])).toBe(true);
  });
  it('clamps navigation after deletion and supports single-card paging', () => {
    page.move(2);
    page.remove(6); page.remove(5);
    expect(page.index()).toBe(1);
    page.perPage.set(1); page.move(-10); page.move(1);
    expect(page.first()).toBe(1);
    expect(page.last()).toBe(2);
    page.move(99);
    expect(page.index()).toBe(3);
  });
  it('requires confirmation and disables checkout in the empty state', () => {
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(false);
    page.clear(); expect(store.items()).toHaveLength(6);
    confirm.mockReturnValue(true);
    page.clear(); fixture.detectChanges();
    expect(page.blocked()).toBe(true);
    expect(fixture.nativeElement.querySelector('.carousel-controls')).toBeNull();
    expect(fixture.nativeElement.querySelector('#empty-title')).toBeTruthy();
    confirm.mockRestore();
  });
  it('blocks unavailable stock and routes an available cart to existing checkout', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    facts.set('1', { ...facts.get('1')!, stock: 0 });
    await page.refresh();
    await page.checkout(); expect(navigate).not.toHaveBeenCalled();
    expect(page.canIncrease(page.lines()[0])).toBe(false);
    facts.set('1', { ...facts.get('1')!, stock: 99 });
    await page.refresh();
    await page.checkout(); expect(navigate).toHaveBeenCalledWith(['/checkout']);
  });
});
