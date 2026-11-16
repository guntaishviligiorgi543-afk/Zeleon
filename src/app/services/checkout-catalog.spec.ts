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

  it('reads actual public tables, preserves null and zero stock, and fails closed on query errors', async () => {
    const records: Record<string, { data: unknown[]; error: unknown }> = {
      products: { data: [{ id: 1, price: '12.50', currency: 'USD', is_active: true }, { id: 2, price: 10, currency: 'USD', is_active: true }], error: null },
      product_inventory: { data: [{ product_id: 1, quantity: 0 }], error: null },
      product_sales: { data: [{ product_id: 1, sale_price: 9, is_active: true, starts_at: null, ends_at: null }], error: null },
    };
    const from = vi.fn((table: string) => {
      const query: Record<string, unknown> = {};
      for (const method of ['select', 'in', 'eq']) query[method] = vi.fn(() => query);
      query['abortSignal'] = vi.fn(async () => records[table]);
      return query;
    });
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: { from } }] });
    const service = TestBed.inject(CheckoutCatalog);
    const facts = await service.load([1, 2], new AbortController().signal);
    expect(facts.get('1')).toMatchObject({ price: 12.5, stock: 0 });
    expect(facts.get('2')?.stock).toBeNull();
    expect(from.mock.calls.map(call => call[0])).toEqual(['products', 'product_inventory', 'product_sales']);
    records['product_sales'].error = { message: 'Private details' };
    await expect(service.load([1], new AbortController().signal)).rejects.toThrow('could not be checked');
  });
});
