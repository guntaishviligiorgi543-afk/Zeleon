import { afterNextRender, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Products } from '../../services/products';
import { Product } from '../../models/product';
import { Cart } from '../../services/cart';

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

  validQuantity(): boolean {
    return Number.isInteger(this.quantity()) && this.quantity() >= 1 && this.quantity() <= 99;
  }

  changeQuantity(event: Event): void {
    this.quantity.set((event.target as HTMLInputElement).valueAsNumber);
  }

  addToCart(): void {
    const product = this.product();
    if (!product || this.cartBusy() || (!this.inCart() && !this.validQuantity())) return;
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

  constructor() {
    afterNextRender(() => {
      this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
        void this.loadProduct(params.get('id') ?? '');
      });
    });
    this.destroyRef.onDestroy(() => {
      this.request?.abort();
      clearTimeout(this.cartFeedbackTimer);
    });
  }

  retry(): void { void this.loadProduct(this.route.snapshot.paramMap.get('id') ?? ''); }

  async loadProduct(id: string): Promise<void> {
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
      if (!request.signal.aborted) this.product.set(product);
    } catch (error) {
      if (!request.signal.aborted) this.error.set(error instanceof Error ? error.message : 'This product could not be loaded.');
    } finally {
      if (!request.signal.aborted) this.loading.set(false);
    }
  }
}
