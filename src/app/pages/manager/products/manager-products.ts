import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
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
export class ManagerProducts implements OnInit {
  private readonly dashboard = inject(ManagerDashboard);
  readonly products = signal<ManagerProduct[]>([]);
  readonly references = signal<ProductReferences>({ categories: [], types: [], flavors: [] });
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly editorOpen = signal(false);
  readonly editing = signal<ManagerProduct | null>(null);
  readonly query = signal('');
  readonly selectedImage = signal<File | null>(null);
  readonly newType = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(80)],
  });
  readonly newFlavor = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(80)],
  });
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

  readonly form = new FormGroup({
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
    product_type_id: new FormControl<number | null>(null),
    flavor_id: new FormControl<number | null>(null),
    brand: new FormControl('', { nonNullable: true, validators: Validators.maxLength(120) }),
    description: new FormControl('', { nonNullable: true, validators: Validators.maxLength(5000) }),
    is_active: new FormControl(true, { nonNullable: true }),
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
    } catch {
      this.error.set('Products could not be loaded. Verify the Manager session and try again.');
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.editing.set(null);
    this.selectedImage.set(null);
    this.success.set('');
    this.error.set('');
    this.form.reset({
      name: '',
      slug: '',
      price: null,
      category_id: null,
      product_type_id: null,
      flavor_id: null,
      brand: '',
      description: '',
      is_active: true,
    });
    this.editorOpen.set(true);
  }

  openEdit(product: ManagerProduct): void {
    this.editing.set(product);
    this.selectedImage.set(null);
    this.success.set('');
    this.error.set('');
    this.form.reset({
      name: product.name,
      slug: product.slug,
      price: Number(product.price),
      category_id: product.category_id,
      product_type_id: product.product_type_id,
      flavor_id: product.flavor_id,
      brand: product.brand ?? '',
      description: product.description ?? '',
      is_active: product.is_active,
    });
    this.editorOpen.set(true);
  }

  closeEditor(): void {
    if (!this.saving()) this.editorOpen.set(false);
  }

  onImageSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.error.set('');
    if (!file) {
      this.selectedImage.set(null);
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.selectedImage.set(null);
      this.error.set('Use a JPEG, PNG, or WebP product image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.selectedImage.set(null);
      this.error.set('Product images must be 10 MB or smaller.');
      return;
    }
    this.selectedImage.set(file);
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.success.set('');
    const raw = this.form.getRawValue();
    const value: ProductEditorValue = {
      name: raw.name.trim(),
      slug: raw.slug.trim(),
      price: Number(raw.price),
      category_id: Number(raw.category_id),
      product_type_id: raw.product_type_id ? Number(raw.product_type_id) : null,
      flavor_id: raw.flavor_id ? Number(raw.flavor_id) : null,
      brand: raw.brand.trim() || null,
      description: raw.description.trim() || null,
      currency: 'USD',
      is_active: raw.is_active,
    };
    try {
      const productId = await this.dashboard.saveProduct(value, this.editing()?.id);
      if (this.selectedImage()) await this.dashboard.uploadImage(productId, this.selectedImage()!);
      await this.load();
      this.editorOpen.set(false);
      this.success.set(this.editing() ? 'Product changes saved.' : 'Product created.');
    } catch {
      this.error.set(
        'The product could not be saved. Check for duplicate names or slugs and try again.',
      );
    } finally {
      this.saving.set(false);
    }
  }

  async remove(product: ManagerProduct): Promise<void> {
    if (!confirm(`Delete “${product.name}”? This cannot be undone.`)) return;
    this.error.set('');
    this.success.set('');
    try {
      await this.dashboard.deleteProduct(product);
      await this.load();
      this.success.set('Product deleted.');
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
      this.success.set('Product image removed.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The image could not be removed.');
    }
  }

  async addReference(kind: 'type' | 'flavor'): Promise<void> {
    const control = kind === 'type' ? this.newType : this.newFlavor;
    control.markAsTouched();
    if (control.invalid) return;
    try {
      const option = await this.dashboard.createReference(
        kind === 'type' ? 'product_types' : 'product_flavors',
        control.value,
      );
      this.references.update((refs) =>
        kind === 'type'
          ? { ...refs, types: [...refs.types, option] }
          : { ...refs, flavors: [...refs.flavors, option] },
      );
      this.form.get(kind === 'type' ? 'product_type_id' : 'flavor_id')?.setValue(option.id);
      control.reset();
      this.success.set(`${kind === 'type' ? 'Product type' : 'Flavor'} created.`);
    } catch {
      this.error.set(`The ${kind} could not be created. It may already exist.`);
    }
  }
}
