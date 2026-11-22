import { TestBed } from '@angular/core/testing';
import { CatalogTools } from './catalog-tools';
import {
  ManagerDashboard,
  CatalogDiscount,
  discountStatus,
} from '../../../services/manager-dashboard';
import { vi } from 'vitest';

describe('Catalog tools', () => {
  const product = {
    id: 1,
    name: 'Drink',
    price: 15,
    inventory: { quantity: 20, low_stock_threshold: 10 },
  };
  let service: Record<string, ReturnType<typeof vi.fn>>;
  beforeEach(() => {
    service = {
      getProducts: vi.fn().mockResolvedValue([product]),
      getProductReferences: vi
        .fn()
        .mockResolvedValue({
          categories: [{ id: 1, name: 'Classic', slug: 'classic' }],
          flavors: [],
          types: [],
        }),
      getDiscounts: vi.fn().mockResolvedValue([]),
      saveReference: vi.fn().mockResolvedValue(undefined),
      deleteReference: vi.fn().mockResolvedValue(undefined),
      saveDiscount: vi.fn().mockResolvedValue(undefined),
      cancelDiscount: vi.fn().mockResolvedValue(undefined),
      adjustInventory: vi.fn().mockResolvedValue(undefined),
      inventoryHistory: vi.fn().mockResolvedValue([]),
    };
    TestBed.configureTestingModule({
      imports: [CatalogTools],
      providers: [{ provide: ManagerDashboard, useValue: service }],
    });
  });
  async function create() {
    const fixture = TestBed.createComponent(CatalogTools);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }
  it('creates dynamic categories and flavors through the existing service', async () => {
    const fixture = await create();
    const page = fixture.componentInstance;
    page.reference = { id: undefined, name: 'New category', slug: 'new-category' };
    page.saveReference();
    await fixture.whenStable();
    expect(service['saveReference']).toHaveBeenCalledWith(
      'categories',
      'New category',
      'new-category',
      undefined,
    );
    await page.selectTab('Flavors');
    page.reference = { id: undefined, name: 'Dragon Fruit', slug: 'dragon-fruit' };
    page.saveReference();
    await fixture.whenStable();
    expect(service['saveReference']).toHaveBeenCalledWith(
      'product_flavors',
      'Dragon Fruit',
      'dragon-fruit',
      undefined,
    );
  });
  it('rejects invalid windows and converts required local dates to UTC', async () => {
    const fixture = await create();
    const page = fixture.componentInstance;
    await page.selectTab('Discounts');
    page.sale = {
      id: undefined,
      kind: 'product',
      target: 1,
      amount: 10,
      starts: '2030-01-01T12:00',
      ends: '2030-01-01T11:00',
    };
    page.saveSale();
    expect(service['saveDiscount']).not.toHaveBeenCalled();
    page.sale.ends = '2030-01-02T12:00';
    page.saveSale();
    await fixture.whenStable();
    expect(service['saveDiscount']).toHaveBeenCalledWith(
      'product',
      expect.objectContaining({
        sale_price: 10,
        starts_at: new Date('2030-01-01T12:00').toISOString(),
        ends_at: new Date('2030-01-02T12:00').toISOString(),
      }),
      undefined,
    );
  });
  it('performs a stock-only correction and displays immutable history', async () => {
    const fixture = await create();
    const page = fixture.componentInstance;
    page.inventory = { productId: 1, quantity: 18, threshold: 5, reason: 'Damaged cans' };
    page.saveInventory();
    await fixture.whenStable();
    expect(service['adjustInventory']).toHaveBeenCalledWith(1, 18, 5, 'Damaged cans', 20);
    expect(service['inventoryHistory']).toHaveBeenCalledWith(1);
  });
  it('keeps terminal sale states terminal even after their end time', () => {
    const sale: CatalogDiscount = {
      id: 1,
      kind: 'product',
      product_id: 1,
      sale_price: 10,
      is_active: true,
      starts_at: '2030-01-01T00:00:00Z',
      ends_at: '2030-01-02T00:00:00Z',
    };
    expect(discountStatus(sale, Date.parse('2029-12-31'))).toBe('scheduled');
    expect(discountStatus(sale, Date.parse('2030-01-01T12:00Z'))).toBe('active');
    expect(discountStatus(sale, Date.parse(sale.ends_at))).toBe('expired');
    expect(
      discountStatus(
        { ...sale, is_active: false, end_reason: 'sold_out' },
        Date.parse('2031-01-01'),
      ),
    ).toBe('sold_out');
    expect(
      discountStatus({ ...sale, kind: 'category', status: 'cancelled' }, Date.parse('2031-01-01')),
    ).toBe('cancelled');
  });
});
