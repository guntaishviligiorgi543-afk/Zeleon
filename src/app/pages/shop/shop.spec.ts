import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Shop } from './shop';
import { provideRouter } from '@angular/router';
import { Products } from '../../services/products';
import { vi } from 'vitest';

describe('Shop', () => {
  let component: Shop;
  let fixture: ComponentFixture<Shop>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Shop],
      providers: [provideRouter([]), { provide: Products, useValue: { getActiveProducts: vi.fn().mockResolvedValue([]) } }],
    }).compileComponents();

    fixture = TestBed.createComponent(Shop);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the empty inventory count and updates it when category filters change', async () => {
    expect(fixture.nativeElement.querySelector('.filteredQuantity').textContent.trim()).toBe('0 Products');
    component.products.set([
      { id: 1, name: 'B', slug: 'b', price: 2, currency: 'USD', image: '', category: 'classic', categoryName: 'Classic' },
      { id: 2, name: 'A', slug: 'a', price: 1, currency: 'USD', image: '', category: 'zero-sugar', categoryName: 'Zero Sugar' },
    ]);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.filteredQuantity').textContent.trim()).toBe('2 Products');
    (fixture.nativeElement.querySelector('.filters .classic') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.filteredQuantity').textContent.trim()).toBe('1 Products');
    expect(component.selectedCategoryName).toBe('Classic');
    component.selectCategory('all');
    (fixture.nativeElement.querySelector('.sort-toggle') as HTMLButtonElement).click();
    await fixture.whenStable();
    (fixture.nativeElement.querySelector('#sort-option-1') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(component.displayedProducts.map((product) => product.id)).toEqual([2, 1]);
    expect(component.products().map((product) => product.id)).toEqual([1, 2]);
  });

  it('supports keyboard selection, Escape, and outside-click dismissal', async () => {
    const toggle = fixture.nativeElement.querySelector('.sort-toggle') as HTMLButtonElement;
    const key = async (value: string) => {
      toggle.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
      await fixture.whenStable();
    };
    await key('ArrowDown');
    expect(component.sortOpen()).toBe(true);
    await key('ArrowDown');
    await key('Enter');
    expect(component.selectedSort).toBe('priceLowToHigh');
    expect(component.sortOpen()).toBe(false);
    toggle.click();
    await key('Escape');
    expect(component.sortOpen()).toBe(false);
    toggle.click();
    await fixture.whenStable();
    document.body.click();
    await fixture.whenStable();
    expect(component.sortOpen()).toBe(false);
  });

  it('loads asynchronously, keeps category filters, and supports every sort without mutating server order', async () => {
    const api = TestBed.inject(Products);
    const data = [
      { id: 1, name: 'Z', slug: 'z', price: 15, currency: 'USD', image: '', category: 'classic', categoryName: 'Classic' },
      { id: 2, name: 'A', slug: 'a', price: 10, currency: 'USD', image: '', category: 'zero-sugar', categoryName: 'Zero Sugar' },
      { id: 3, name: 'M', slug: 'm', price: 12, currency: 'USD', image: '', category: 'boost-blends', categoryName: 'Boost Blends' },
    ];
    vi.mocked(api.getActiveProducts).mockResolvedValueOnce(data);
    component.selectCategory('boost-blends');
    await component.loadProducts();
    expect(component.displayedProducts.map((item) => item.id)).toEqual([3]);
    component.selectCategory('classic');
    expect(component.displayedProducts.map((item) => item.id)).toEqual([1]);
    component.selectCategory('zero-sugar');
    expect(component.displayedProducts.map((item) => item.id)).toEqual([2]);
    component.selectCategory('all');
    for (const [sort, ids] of [
      ['priceLowToHigh', [2, 3, 1]], ['priceHighToLow', [1, 3, 2]],
      ['nameAToZ', [2, 3, 1]], ['nameZToA', [1, 3, 2]], ['default', [1, 2, 3]],
    ] as const) {
      component.chooseSort(sort);
      expect(component.displayedProducts.map((item) => item.id)).toEqual([...ids]);
    }
    expect(component.products().map((item) => item.id)).toEqual([1, 2, 3]);
    vi.mocked(api.getActiveProducts).mockRejectedValueOnce(new Error('Unable to load products'));
    await component.loadProducts();
    expect(component.error()).toContain('Unable to load products');
    expect(component.loading()).toBe(false);
  });
});
