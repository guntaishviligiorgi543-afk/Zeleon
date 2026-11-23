import { afterNextRender, Component, computed, DestroyRef, inject, NgZone, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Products } from '../../services/products';
import { Product } from '../../models/product';
import { Cart } from '../../services/cart';
import { Seo } from '../../services/seo';
import { Analytics } from '../../services/analytics';

@Component({
  imports: [RouterLink, CurrencyPipe],
  selector: 'app-product-details',
  styleUrl: './product-details.css',
  templateUrl: './product-details.html',
})
export class ProductDetails {
  readonly product = signal<Product | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly quantity = signal(1);
  private readonly cart = inject(Cart);
  readonly cartBusy = signal(false);
  readonly inCart = computed(() => {
    const product = this.product();
    return !!product && this.cart.items().some((line) => line.product.id === product.id);
  });
  readonly totalPrice = computed(() => (this.product()?.price ?? 0) * (this.validQuantity() ? this.quantity() : 0));
  private cartFeedbackTimer?: ReturnType<typeof setTimeout>;
  private readonly router = inject(Router);
  private readonly seo = inject(Seo);
  private readonly analytics = inject(Analytics);

  validQuantity(): boolean {
    return Number.isInteger(this.quantity()) && this.quantity() >= 1 && this.quantity() <= Math.min(99, this.product()?.stock ?? 0);
  }

  changeQuantity(event: Event): void {
    this.quantity.set((event.target as HTMLInputElement).valueAsNumber);
  }

  addToCart(): void {
    const product = this.product();
    if (!product || (product.stock ?? 0) === 0 || this.cartBusy() || (!this.inCart() && !this.validQuantity())) return;
    if (!this.cart.requestAccess()) return;
    this.cartBusy.set(true);
    if (this.inCart()) {
      this.cart.remove(product.id);
    } else {
      this.cart.add(product, this.quantity());
    }
    this.cartFeedbackTimer = setTimeout(() => {
      this.cartBusy.set(false);
      this.cartFeedbackTimer = undefined;
    }, 650);
  }

  buyNow(): void {
    const product = this.product();
    if (product && this.validQuantity() && this.cart.add(product, this.quantity())) void this.router.navigate(['/checkout']);
  }
  private readonly route = inject(ActivatedRoute);
  private readonly catalog = inject(Products);
  private readonly destroyRef = inject(DestroyRef);
  private request?: AbortController;
  private readonly zone = inject(NgZone);

  constructor() {
    afterNextRender(() => {
      const timer = this.zone.runOutsideAngular(() => setInterval(() => { if (!document.hidden && !this.loading()) void this.refreshOffer(); }, 30000));
      this.destroyRef.onDestroy(() => clearInterval(timer));
      this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
        void this.loadProduct(params.get('id') ?? '');
      });
    });
    this.destroyRef.onDestroy(() => {
      this.request?.abort();
      clearTimeout(this.cartFeedbackTimer);
    });
  }

  private async refreshOffer(): Promise<void> {
    const product = this.product();
    if (!product) return;
    try {
      const updated = await this.catalog.getProduct(product.id);
      if (this.product()?.id === product.id) { this.product.set(updated); this.seo.productLoaded(updated); }
    } catch {
      if (this.product()?.id === product.id) this.product.set({ ...product, stock: 0, onSale: false });
    }
  }

  retry(): void { void this.loadProduct(this.route.snapshot.paramMap.get('id') ?? ''); }

  async loadProduct(id: string): Promise<void> {
    this.seo.productLoaded(null);
    clearTimeout(this.cartFeedbackTimer);
    this.cartBusy.set(false);
    this.request?.abort();
    const request = this.request = new AbortController();
    this.loading.set(true);
    this.error.set('');
    this.product.set(null);
    this.quantity.set(1);
    try {
      const product = await this.catalog.getProduct(id, request.signal);
      if (!request.signal.aborted) {
        this.product.set(product);
        this.seo.productLoaded(product);
        this.analytics.productEvent('view_item', product);
      }
    } catch (error) {
      if (!request.signal.aborted) this.error.set(error instanceof Error ? error.message : 'This product could not be loaded.');
    } finally {
      if (!request.signal.aborted) this.loading.set(false);
    }
  }
}
