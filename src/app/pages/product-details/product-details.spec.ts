import { TestBed } from '@angular/core/testing';
import { ProductDetails } from './product-details';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Products } from '../../services/products';
import { vi } from 'vitest';
import { Cart } from '../../services/cart';

describe('ProductDetails', () => {
  let component: ProductDetails;
  let harness: RouterTestingHarness;
  const item = { id: 1, name: 'Test product', slug: 'test-product', price: 15, currency: 'USD',
    category: 'classic', categoryName: 'Classic', image: 'https://example.com/product.jpg' };
  let getProduct: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    getProduct = vi.fn(async (id: string) => id === 'missing' ? null : item);
    await TestBed.configureTestingModule({
      imports: [ProductDetails],
      providers: [provideRouter([{ path: 'product/:id', component: ProductDetails }]),
        { provide: Products, useValue: { getProduct } }],
    }).compileComponents();

    harness = await RouterTestingHarness.create();
    component = await harness.navigateByUrl('/product/1', ProductDetails);
    await harness.fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the product and responds to slug changes on the existing route', async () => {
    expect(harness.routeNativeElement?.textContent).toContain('Test product');
    expect(harness.routeNativeElement?.textContent).toContain('Classic');
    expect(harness.routeNativeElement?.textContent).toContain('$15.00');
    expect(harness.routeNativeElement?.querySelector('img')?.src).toBe(item.image);
    await harness.navigateByUrl('/product/test-product', ProductDetails);
    await harness.fixture.whenStable();
    expect(getProduct).toHaveBeenLastCalledWith('test-product', expect.any(AbortSignal));
  });

  it('handles missing products and retryable errors without retaining the previous product', async () => {
    await harness.navigateByUrl('/product/missing', ProductDetails);
    await harness.fixture.whenStable();
    expect(component.product()).toBeNull();
    expect(harness.routeNativeElement?.textContent).toContain('Product not found');
    getProduct.mockRejectedValueOnce(new Error('Temporary connection problem'));
    await component.loadProduct('1');
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.querySelector('[role="alert"]')?.textContent).toContain('Temporary connection problem');
    await component.loadProduct('1');
    expect(component.product()?.id).toBe(1);
  });

  it('adds the selected quantity, rejects invalid input, and sends Buy Now to checkout', async () => {
    const cart = TestBed.inject(Cart);
    const open = vi.fn();
    const subscription = cart.openRequests.subscribe(open);
    const quantity = harness.routeNativeElement!.querySelector('input') as HTMLInputElement;
    quantity.value = '3';
    quantity.dispatchEvent(new Event('input', { bubbles: true }));
    await harness.fixture.whenStable();
    (harness.routeNativeElement!.querySelector('.add-cart') as HTMLButtonElement).click();
    expect(cart.items()[0].quantity).toBe(3);
    expect(harness.routeNativeElement!.querySelector('.prodPrice')?.textContent).toContain('$45.00');
    expect(component.inCart()).toBe(true);
    expect(component.cartBusy()).toBe(true);
    component.quantity.set(0);
    component.addToCart();
    expect(cart.items()[0].quantity).toBe(3);
    component.quantity.set(1);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.buyNow();
    expect(cart.items()[0].quantity).toBe(4);
    expect(navigate).toHaveBeenCalledWith(['/checkout']);
    subscription.unsubscribe();
  });

  it('temporarily locks the cart button and removes the product on the next click', () => {
    vi.useFakeTimers();
    try {
      component.addToCart();
      harness.fixture.detectChanges();
      const button = harness.routeNativeElement!.querySelector('.add-cart') as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(button.textContent).toContain('Added to Cart');
      component.addToCart();
      expect(TestBed.inject(Cart).items()).toHaveLength(1);
      vi.advanceTimersByTime(650);
      harness.fixture.detectChanges();
      expect(button.disabled).toBe(false);
      button.click();
      harness.fixture.detectChanges();
      expect(button.disabled).toBe(true);
      expect(button.textContent).toContain('Add to Cart');
      expect(TestBed.inject(Cart).items()).toHaveLength(0);
      vi.advanceTimersByTime(650);
      harness.fixture.detectChanges();
      expect(button.disabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
