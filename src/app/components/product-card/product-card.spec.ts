import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Cart } from '../../services/cart';
import { ProductCard } from './product-card';
import { vi } from 'vitest';

describe('ProductCard', () => {
  let component: ProductCard;
  let fixture: ComponentFixture<ProductCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductCard],
      providers: [Cart],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductCard);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('product', {
      id: 1, name: 'Test product', slug: 'test-product', price: 15, currency: 'USD',
      image: 'https://example.com/product.jpg', category: 'classic', categoryName: 'Classic',
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
});
