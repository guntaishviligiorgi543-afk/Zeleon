import { TestBed } from '@angular/core/testing';
import { ManagerDashboard, ManagerProduct } from '../../../services/manager-dashboard';
import { ManagerProducts } from './manager-products';

describe('Product editor form', () => {
  const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  beforeAll(() => {
    // jsdom does not implement native modal presentation; keep the open state
    // faithful so form tests exercise the same component lifecycle as a browser.
    if (!originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) { this.open = true; },
    });
  });
  afterAll(() => {
    if (!originalShowModal) Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  });
  const references = {
    categories: [{ id: 1, name: 'Classic', slug: 'classic' }],
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
    expect(fixture.componentInstance.form.getRawValue()).toEqual(expect.objectContaining({name: 'Test energy drink', slug: 'test-energy-drink', price: 4.5}));
    (fixture.nativeElement.querySelector('.action-row button.primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.step()).toBe(1);
    const select = fixture.nativeElement.querySelector('#product-category') as HTMLSelectElement;
    select.selectedIndex = 1;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.form.valid).toBe(true);
    (fixture.nativeElement.querySelector('.action-row button.primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.action-row button.primary') as HTMLButtonElement).click();
    fixture.detectChanges();
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
          product_type_id: null,
          flavor_id: null,
          brand: null,
          description: null,
          currency: 'USD',
          is_active: false,
        },
        undefined,
        {quantity: 0, threshold: 10, reason: 'Catalog correction', expected: null},
        undefined,
      ),
    );
    await vi.waitFor(() => expect(fixture.componentInstance.saving()).toBe(false));
    expect(fixture.componentInstance.editorOpen()).toBe(false);
  });

  it('validates each step, preserves values going back and resets a new form', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    component.openCreate();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#product-category')).toBeNull();
    component.submitEditor();
    expect(component.step()).toBe(0);
    expect(component.form.controls.name.touched).toBe(true);
    component.form.patchValue({ name: 'Drink', slug: 'drink', price: 5 });
    component.submitEditor();
    expect(component.step()).toBe(1);
    component.submitEditor();
    expect(component.step()).toBe(1);
    component.form.controls.category_id.setValue(1);
    component.submitEditor();
    expect(component.step()).toBe(2);
    component.form.controls.quantity.setValue(-1);
    component.submitEditor();
    expect(component.step()).toBe(2);
    component.form.controls.quantity.setValue(12);
    component.stockReason.setValue('');
    component.submitEditor();
    expect(component.step()).toBe(2);
    component.stockReason.setValue('Initial stock');
    component.submitEditor();
    fixture.detectChanges();
    expect(component.step()).toBe(3);
    expect(fixture.nativeElement.querySelector('input[type="file"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('input[type="checkbox"]')).toBeTruthy();
    expect(dashboard.saveProduct).not.toHaveBeenCalled();
    component.changeStep(0);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#product-name').value).toBe('Drink');
    expect(component.form.controls.quantity.value).toBe(12);
    component.closeEditor();
    component.openCreate();
    expect(component.step()).toBe(0);
    expect(component.form.controls.name.value).toBe('');
    expect(component.stockReason.value).toBe('Catalog correction');
  });

  it('opens the native image picker from the Choose a file button', async () => {
    const fixture = await create();
    fixture.componentInstance.openCreate();
    fixture.componentInstance.changeStep(3);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('#product-image') as HTMLInputElement;
    const showPicker = vi.fn();
    Object.defineProperty(input, 'showPicker', { configurable: true, value: showPicker });
    (fixture.nativeElement.querySelector('.image-picker-button') as HTMLButtonElement).click();
    expect(showPicker).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.editorOpen()).toBe(true);
    expect(dashboard.saveProduct).not.toHaveBeenCalled();
    const fallback = vi.spyOn(input, 'click').mockImplementation(() => {});
    showPicker.mockImplementation(() => { throw new Error('Unsupported picker'); });
    (fixture.nativeElement.querySelector('.image-picker-button') as HTMLButtonElement).click();
    expect(fallback).toHaveBeenCalledOnce();
  });

  it('previews a selected image and preserves it after cancel or an invalid replacement', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:product-preview');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    component.openCreate();
    component.changeStep(3);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('#product-image') as HTMLInputElement;
    const select = (files: File[]) => {
      Object.defineProperty(input, 'files', { configurable: true, value: files });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      fixture.detectChanges();
    };
    try {
      select([new File(['image'], 'drink.png', { type: 'image/png' })]);
      expect(createUrl).toHaveBeenCalledOnce();
      expect(fixture.nativeElement.querySelector('.image-preview').getAttribute('src')).toBe('blob:product-preview');
      expect(component.imageName()).toBe('drink.png');
      select([]);
      expect(component.imagePreview()).toBe('blob:product-preview');
      select([new File(['invalid'], 'drink.txt', { type: 'text/plain' })]);
      expect(component.error()).toContain('Choose PNG, JPEG or WebP');
      expect(component.imagePreview()).toBe('blob:product-preview');
      expect(revokeUrl).not.toHaveBeenCalled();
      expect(dashboard.saveProduct).not.toHaveBeenCalled();
      fixture.destroy();
      expect(revokeUrl).toHaveBeenCalledWith('blob:product-preview');
    } finally {
      createUrl.mockRestore();
      revokeUrl.mockRestore();
    }
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
      is_active: false,
      images: [],
      updated_at: '2026-11-12T00:00:00Z',
      category: references.categories[0],
      product_type: null,
      flavor: null,
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
        {quantity: 0, threshold: 10, reason: 'Catalog correction', expected: null},
        undefined,
      ),
    );
    await vi.waitFor(() => expect(fixture.componentInstance.saving()).toBe(false));
  });
});
