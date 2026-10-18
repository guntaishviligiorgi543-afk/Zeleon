import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductCard } from './product-card';

describe('ProductCard', () => {
  let component: ProductCard;
  let fixture: ComponentFixture<ProductCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductCard],
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
});
