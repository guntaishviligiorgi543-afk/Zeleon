import { Auth } from './auth';
import { createAuthenticatedAuthStub } from '../testing/auth-stub';
import { TestBed } from '@angular/core/testing';
import { Cart } from './cart';

describe('Cart', () => {
  let service: Cart;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: Auth, useFactory: createAuthenticatedAuthStub }] });
    service = TestBed.inject(Cart);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('changes only the requested quantity and enforces control limits', () => {
    const product = { id: 1, name: 'Test', slug: 'test', price: 12, currency: 'USD',
      category: 'classic', categoryName: 'Classic', image: '' };
    service.add(product, 1);
    service.add({ ...product, id: 2 }, 99);
    expect(service.changeQuantity(1, -1)).toBe(false);
    expect(service.changeQuantity(2, 1)).toBe(false);
    expect(service.changeQuantity(999, 1)).toBe(false);
    expect(service.changeQuantity(1, 2 as 1)).toBe(false);
    expect(service.changeQuantity(1, 1)).toBe(true);
    expect(service.items().map(line => line.quantity)).toEqual([2, 99]);
    expect(service.changeQuantity(2, -1)).toBe(true);
    expect(service.items().map(line => line.quantity)).toEqual([2, 98]);
    expect(service.items()[0].product).toBe(product);
    service.add(product, 99);
    expect(service.items()[0].quantity).toBe(101);
    expect(service.changeQuantity(1, 1)).toBe(false);
    expect(service.changeQuantity(1, -1)).toBe(true);
    expect(service.items()[0].quantity).toBe(100);
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
  it('rejects every mutation while logged out or initializing, without exposing old items', () => {
    const auth = TestBed.inject(Auth) as unknown as ReturnType<typeof createAuthenticatedAuthStub>;
    const product = { id: 1, name: 'Test', slug: 'test', price: 12, currency: 'USD', category: 'classic', categoryName: 'Classic', image: '' };
    const requests: number[] = [];
    service.loginRequests.subscribe(() => requests.push(1));
    service.add(product, 2);
    auth.initialized.set(false);
    expect(service.items()).toEqual([]);
    expect(service.add(product, 1)).toBe(false);
    expect(service.changeQuantity(1, 1)).toBe(false);
    service.remove(1); service.clear();
    expect(requests.length).toBe(1);
    TestBed.tick();
    auth.initialized.set(true); auth.user.set(null);
    TestBed.tick();
    auth.user.set({ id: 'user-2' });
    expect(service.items()).toEqual([]);
    service.add(product, 1);
    expect(service.items()[0].quantity).toBe(1);
    auth.user.set({ id: 'user-3' });
    expect(service.items()).toEqual([]);
    TestBed.tick();
    auth.user.set({ id: 'user-2' });
    expect(service.items()).toEqual([]);
  });

});
