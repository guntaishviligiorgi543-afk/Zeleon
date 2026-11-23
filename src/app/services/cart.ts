import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { Auth } from './auth';
import { Product } from '../models/product';
import { Analytics } from './analytics';

export interface CartLine { product: Product; quantity: number; }

@Injectable({ providedIn: 'root' })
export class Cart {
  private readonly auth = inject(Auth);
  private readonly analytics = inject(Analytics);
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
      if (this.state().owner !== owner) this.state.set({ owner, lines: [] });
      if (previous !== owner) { previous = owner; this.accountChanges.next(); }
    });
  }
  requestAccess(): boolean {
    if (this.authenticated() && this.owner()) return true;
    this.loginRequests.next();
    return false;
  }
  private update(change: (items: readonly CartLine[]) => readonly CartLine[]): void {
    this.state.set({ owner: this.owner(), lines: change(this.items()) });
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
