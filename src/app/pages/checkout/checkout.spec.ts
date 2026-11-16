import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Checkout } from './checkout';
import { provideRouter } from '@angular/router';
import { Auth } from '../../services/auth';
import { Cart } from '../../services/cart';
import { CheckoutCatalog, CheckoutProductFacts } from '../../services/checkout-catalog';
import { createAuthStub } from '../../testing/auth-stub';
import { vi } from 'vitest';
import { Product } from '../../models/product';

describe('Checkout', () => {
  let component: Checkout;
  let fixture: ComponentFixture<Checkout>;
  let cart: Cart;
  let auth: ReturnType<typeof createAuthStub>;
  let catalog: { load: ReturnType<typeof vi.fn> };
  let facts: Map<string, CheckoutProductFacts>;
  const product = (id: number): Product => ({ id, name: `Product ${id}`, slug: `product-${id}`, price: 10,
    currency: 'USD', category: 'classic', categoryName: 'Classic', image: '' });

  beforeEach(async () => {
    auth = createAuthStub();
    auth.user.set({ id: 'user-1' });
    facts = new Map([['1', { price: 10, currency: 'USD', active: true, stock: 3,
      sales: [{ sale_price: 8, is_active: true, starts_at: null, ends_at: null }] }],
      ['2', { price: 20, currency: 'USD', active: true, stock: null, sales: [] }]]);
    catalog = { load: vi.fn(async () => facts) };
    await TestBed.configureTestingModule({
      imports: [Checkout],
      providers: [provideRouter([]), { provide: Auth, useValue: auth }, { provide: CheckoutCatalog, useValue: catalog }],
    }).compileComponents();
    cart = TestBed.inject(Cart);
    cart.add(product(1), 2);
    cart.add(product(2), 1);
    fixture = TestBed.createComponent(Checkout);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('navigates between cart products, preserves form data, and changes only the active quantity', async () => {
    await component.refresh();
    component.form.controls.fullName.setValue('Alex Example');
    component.move(1);
    expect(component.current()?.product.id).toBe(2);
    component.changeQuantity(1);
    expect(cart.items().map(line => line.quantity)).toEqual([2, 2]);
    component.move(-1);
    expect(component.current()?.product.id).toBe(1);
    expect(component.form.controls.fullName.value).toBe('Alex Example');
    expect(component.current()?.quantity).toBe(2);
  });

  it('calculates all lines in cents with active discounts and authoritative catalog prices', async () => {
    await component.refresh();
    expect(component.totals()).toEqual([{ currency: 'USD', subtotal: 40, discount: 4, total: 36 }]);
    component.move(1);
    expect(component.totals()[0].total).toBe(36);
  });

  it('enforces stock limits and allows missing inventory without calling it out of stock', async () => {
    await component.refresh();
    component.changeQuantity(1);
    component.changeQuantity(1);
    expect(cart.items()[0].quantity).toBe(3);
    component.move(1);
    expect(component.canIncrease(component.current()!)).toBe(true);
    facts.set('1', { ...facts.get('1')!, stock: 0 });
    await component.refresh();
    expect(component.blocked()).toBe(true);
    component.move(-1);
    expect(component.canIncrease(component.current()!)).toBe(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('OUT OF STOCK');
  });

  it('selects the adjacent product on removal and renders the empty cart safely', async () => {
    await component.refresh();
    component.move(1);
    component.removeCurrent();
    expect(component.current()?.product.id).toBe(1);
    component.removeCurrent();
    fixture.detectChanges();
    expect(cart.items()).toEqual([]);
    expect(fixture.nativeElement.querySelector('#empty-title').textContent).toBe('Your cart is empty.');
  });

  it('validates fields, prefills authenticated data, and never fabricates order success', async () => {
    auth.user.set({ id: 'user-1', firstName: 'Alex', lastName: 'Example', email: 'alex@example.com', phoneNumber: '+1 555 123 4567' });
    fixture.detectChanges();
    expect(component.form.controls.fullName.value).toBe('Alex Example');
    component.form.controls.email.setValue('invalid');
    component.form.controls.email.markAsDirty();
    component.submit();
    expect(component.validationMessage('email')).toContain('valid email');
    component.form.patchValue({ email: 'alex@example.com', address: '1 Main St', city: 'Tbilisi' });
    component.submit();
    expect(component.form.valid).toBe(true);
    expect(component.message()).toContain('No order has been placed');
    expect(cart.items().length).toBe(2);
    expect(component.checkoutAvailable).toBe(false);
  });

  it('blocks checkout and quantity increases on query failures or deleted products', async () => {
    catalog.load.mockRejectedValueOnce(new Error('Availability is unavailable'));
    await component.refresh();
    expect(component.error()).toContain('unavailable');
    expect(component.blocked()).toBe(true);
    expect(component.canIncrease(component.current()!)).toBe(false);
    facts.delete('1');
    await component.refresh();
    expect(component.current()?.available).toBe(false);
    expect(component.blocked()).toBe(true);
  });

  it('supports horizontal swipes and ignores vertical movement and boundaries', () => {
    const touch = (x: number, y: number, end = false) => ({ [end ? 'changedTouches' : 'touches']: [{ clientX: x, clientY: y }] }) as unknown as TouchEvent;
    component.startSwipe(touch(200, 100));
    component.endSwipe(touch(100, 110, true));
    expect(component.index()).toBe(1);
    component.startSwipe(touch(100, 100));
    component.endSwipe(touch(200, 300, true));
    expect(component.index()).toBe(1);
    component.move(1);
    expect(component.index()).toBe(1);
  });
});
