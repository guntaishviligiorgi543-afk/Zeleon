import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  ManagerDashboard,
  ManagerProduct,
  ProductEditorValue,
  ProductReferences,
} from '../../../services/manager-dashboard';

@Component({
  selector: 'app-manager-products',
  imports: [CurrencyPipe, ReactiveFormsModule],
  templateUrl: './manager-products.html',
  styleUrls: ['../manager-page.css', './manager-products.css'],
})
export class ManagerProducts implements OnInit, OnDestroy {
  private readonly dashboard = inject(ManagerDashboard);
  readonly products = signal<ManagerProduct[]>([]);
  readonly references = signal<ProductReferences>({ categories: [] });
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly editorOpen = signal(false);
  readonly editing = signal<ManagerProduct | null>(null);
  readonly query = signal('');
  readonly imagePreview = signal('');
  private imageFile?: File;
  readonly stockReason = new FormControl('Catalog correction', { nonNullable: true, validators: [Validators.required, Validators.maxLength(200)] });
  ngOnDestroy(): void { this.clearImage(); }
  private clearImage(): void {
    if (this.imagePreview().startsWith('blob:')) URL.revokeObjectURL(this.imagePreview());
    this.imagePreview.set(''); this.imageFile = undefined;
  }
  selectImage(event: Event): void {
    this.clearImage();
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size <= 0 || file.size > 10 * 1024 * 1024) { this.error.set('Choose PNG, JPEG or WebP up to 10 MB.'); return; }
    this.imageFile = file; this.imagePreview.set(URL.createObjectURL(file));
  }
  readonly pageSize = signal(10);
  readonly currentPage = signal(1);
  readonly filteredProducts = computed(() => {
    const term = this.query().trim().toLowerCase();
    return term
      ? this.products().filter((product) =>
          `${product.name} ${product.slug} ${product.category?.name ?? ''}`
            .toLowerCase()
            .includes(term),
        )
      : this.products();
  });
  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredProducts().length / this.pageSize())),
  );
  readonly paginatedProducts = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const start = (page - 1) * this.pageSize();
    return this.filteredProducts().slice(start, start + this.pageSize());
  });
  readonly pageNumbers = computed(() => {
    const total = this.totalPages();
    const current = Math.min(this.currentPage(), total);
    const visiblePageCount = Math.min(5, total);
    const start = Math.max(1, Math.min(current - 2, total - visiblePageCount + 1));
    return Array.from({ length: visiblePageCount }, (_, index) => start + index);
  });
  readonly rangeStart = computed(() =>
    this.filteredProducts().length
      ? (Math.min(this.currentPage(), this.totalPages()) - 1) * this.pageSize() + 1
      : 0,
  );
  readonly rangeEnd = computed(() =>
    Math.min(this.rangeStart() + this.pageSize() - 1, this.filteredProducts().length),
  );

  readonly form = new FormGroup({
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(10000)] }),
    flavor_id: new FormControl<number | null>(null),
    product_type_id: new FormControl<number | null>(null),
    is_active: new FormControl(false, { nonNullable: true }),
    quantity: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0), Validators.max(2147483647), Validators.pattern(/^\d+$/)] }),
    threshold: new FormControl(10, { nonNullable: true, validators: [Validators.required, Validators.min(0), Validators.max(2147483647), Validators.pattern(/^\d+$/)] }),
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    slug: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        Validators.maxLength(200),
      ],
    }),
    price: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0),
      Validators.max(99_999_999),
    ]),
    category_id: new FormControl<number | null>(null, Validators.required),
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [products, references] = await Promise.all([
        this.dashboard.getProducts(),
        this.dashboard.getProductReferences(),
      ]);
      this.products.set(products);
      this.references.set(references);
      this.goToPage(this.currentPage());
    } catch {
      this.error.set('Products could not be loaded. Verify the Manager session and try again.');
    } finally {
      this.loading.set(false);
    }
  }

  setQuery(value: string): void {
    this.query.set(value);
    this.currentPage.set(1);
  }

  setPageSize(value: string): void {
    const nextPageSize = Number(value);
    if (![5, 10, 20].includes(nextPageSize)) return;
    this.pageSize.set(nextPageSize);
    this.currentPage.set(1);
  }

  goToPage(page: number): void {
    this.currentPage.set(Math.max(1, Math.min(page, this.totalPages())));
  }

  openCreate(): void {
    this.clearImage();
    this.editing.set(null);
    this.success.set('');
    this.error.set('');
    this.form.reset({
      description: '', flavor_id: null, product_type_id: null, is_active: false, quantity: 0, threshold: 10,
      name: '',
      slug: '',
      price: null,
      category_id: null,
    });
    this.editorOpen.set(true);
  }

  openEdit(product: ManagerProduct): void {
    this.clearImage();
    this.imagePreview.set(product.images[0]?.publicUrl ?? '');
    this.editing.set(product);
    this.success.set('');
    this.error.set('');
    this.form.reset({
      description: product.description ?? '', flavor_id: product.flavor_id, product_type_id: product.product_type_id, is_active: product.is_active, quantity: product.inventory?.quantity ?? 0, threshold: product.inventory?.low_stock_threshold ?? 10,
      name: product.name,
      slug: product.slug,
      price: Number(product.price),
      category_id: product.category_id,
    });
    this.editorOpen.set(true);
  }

  closeEditor(): void {
    if (!this.saving()) this.editorOpen.set(false);
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.success.set('');
    const raw = this.form.getRawValue();
    const existing = this.editing();
    const value: ProductEditorValue = {
      name: raw.name.trim(),
      slug: raw.slug.trim(),
      price: Number(raw.price),
      category_id: Number(raw.category_id),
      product_type_id: raw.product_type_id,
      flavor_id: raw.flavor_id,
      brand: existing?.brand ?? null,
      description: raw.description.trim() || null,
      currency: 'USD',
      is_active: raw.is_active,
    };
    let uploaded: string | undefined;
    let committed = false;
    try {
      if (raw.is_active && !this.imageFile && !existing?.images.length) throw new Error('An active product requires one image.');
      if (this.stockReason.invalid) throw new Error('Enter an inventory correction reason.');
      if (this.imageFile) uploaded = await this.dashboard.uploadImage(existing?.id ?? 0, this.imageFile);
      const id = await this.dashboard.saveProduct(value, existing?.id, { quantity: raw.quantity, threshold: raw.threshold, reason: this.stockReason.value, expected: existing?.inventory?.quantity ?? null }, uploaded);
      committed = true;
      this.editing.set({ ...existing, ...value, id, images: existing?.images ?? [] } as ManagerProduct);
      this.editorOpen.set(false);
      this.clearImage();
      this.imageFile = undefined;
      if (uploaded) for (const image of existing?.images ?? []) await this.dashboard.cleanupImage(image.storage_path);
      await this.load();
      this.editorOpen.set(false);
      this.success.set(existing ? 'Product changes saved.' : 'Product created.');
    } catch (error) {
      if (uploaded && !committed) { try { await this.dashboard.cleanupImage(uploaded); } catch { /* Safe manual cleanup if needed. */ } }
      this.error.set(committed ? 'Product saved. An unused image needs cleanup; reload before making more changes.' : error instanceof Error ? error.message : 'The product could not be saved. Reload and check values, slugs and stock.');
    } finally {
      this.saving.set(false);
    }
  }

  async remove(product: ManagerProduct): Promise<void> {
    if (!confirm(`Deactivate ${product.name}?`)) return;
    this.error.set('');
    this.success.set('');
    try {
      await this.dashboard.deleteProduct(product);
      await this.load();
      this.success.set('Product deactivated.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The product could not be deleted.');
    }
  }

  async removeImage(product: ManagerProduct, imageIndex: number): Promise<void> {
    const image = product.images[imageIndex];
    if (!image || !confirm('Remove this product image?')) return;
    try {
      await this.dashboard.removeImage(image);
      await this.load();
      const updated = this.products().find(p => p.id === product.id);
      if (updated) this.openEdit(updated);
      this.success.set('Product image removed and product deactivated.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The image could not be removed.');
    }
  }

}
