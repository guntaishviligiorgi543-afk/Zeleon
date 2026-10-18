import { TestBed } from '@angular/core/testing';
import { Cart } from './cart';

describe('Cart', () => {
  let service: Cart;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Cart);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('adds and merges valid quantities and allows removal', () => {
    const product = { id: 1, name: 'Test', slug: 'test', price: 12, currency: 'USD',
      category: 'classic', categoryName: 'Classic', image: '' };
    expect(service.add(product, 0)).toBe(false);
    expect(service.add(product, 1.5)).toBe(false);
    expect(service.add(product, NaN)).toBe(false);
    expect(service.add(product, 100)).toBe(false);
    expect(service.items()).toEqual([]);
    service.add(product, 2);
    service.add(product, 3);
    expect(service.items()).toEqual([{ product, quantity: 5 }]);
    service.remove(1);
    expect(service.items()).toEqual([]);
  });
});
