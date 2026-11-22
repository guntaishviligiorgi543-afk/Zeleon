import { afterNextRender, Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';
import { Cart } from '../../services/cart';
import { CheckoutCatalog, CheckoutProductFacts, checkoutUnitPrice } from '../../services/checkout-catalog';

const requiredText = (control: AbstractControl) => String(control.value ?? '').trim() ? null : { required: true };

@Component({
  imports: [CurrencyPipe, ReactiveFormsModule, RouterLink],
  selector: 'app-checkout',
  styleUrl: './checkout.css',
  templateUrl: './checkout.html',
})
export class Checkout {
  readonly cart = inject(Cart);
  private readonly auth = inject(Auth);
  private readonly catalog = inject(CheckoutCatalog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly browserReady = signal(false);
  private readonly facts = signal<ReadonlyMap<string, CheckoutProductFacts>>(new Map());
  private readonly now = signal(Date.now());
  private request?: AbortController;
  private touchStart?: { x: number; y: number };
  readonly loading = signal(true);
  readonly error = signal('');
  readonly message = signal('');
  readonly selectedId = signal<string | null>(null);
  readonly checkoutAvailable = false; // Learning project: real ordering and payments stay disabled.
  readonly form = this.fb.group({
    fullName: ['', [requiredText, Validators.maxLength(160)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    phone: ['', [Validators.pattern(/^\+?[0-9 ()\-.]{7,30}$/)]],
    address: ['', [requiredText, Validators.maxLength(300)]],
    city: ['', [requiredText, Validators.maxLength(100)]],
    postalCode: ['', [Validators.maxLength(20)]],
  });
  readonly fields = [
    { key: 'fullName', label: 'Full name', type: 'text', autocomplete: 'name', placeholder: 'Your full name', wide: true },
    { key: 'email', label: 'Email address', type: 'email', autocomplete: 'email', placeholder: 'you@example.com', wide: true },
    { key: 'phone', label: 'Phone number (optional)', type: 'tel', autocomplete: 'tel', placeholder: '+1 555 000 0000', wide: true },
    { key: 'address', label: 'Shipping address', type: 'text', autocomplete: 'street-address', placeholder: 'Street address, apartment, suite', wide: true },
    { key: 'city', label: 'City', type: 'text', autocomplete: 'address-level2', placeholder: 'City', wide: false },
    { key: 'postalCode', label: 'Postal code (optional)', type: 'text', autocomplete: 'postal-code', placeholder: 'Postal code', wide: false },
  ] as const;

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
  readonly index = computed(() => Math.max(0, this.lines().findIndex(line => String(line.product.id) === this.selectedId())));
  readonly current = computed(() => this.lines()[this.index()]);
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

  constructor() {
    const ids = computed(() => JSON.stringify(this.cart.items().map(line => line.product.id)));
    effect(() => {
      if (this.browserReady()) void this.refresh(JSON.parse(ids()));
    });
    effect(() => {
      const user = this.auth.user();
      if (!user) return;
      const values = { fullName: [user.firstName, user.lastName].filter(Boolean).join(' '), email: user.email ?? '', phone: user.phoneNumber ?? '' };
      for (const key of ['fullName', 'email', 'phone'] as const) {
        const control = this.form.controls[key];
        if (control.pristine && !control.value) control.setValue(values[key]);
      }
    });
    afterNextRender(() => {
      this.browserReady.set(true);
      const timer = setInterval(() => this.now.set(Date.now()), 1000);
      const refresh = setInterval(() => { if (!this.loading()) void this.refresh(); }, 60_000);
      this.destroyRef.onDestroy(() => { clearInterval(timer); clearInterval(refresh); });
    });
    this.destroyRef.onDestroy(() => this.request?.abort());
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

  select(index: number): void {
    const line = this.lines()[index];
    if (line) this.selectedId.set(String(line.product.id));
  }
  move(delta: number): void { this.select(this.index() + delta); }
  canIncrease(line: ReturnType<Checkout['lines']>[number]): boolean {
    return !this.loading() && !this.error() && line.checked && line.available && line.quantity < 99 && (line.stock === null || line.quantity < line.stock);
  }
  changeQuantity(delta: -1 | 1): void {
    const line = this.current();
    if (line && (delta === -1 || this.canIncrease(line))) this.cart.changeQuantity(line.product.id, delta);
  }
  removeCurrent(): void {
    const lines = this.lines();
    const index = this.index();
    const line = lines[index];
    if (!line) return;
    this.selectedId.set(String((lines[index + 1] ?? lines[index - 1])?.product.id ?? ''));
    this.cart.remove(line.product.id);
    this.message.set(`${line.product.name} removed from your cart.`);
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
  validationMessage(key: keyof Checkout['form']['controls']): string {
    const control = this.form.controls[key];
    if (!control.touched || !control.errors) return '';
    if (control.hasError('required')) return 'Please complete this field.';
    if (control.hasError('email')) return 'Enter a valid email address.';
    if (control.hasError('pattern')) return 'Enter a valid phone number (7–30 characters).';
    return 'This value is too long.';
  }
  submit(): void {
    // Portfolio demonstration: this entry point never creates an order or initiates payment.
    this.message.set('Online ordering and payments are not available yet. No order has been placed and no payment has been taken.');
  }
}
