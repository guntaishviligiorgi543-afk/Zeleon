import { computed, effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subject } from 'rxjs';
import { Auth } from './auth';
import { Product } from '../models/product';
import { Analytics } from './analytics';

export interface CartLine { product: Product; quantity: number; }

@Injectable({ providedIn: 'root' })
export class Cart {
  private readonly auth = inject(Auth);
  private readonly analytics = inject(Analytics);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly authenticated = computed(() => this.auth.initialized() && this.auth.isAuthenticated() && !this.auth.recovering());
  private readonly owner = computed(() => this.authenticated() ? this.auth.user()?.id ?? null : null);
  private readonly state = signal<{ owner: string | null; lines: readonly CartLine[] }>({ owner: null, lines: [] });
  readonly items = computed(() => this.owner() && this.state().owner === this.owner() ? this.state().lines : []);
  readonly loginRequests = new Subject<void>();
  readonly accountChanges = new Subject<void>();

  constructor() {
    let previous = this.owner();
    effect(() => {
      const owner = this.owner();
      if (previous !== owner) {
        // A browser refresh creates a new service, so previous is null and
        // restores this signed-in user's cart. Switching/signing out clears it.
        if (previous) this.forget(previous);
        this.state.set({ owner, lines: owner ? this.restore(owner) : [] });
        previous = owner;
        this.accountChanges.next();
      }
    });
  }
  requestAccess(): boolean {
    if (this.authenticated() && this.owner()) return true;
    this.loginRequests.next();
    return false;
  }
  private storageKey(owner: string): string { return 'zeleon.cart.session.v1:' + owner; }

  private restore(owner: string): readonly CartLine[] {
    if (!this.browser) return [];
    try {
      const raw = sessionStorage.getItem(this.storageKey(owner));
      if (!raw) return [];
      const data: unknown = JSON.parse(raw);
      if (!Array.isArray(data)) return [];
      return data.slice(0, 60).filter((entry): entry is CartLine => {
        if (!entry || typeof entry !== 'object') return false;
        const item = entry as Partial<CartLine>;
        const p = item.product;
        return !!p && (typeof p.id === 'string' || typeof p.id === 'number') &&
          typeof p.price === 'number' && Number.isFinite(p.price) && p.price >= 0 &&
          typeof p.currency === 'string' &&
          typeof p.name === 'string' &&
          Number.isInteger(item.quantity) && (item.quantity ?? 0) >= 1 && (item.quantity ?? 0) <= 99;
      });
    } catch { return []; }
  }

  private persist(): void {
    const owner = this.owner();
    if (!this.browser || !owner) return;
    try {
      if (this.items().length) sessionStorage.setItem(this.storageKey(owner), JSON.stringify(this.items()));
      else sessionStorage.removeItem(this.storageKey(owner));
    } catch { /* Storage restrictions must not block shopping. */ }
  }

  private forget(owner: string): void {
    if (!this.browser) return;
    try { sessionStorage.removeItem(this.storageKey(owner)); }
    catch { /* No storage access. */ }
  }

  private update(change: (items: readonly CartLine[]) => readonly CartLine[]): void {
    this.state.set({ owner: this.owner(), lines: change(this.items()) });
    this.persist();
  }
  readonly openRequests = new Subject<void>();

  add(product: Product, quantity: number): boolean {
    if (!this.requestAccess()) return false;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return false;
    const current = this.items().find(item => item.product.id === product.id)?.quantity ?? 0;
    if (current + quantity > Math.min(99, product.stock ?? 0)) return false;
    this.update((items) => {
      const existing = items.find((item) => item.product.id === product.id);
      return existing ? items.map((item) => item.product.id === product.id
        ? { product, quantity: item.quantity + quantity } : item) : [...items, { product, quantity }];
    });
    this.analytics.productEvent('add_to_cart', product, quantity);
    return true;
  }

  remove(id: string | number): void {
    if (!this.authenticated()) return;
    this.update((items) => items.filter((item) => item.product.id !== id));
  }

  clear(): void { if (this.authenticated()) this.update(() => []); }

  changeQuantity(id: string | number, delta: -1 | 1): boolean {
    if (!this.authenticated()) return false;
    if (delta !== -1 && delta !== 1) return false;
    const line = this.items().find((item) => item.product.id === id);
    if (!line) return false;
    const quantity = line.quantity + delta;
    if (quantity < 1 || (delta === 1 && quantity > Math.min(99, line.product.stock ?? 0))) return false;
    this.update((items) => items.map((item) => item.product.id === id
      ? { ...item, quantity } : item));
    return true;
  }

  refreshAvailability(facts: ReadonlyMap<string, { price: number; effectivePrice?: number; stock: number | null; active: boolean; currency: string }>): void {
    this.update(items => items.map(line => {
      const fact = facts.get(String(line.product.id));
      return { ...line, product: fact ? { ...line.product, regularPrice: fact.price, price: fact.effectivePrice ?? fact.price, stock: fact.active ? fact.stock ?? 0 : 0, currency: fact.currency, onSale: (fact.effectivePrice ?? fact.price) < fact.price } : { ...line.product, stock: 0, onSale: false } };
    }));
  }

  refreshProducts(products: readonly Product[]): void {
    this.update(items => items.map(line => ({ ...line, product: products.find(p => String(p.id) === String(line.product.id)) ?? { ...line.product, stock: 0, onSale: false } })));
  }
}
