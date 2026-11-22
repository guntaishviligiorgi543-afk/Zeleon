import { afterNextRender, Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Cart as CartStore } from '../../services/cart';
import { CheckoutCatalog, CheckoutProductFacts, checkoutUnitPrice } from '../../services/checkout-catalog';

@Component({
  selector: 'app-cart', imports: [CurrencyPipe, RouterLink],
  templateUrl: './cart.html', styleUrls: ['../checkout/checkout.css', './cart.css'],
})
export class Cart {
  readonly cart = inject(CartStore);
  private readonly catalog = inject(CheckoutCatalog);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly browserReady = signal(false);
  private readonly facts = signal<ReadonlyMap<string, CheckoutProductFacts>>(new Map());
  private readonly now = signal(Date.now());
  private request?: AbortController;
  private touchStart?: { x: number; y: number };
  private readonly page = signal(0);
  readonly perPage = signal(2);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly message = signal('');
  readonly lines = computed(() => this.cart.items().map(line => {
    const facts = this.facts().get(String(line.product.id));
    const original = facts?.price ?? line.product.price;
    const price = facts ? checkoutUnitPrice(facts, this.now()) : original;
    const stock = facts?.stock ?? 0;
    return { ...line, original, price, stock, currency: facts?.currency ?? line.product.currency,
      checked: !!facts, available: !!facts?.active,
      discount: original > price && original > 0 ? Math.round((1 - price / original) * 100) : 0,
      stockProblem: !!facts && (!facts.active || (stock !== null && line.quantity > stock)),
    };
  }));
  readonly itemCount = computed(() => this.cart.items().reduce((sum, line) => sum + line.quantity, 0));
  readonly totals = computed(() => {
    const groups = new Map<string, { currency: string; subtotal: number; discount: number; total: number }>();
    for (const line of this.lines()) {
      const group = groups.get(line.currency) ?? { currency: line.currency, subtotal: 0, discount: 0, total: 0 };
      const original = Math.round(line.original * 100) * line.quantity;
      const total = Math.round(line.price * 100) * line.quantity;
      group.subtotal += original;
      group.discount += original - total;
      group.total += total;
      groups.set(line.currency, group);
    }
    return [...groups.values()].map(group => ({ ...group, subtotal: group.subtotal / 100, discount: group.discount / 100, total: group.total / 100 }));
  });
  readonly blocked = computed(() => this.loading() || !!this.error() || !this.lines().length ||
    this.lines().some(line => !line.checked || line.stockProblem || line.currency !== 'USD' || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99));

  readonly pages = computed(() => Math.ceil(this.lines().length / this.perPage()));
  readonly index = computed(() => Math.min(this.page(), Math.max(0, this.pages() - 1)));
  readonly first = computed(() => this.index() * this.perPage());
  readonly last = computed(() => Math.min(this.first() + this.perPage(), this.lines().length));

  constructor() {
    const ids = computed(() => JSON.stringify(this.cart.items().map(line => line.product.id)));
    effect(() => { if (this.browserReady()) void this.refresh(JSON.parse(ids())); });
    afterNextRender(() => {
      const media = typeof matchMedia === 'function' ? matchMedia('(max-width: 760px)') : { matches: false, addEventListener() {}, removeEventListener() {} };
      const resize = () => { this.perPage.set(media.matches ? 1 : 2); this.page.set(0); };
      resize();
      media.addEventListener('change', resize);
      this.browserReady.set(true);
      const clock = setInterval(() => this.now.set(Date.now()), 1000);
      const refresh = setInterval(() => { if (!this.loading()) void this.refresh(); }, 60_000);
      this.destroyRef.onDestroy(() => {
        media.removeEventListener('change', resize); clearInterval(clock); clearInterval(refresh);
      });
    });
    this.destroyRef.onDestroy(() => this.request?.abort());
  }
  move(delta: number): void {
    this.page.set(Math.max(0, Math.min(this.pages() - 1, this.index() + delta)));
  }
  visible(i: number): boolean { return i >= this.first() && i < this.last(); }
  canIncrease(line: ReturnType<Cart['lines']>[number]): boolean {
    return !this.loading() && !this.error() && line.checked && line.available && line.quantity < 99 &&
      (line.stock === null || line.quantity < line.stock);
  }
  changeQuantity(id: string | number, delta: -1 | 1): void {
    const line = this.lines().find(line => line.product.id === id);
    if (line && (delta === -1 || this.canIncrease(line))) this.cart.changeQuantity(id, delta);
  }
  remove(id: string | number): void {
    const line = this.lines().find(line => line.product.id === id);
    this.cart.remove(id);
    this.page.set(this.index());
    this.message.set(`${line?.product.name ?? 'Product'} removed from your cart.`);
  }
  clear(): void {
    if (!confirm('Remove all products from your cart?')) return;
    this.cart.clear(); this.page.set(0); this.message.set('Your cart has been cleared.');
  }
  async checkout(): Promise<void> {
    if (this.loading()) return;
    await this.refresh();
    if (this.blocked()) return;
    this.loading.set(true);
    try {
      await this.catalog.quote(this.cart.items().map(line => ({ productId: line.product.id, quantity: line.quantity })));
      await this.router.navigate(['/checkout']);
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'Cart validation failed.'); }
    finally { this.loading.set(false); }
  }
  async refresh(ids: readonly (string | number)[] = this.cart.items().map(line => line.product.id)): Promise<void> {
    this.request?.abort();
    const request = this.request = new AbortController();
    this.loading.set(true);
    this.error.set('');
    try {
      const facts = await this.catalog.load(ids, request.signal);
      if (!request.signal.aborted) { this.facts.set(new Map(facts)); this.cart.refreshAvailability(facts); this.now.set(Date.now()); }
    } catch (error) {
      if (!request.signal.aborted) this.error.set(error instanceof Error ? error.message : 'Prices could not be checked. Please try again.');
    } finally {
      if (!request.signal.aborted) this.loading.set(false);
    }
  }

  startSwipe(event: TouchEvent): void {
    const touch = event.touches[0];
    this.touchStart = touch ? { x: touch.clientX, y: touch.clientY } : undefined;
  }
  endSwipe(event: TouchEvent): void {
    const touch = event.changedTouches[0];
    const start = this.touchStart;
    this.touchStart = undefined;
    if (!touch || !start) return;
    const dx = touch.clientX - start.x;
    if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(touch.clientY - start.y) * 1.3) this.move(dx < 0 ? 1 : -1);
  }
}
