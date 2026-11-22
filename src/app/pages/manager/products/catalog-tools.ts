import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CatalogDiscount,
  discountStatus,
  InventoryMovement,
  ManagerDashboard,
  ManagerProduct,
  ProductOption,
} from '../../../services/manager-dashboard';

@Component({
  selector: 'app-catalog-tools',
  imports: [FormsModule, CurrencyPipe, DatePipe],
  styleUrls: ['../manager-page.css', './catalog-tools.css'],
  templateUrl: './catalog-tools.html',
})
export class CatalogTools implements OnInit {
  private readonly service = inject(ManagerDashboard);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly products = signal<ManagerProduct[]>([]);
  readonly options = signal<ProductOption[]>([]);
  readonly discounts = signal<CatalogDiscount[]>([]);
  readonly movements = signal<InventoryMovement[]>([]);
  readonly tabs = ['Categories', 'Flavors', 'Product types', 'Inventory', 'Discounts'];
  readonly filters = [
    'All discounts',
    'Product discounts',
    'Category discounts',
    'Scheduled',
    'Active',
    'History',
  ];
  readonly now = signal(Date.now());
  tab = 'Categories';
  filter = 'All discounts';
  reference = { id: undefined as number | undefined, name: '', slug: '' };
  inventory = { productId: 0, quantity: 0, threshold: 10, reason: '' };
  sale = this.emptySale();
  ngOnInit(): void {
    void this.load();
  }
  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
  private emptySale() {
    return {
      id: undefined as number | undefined,
      kind: 'product' as 'product' | 'category',
      target: 0,
      amount: 0,
      starts: '',
      ends: '',
    };
  }
  table(): 'categories' | 'product_flavors' | 'product_types' {
    return this.tab === 'Categories'
      ? 'categories'
      : this.tab === 'Flavors'
        ? 'product_flavors'
        : 'product_types';
  }
  async selectTab(tab: string): Promise<void> {
    this.tab = tab;
    this.reference = { id: undefined, name: '', slug: '' };
    await this.load();
  }
  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [products, refs, discounts] = await Promise.all([
        this.service.getProducts(),
        this.service.getProductReferences(),
        this.service.getDiscounts(),
      ]);
      this.products.set(products);
      this.discounts.set(discounts);
      this.options.set(
        this.tab === 'Categories' || this.tab === 'Discounts'
          ? refs.categories
          : this.tab === 'Flavors'
            ? (refs.flavors ?? [])
            : (refs.types ?? []),
      );
    } catch {
      this.error.set('Catalog tools could not be loaded. Verify your staff session and retry.');
    } finally {
      this.loading.set(false);
    }
  }
  async run(action: () => Promise<void>, message: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    try {
      await action();
      await this.load();
      this.success.set(message);
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : 'Action rejected. Reload and verify your staff session.',
      );
    } finally {
      this.busy.set(false);
    }
  }
  saveReference(): void {
    void this.run(async () => {
      await this.service.saveReference(
        this.table(),
        this.reference.name,
        this.reference.slug,
        this.reference.id,
      );
      this.reference = { id: undefined, name: '', slug: '' };
    }, 'Saved.');
  }
  editReference(option: ProductOption): void {
    this.reference = { ...option };
  }
  deleteReference(option: ProductOption): void {
    if (confirm(`Delete unused ${option.name}?`))
      void this.run(() => this.service.deleteReference(this.table(), option.id), 'Deleted.');
  }
  async selectInventory(): Promise<void> {
    const product = this.products().find((p) => p.id === +this.inventory.productId);
    this.inventory.quantity = product?.inventory?.quantity ?? 0;
    this.inventory.threshold = product?.inventory?.low_stock_threshold ?? 10;
    this.movements.set([]);
    if (product) {
      try {
        this.movements.set(await this.service.inventoryHistory(product.id));
      } catch {
        this.error.set('Inventory history could not be loaded.');
      }
    }
  }
  saveInventory(): void {
    const product = this.products().find((p) => p.id === +this.inventory.productId);
    if (
      !product ||
      !Number.isInteger(this.inventory.quantity) ||
      this.inventory.quantity < 0 ||
      !Number.isInteger(this.inventory.threshold) ||
      this.inventory.threshold < 0 ||
      !this.inventory.reason.trim()
    ) {
      this.error.set('Select a product, enter non-negative whole numbers and a reason.');
      return;
    }
    void this.run(async () => {
      await this.service.adjustInventory(
        product.id,
        this.inventory.quantity,
        this.inventory.threshold,
        this.inventory.reason,
        product.inventory?.quantity ?? null,
      );
      this.movements.set(await this.service.inventoryHistory(product.id));
    }, 'Inventory updated.');
  }
  status(sale: CatalogDiscount): string {
    return discountStatus(sale, this.now());
  }
  shownDiscounts(): CatalogDiscount[] {
    return this.discounts().filter(
      (s) =>
        this.filter === 'All discounts' ||
        (this.filter === 'Product discounts' && s.kind === 'product') ||
        (this.filter === 'Category discounts' && s.kind === 'category') ||
        (this.filter === 'Scheduled' && this.status(s) === 'scheduled') ||
        (this.filter === 'Active' && this.status(s) === 'active') ||
        (this.filter === 'History' &&
          ['expired', 'sold_out', 'cancelled'].includes(this.status(s))),
    );
  }
  saleName(s: CatalogDiscount): string {
    return s.kind === 'product'
      ? (this.products().find((p) => p.id === s.product_id)?.name ?? `Product ${s.product_id}`)
      : (this.options().find((c) => c.id === s.category_id)?.name ?? `Category ${s.category_id}`);
  }
  editSale(s: CatalogDiscount): void {
    const local = (date: string) => {
      const d = new Date(date);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    };
    this.sale = {
      id: s.id,
      kind: s.kind,
      target: s.product_id ?? s.category_id ?? 0,
      amount: Number(s.sale_price ?? s.discount_percent),
      starts: local(s.starts_at),
      ends: local(s.ends_at),
    };
  }
  resetSale(): void {
    this.sale = this.emptySale();
  }
  saveSale(): void {
    const start = Date.parse(this.sale.starts),
      end = Date.parse(this.sale.ends);
    const product = this.products().find((p) => p.id === +this.sale.target);
    if (
      !this.sale.target ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start ||
      end <= Date.now() ||
      !Number.isFinite(this.sale.amount) ||
      this.sale.amount < 0 ||
      (this.sale.kind === 'product' && (!product || this.sale.amount >= Number(product.price))) ||
      (this.sale.kind === 'category' && (this.sale.amount <= 0 || this.sale.amount >= 100))
    ) {
      this.error.set(
        'Check the target, required dates and discount amount. End must follow start; sale price must be below regular price.',
      );
      return;
    }
    const value = {
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(end).toISOString(),
      ...(this.sale.kind === 'product'
        ? { product_id: +this.sale.target, sale_price: this.sale.amount, is_active: true }
        : {
            category_id: +this.sale.target,
            discount_percent: this.sale.amount,
            status: 'scheduled',
          }),
    };
    void this.run(async () => {
      await this.service.saveDiscount(this.sale.kind, value, this.sale.id);
      this.resetSale();
    }, 'Discount saved.');
  }
  cancelSale(sale: CatalogDiscount): void {
    void this.run(() => this.service.cancelDiscount(sale), 'Discount cancelled.');
  }
}
