import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CheckoutCatalog, CheckoutProductFacts, checkoutUnitPrice } from './checkout-catalog';
import { SUPABASE_CLIENT } from './supabase';

describe('Checkout catalog', () => {
  it('respects sale dates, inactive and malformed sales, and never increases the base price', () => {
    const now = Date.parse('2026-11-16T12:00:00Z');
    const facts: CheckoutProductFacts = { price: 10, currency: 'USD', active: true, stock: null, sales: [
      { sale_price: 2, is_active: true, starts_at: null, ends_at: '2026-11-16T12:00:00Z' },
      { sale_price: 3, is_active: true, starts_at: '2026-11-17T12:00:00Z', ends_at: null },
      { sale_price: 1, is_active: false, starts_at: null, ends_at: null },
      { sale_price: 'invalid', is_active: true, starts_at: null, ends_at: null },
      { sale_price: 12, is_active: true, starts_at: null, ends_at: null },
      { sale_price: 8, is_active: true, starts_at: '2026-11-16T12:00:00Z', ends_at: '2026-11-17T12:00:00Z' },
    ] };
    expect(checkoutUnitPrice(facts, now)).toBe(8);
    expect(checkoutUnitPrice({ ...facts, sales: [{ sale_price: 0, is_active: true, starts_at: null, ends_at: null }] }, now)).toBe(0);
    expect(checkoutUnitPrice({ ...facts, sales: [] }, now)).toBe(10);
  });

  it('reads the authoritative offer view and fails closed on missing stock or errors', async () => {
    let result = { data: [{ product_id: 1, regular_price: '12.50', effective_price: '10', currency: 'USD', stock_quantity: 0 }, { product_id: 2, regular_price: 10, effective_price: 8, currency: 'USD', stock_quantity: null }], error: null as unknown };
    const query: Record<string, unknown> = {};
    for (const method of ['select','in']) query[method] = vi.fn(() => query);
    query['abortSignal'] = vi.fn(async () => result);
    const from = vi.fn(() => query);
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: { from } }] });
    const service = TestBed.inject(CheckoutCatalog);
    const facts = await service.load([1,2], new AbortController().signal);
    expect(facts.get('1')).toMatchObject({ price: 12.5, effectivePrice: 10, stock: 0 });
    expect(facts.get('2')?.stock).toBe(0);
    expect(from).toHaveBeenCalledWith('catalog_product_offers');
    expect(checkoutUnitPrice(facts.get('2')!, Date.now())).toBe(8);
    result.error = { message: 'Private details' };
    await expect(service.load([1], new AbortController().signal)).rejects.toThrow('could not be checked');
  });
});
