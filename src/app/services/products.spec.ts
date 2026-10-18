import { TestBed } from '@angular/core/testing';
import { Products } from './products';
import { SUPABASE_CLIENT } from './supabase';
import { vi } from 'vitest';

describe('Products', () => {
  let service: Products;
  let query: Record<string, ReturnType<typeof vi.fn>>;
  let result: { data: unknown; error: unknown };

  beforeEach(() => {
    result = { data: [], error: null };
    query = {};
    for (const name of ['select', 'eq', 'order', 'abortSignal', 'maybeSingle']) query[name] = vi.fn(() => query);
    query['overrideTypes'] = vi.fn(async () => result);
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: {
      from: vi.fn(() => query), storage: { from: () => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.com/product-images/${path}` } }),
      }) },
    } }] });
    service = TestBed.inject(Products);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  const record = {
    id: 1, name: 'Test product', slug: 'test-product', price: '15.00', currency: 'USD', created_at: '2026-01-01',
    category: { name: 'Classic', slug: 'classic' },
    images: [
      { storage_path: 'older.jpg', is_primary: false, created_at: '2025-01-01' },
      { storage_path: 'primary.jpg', is_primary: true, created_at: '2026-01-01' },
    ],
  };

  it('maps nested categories, numeric prices, and primary Storage images', async () => {
    result.data = [record];
    const products = await service.getActiveProducts();
    expect(products[0]).toMatchObject({ id: 1, category: 'classic', categoryName: 'Classic', price: 15,
      currency: 'USD', image: 'https://example.com/product-images/primary.jpg' });
    expect(query['eq']).toHaveBeenCalledWith('is_active', true);
    expect(query['order']).toHaveBeenCalledWith('created_at');
  });

  it('supports ID and slug lookups and returns null for missing products', async () => {
    result.data = record;
    expect((await service.getProduct('1'))?.name).toBe('Test product');
    expect(query['eq']).toHaveBeenCalledWith('id', '1');
    await service.getProduct('test-product');
    expect(query['eq']).toHaveBeenCalledWith('slug', 'test-product');
    result.data = null;
    expect(await service.getProduct('missing')).toBeNull();
  });

  it('handles empty results, missing images/categories, and API failures', async () => {
    expect(await service.getActiveProducts()).toEqual([]);
    result.data = [{ ...record, category: null, images: [] }];
    expect((await service.getActiveProducts())[0]).toMatchObject({ category: '', image: '' });
    result.error = { message: 'Private server details' };
    await expect(service.getActiveProducts()).rejects.toThrow('Products could not be loaded');
  });
});
