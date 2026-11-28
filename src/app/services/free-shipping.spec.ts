import { freeShippingProgress, FREE_SHIPPING_CENTS, SHIPPING_REMINDER_CENTS } from './free-shipping';

describe('Free shipping reminder progress', () => {
  const line = (price: number, quantity = 1, currency = 'USD') => ({ price, quantity, currency });

  it('remains hidden at and below $30; starts only above $30', () => {
    expect(freeShippingProgress([]).visible).toBe(false);
    expect(freeShippingProgress([line(30)]).visible).toBe(false);
    const active = freeShippingProgress([line(30.01)]);
    expect(active.visible).toBe(true);
    expect(active.remainingCents).toBe(999);
    expect(active.unlocked).toBe(false);
  });

  it('unlocks exactly at $40 and above using discounted price and cents', () => {
    expect(FREE_SHIPPING_CENTS).toBe(4000);
    expect(SHIPPING_REMINDER_CENTS).toBe(3000);
    const full = freeShippingProgress([line(12.5, 3), line(2.5)]);
    expect(full.subtotalCents).toBe(4000);
    expect(full.remainingCents).toBe(0);
    expect(full.unlocked).toBe(true);
    expect(full.percent).toBe(100);
    expect(freeShippingProgress([line(39.99)]).remainingCents).toBe(1);
  });

  it('removes the promo when subtotal decreases or cart is cleared and ignores unsupported currencies', () => {
    expect(freeShippingProgress([line(34)]).visible).toBe(true);
    expect(freeShippingProgress([line(20)]).visible).toBe(false);
    expect(freeShippingProgress([]).visible).toBe(false);
    expect(freeShippingProgress([line(35), line(10, 1, 'EUR')]).visible).toBe(false);
    expect(freeShippingProgress([line(Number.NaN)]).visible).toBe(false);
  });
});
