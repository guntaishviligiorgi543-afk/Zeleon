import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { Product } from '../models/product';

export interface CartLine { product: Product; quantity: number; }

@Injectable({ providedIn: 'root' })
export class Cart {
  private readonly lines = signal<readonly CartLine[]>([]);
  readonly items = this.lines.asReadonly();
  readonly openRequests = new Subject<void>();

  add(product: Product, quantity: number): boolean {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return false;
    this.lines.update((items) => {
      const existing = items.find((item) => item.product.id === product.id);
      return existing ? items.map((item) => item.product.id === product.id
        ? { product, quantity: item.quantity + quantity } : item) : [...items, { product, quantity }];
    });
    return true;
  }

  remove(id: string | number): void {
    this.lines.update((items) => items.filter((item) => item.product.id !== id));
  }
}
