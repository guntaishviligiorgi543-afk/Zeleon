import { TestBed } from '@angular/core/testing';
import { ManagerDashboard, ManagerProduct } from '../../../services/manager-dashboard';
import { ManagerProducts } from './manager-products';

describe('Product editor form', () => {
  const references = {
    categories: [{ id: 1, name: 'Classic', slug: 'classic' }],
    types: [{ id: 2, name: 'Energy drink', slug: 'energy-drink' }],
    flavors: [{ id: 3, name: 'Lemon', slug: 'lemon' }],
  };
  let dashboard: {
    getProducts: ReturnType<typeof vi.fn>;
    getProductReferences: ReturnType<typeof vi.fn>;
    saveProduct: ReturnType<typeof vi.fn>;
  };
  beforeEach(() => {
    dashboard = {
      getProducts: vi.fn().mockResolvedValue([]),
      getProductReferences: vi.fn().mockResolvedValue(references),
      saveProduct: vi.fn().mockResolvedValue(42),
    };
    TestBed.configureTestingModule({
      imports: [ManagerProducts],
      providers: [{ provide: ManagerDashboard, useValue: dashboard }],
    });
  });

  async function create() {
    const fixture = TestBed.createComponent(ManagerProducts);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
    fixture.detectChanges();
    return fixture;
  }

  it('opens Add product, accepts input and submits the entered values', async () => {
    const fixture = await create();
    const add = [...fixture.nativeElement.querySelectorAll('button')].find((button: any) =>
      button.textContent.includes('Add product'),
    ) as HTMLButtonElement;
    add.click();
    fixture.detectChanges();
    const type = (id: string, value: string) => {
      const input = fixture.nativeElement.querySelector(`#${id}`) as HTMLInputElement;
      expect(input.disabled).toBe(false);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    type('product-name', 'Test energy drink');
    type('product-slug', 'test-energy-drink');
    type('product-price', '4.50');
    type('product-brand', 'ZELEON');
    type('product-description', 'Product editor regression test');
    for (const id of ['product-category', 'product-type', 'product-flavor']) {
      const select = fixture.nativeElement.querySelector(`#${id}`) as HTMLSelectElement;
      select.selectedIndex = 1;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const active = fixture.nativeElement.querySelector(
      '[formControlName="is_active"]',
    ) as HTMLInputElement;
    active.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.form.valid).toBe(true);
    const submit = fixture.nativeElement.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    fixture.nativeElement
      .querySelector('.editor form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(dashboard.saveProduct).toHaveBeenCalledWith(
        {
          name: 'Test energy drink',
          slug: 'test-energy-drink',
          price: 4.5,
          category_id: 1,
          product_type_id: 2,
          flavor_id: 3,
          brand: 'ZELEON',
          description: 'Product editor regression test',
          currency: 'USD',
          is_active: false,
        },
        undefined,
      ),
    );
    await vi.waitFor(() => expect(fixture.componentInstance.saving()).toBe(false));
    expect(fixture.componentInstance.editorOpen()).toBe(false);
  });

  it('opens Edit product with existing values and saves changes to that product', async () => {
    const fixture = await create();
    const product: ManagerProduct = {
      id: 42,
      name: 'Original drink',
      slug: 'original-drink',
      price: 3,
      category_id: 1,
      product_type_id: 2,
      flavor_id: 3,
      brand: 'ZELEON',
      description: 'Original description',
      currency: 'USD',
      is_active: true,
      images: [],
      updated_at: '2026-11-12T00:00:00Z',
      category: references.categories[0],
      product_type: references.types[0],
      flavor: references.flavors[0],
    };
    fixture.componentInstance.openEdit(product);
    fixture.detectChanges();
    const name = fixture.nativeElement.querySelector('#product-name') as HTMLInputElement;
    expect(name.value).toBe('Original drink');
    name.value = 'Updated drink';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.nativeElement
      .querySelector('.editor form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(dashboard.saveProduct).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Updated drink' }),
        42,
      ),
    );
    await vi.waitFor(() => expect(fixture.componentInstance.saving()).toBe(false));
  });
});
