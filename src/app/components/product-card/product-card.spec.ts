import { Auth } from '../../services/auth';
import { createAuthenticatedAuthStub } from '../../testing/auth-stub';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Cart } from '../../services/cart';
import { ProductCard } from './product-card';
import { vi } from 'vitest';
import { provideRouter } from '@angular/router';

describe('ProductCard', () => {
  let component: ProductCard;
  let fixture: ComponentFixture<ProductCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductCard],
      providers: [{ provide: Auth, useFactory: createAuthenticatedAuthStub }, Cart, provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductCard);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('product', {
      id: 1, name: 'Test product', slug: 'test-product', price: 15, currency: 'USD',
      image: 'https://example.com/product.jpg', stock: 99, category: 'classic', categoryName: 'Classic',
    });
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('preserves card markup and renders database image, name, and currency', () => {
    expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe('https://example.com/product.jpg');
    expect(fixture.nativeElement.querySelector('.prodNam').textContent).toBe('Test product');
    expect(fixture.nativeElement.querySelector('.prodPrice').textContent.trim()).toBe('$15.00');
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/product/1');
  });

  it('adds and removes the product through the shared cart service', async () => {
    const button = fixture.nativeElement.querySelector('.cart-action') as HTMLButtonElement;
    await component.toggleCart(new MouseEvent('click'));
    fixture.detectChanges();
    expect(button.getAttribute('aria-label')).toContain('Remove');
    expect(component.inCart()).toBe(true);
    await component.toggleCart(new MouseEvent('click'));
    fixture.detectChanges();
    expect(component.inCart()).toBe(false);
  });

  it('preserves the full loading lifecycle without a timer', async () => {
    const cart = TestBed.inject(Cart);
    const add = vi.spyOn(cart, 'add').mockImplementation(() => true);
    const request = component.toggleCart(new MouseEvent('click'));
    expect(component.cartBusy()).toBe(true);
    await request;
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 1);
    expect(component.cartBusy()).toBe(false);
  });
  it('requests login without loading, navigation, or cart mutation for guests', async () => {
    const auth = TestBed.inject(Auth) as unknown as ReturnType<typeof createAuthenticatedAuthStub>;
    auth.user.set(null);
    const cart = TestBed.inject(Cart);
    const requested = vi.fn(); cart.loginRequests.subscribe(requested);
    const request = component.toggleCart(new MouseEvent('click'));
    expect(component.cartBusy()).toBe(false);
    await request;
    expect(requested).toHaveBeenCalledOnce();
    expect(cart.items()).toEqual([]);
  });

  it('shows stock label before crossed-out regular price and never starts loading', async () => {
    fixture.componentRef.setInput('product', { ...component.product(), stock: 0, regularPrice: 15, price: 15 });
    fixture.detectChanges();
    const add = vi.spyOn(TestBed.inject(Cart), 'add');
    const button = fixture.nativeElement.querySelector('.cart-action');
    expect(button.disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.prodPrice').textContent).toContain('OUT OF STOCK');
    expect(fixture.nativeElement.querySelector('.prodPrice s').textContent).toContain('$15.00');
    await component.toggleCart(new MouseEvent('click'));
    expect(add).not.toHaveBeenCalled(); expect(component.cartBusy()).toBe(false);
  });
  it('shows a sale badge and both regular and effective prices', () => {
    fixture.componentRef.setInput('product', { ...component.product(), stock: 5, onSale: true, regularPrice: 15, price: 10 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sale-badge').textContent).toBe('SALE');
    expect(fixture.nativeElement.querySelector('.prodPrice s').textContent).toContain('$15.00');
    expect(fixture.nativeElement.querySelector('.sale-price').textContent).toContain('$10.00');
  });

});
