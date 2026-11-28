import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Cart } from './cart';

// Promotional threshold is based on discounted USD item subtotal only.
// Shipping fees/taxes are excluded, and other currencies cannot count as USD.
export const FREE_SHIPPING_CENTS = 4000;
export const SHIPPING_REMINDER_CENTS = 3000;

export function freeShippingProgress(lines: readonly { price: number; currency: string; quantity: number }[]): {
  subtotalCents: number; remainingCents: number; visible: boolean; unlocked: boolean; percent: number;
} {
  if (!lines.length || lines.some(line => line.currency !== 'USD' || !Number.isFinite(line.price) || line.price < 0 || !Number.isInteger(line.quantity) || line.quantity < 1)) {
    return { subtotalCents: 0, remainingCents: 4000, visible: false, unlocked: false, percent: 0 };
  }
  const subtotalCents = lines.reduce((sum, line) => sum + Math.round(line.price * 100) * line.quantity, 0);
  return {
    subtotalCents,
    remainingCents: Math.max(0, FREE_SHIPPING_CENTS - subtotalCents),
    visible: subtotalCents > SHIPPING_REMINDER_CENTS,
    unlocked: subtotalCents >= FREE_SHIPPING_CENTS,
    percent: Math.min(100, Math.max(0, Math.round(subtotalCents / FREE_SHIPPING_CENTS * 100))),
  };
}

@Injectable({ providedIn: 'root' })
export class FreeShipping {
  private readonly cart = inject(Cart);
  readonly progress = computed(() => freeShippingProgress(this.cart.items().map(line => ({
    price: line.product.price, currency: line.product.currency, quantity: line.quantity,
  }))));
  readonly reminder = computed(() => this.progress().visible && !this.progress().unlocked);
  readonly unlocked = computed(() => this.progress().visible && this.progress().unlocked);
  readonly remaining = computed(() => this.progress().remainingCents / 100);
  readonly collapsed = signal(false);
  readonly showSuccess = signal(false);
  readonly popupVisible = computed(() =>
    this.showSuccess() || (this.reminder() && !this.collapsed()));
  private lastPhase: 'hidden' | 'reminder' | 'unlocked' = 'hidden';
  private successTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect((onCleanup) => {
      const next: typeof this.lastPhase =
        !this.progress().visible ? 'hidden' :
        this.progress().unlocked ? 'unlocked' : 'reminder';
      if (next !== this.lastPhase) {
        // All dismissal state lives only in memory: a browser refresh
        // automatically restores the popup when the cart is eligible.
        if (this.successTimer) clearTimeout(this.successTimer);
        this.successTimer = null;
        this.showSuccess.set(false);
        if (next === 'hidden' || (next === 'reminder' && this.lastPhase === 'unlocked')) {
          this.collapsed.set(false);
        }
        if (next === 'unlocked') {
          this.collapsed.set(false);
          this.showSuccess.set(true);
          this.successTimer = setTimeout(() => {
            this.showSuccess.set(false);
            this.successTimer = null;
          }, 4000);
        }
        this.lastPhase = next;
      }
    });
  }

  collapse(): void { this.collapsed.set(true); }
}
