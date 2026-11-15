import { Component, computed, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CurrencyPipe } from '@angular/common';
import { Cart, CartLine } from '../../services/cart';

type CartPhase = 'closed' | 'opening' | 'open' | 'closing';
type ProductId = CartLine['product']['id'];

@Component({
  selector: 'app-cart-sidebar',
  imports: [RouterLink, CurrencyPipe],
  templateUrl: './cart-sidebar.html',
  styleUrl: './cart-sidebar.css',
})
export class CartSidebar {
  readonly cart = inject(Cart);
  readonly phase = signal<CartPhase>('closed');
  readonly opened = computed(() => this.phase() !== 'closed');
  readonly removingIds = signal<ReadonlySet<ProductId>>(new Set());
  readonly status = signal('');
  readonly itemCount = computed(() => this.cart.items().reduce((count, line) => count + line.quantity, 0));
  readonly totals = computed(() => {
    const currencies = new Map<string, number>();
    for (const line of this.cart.items()) {
      currencies.set(line.product.currency, (currencies.get(line.product.currency) ?? 0) + line.product.price * line.quantity);
    }
    return currencies.size
      ? [...currencies].map(([currency, amount]) => ({ currency, amount }))
      : [{ currency: 'USD', amount: 0 }];
  });
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('drawer');
  private readonly router = inject(Router);
  private restoreScroll?: () => void;
  private returnFocus?: HTMLElement;
  private phaseTimer?: ReturnType<typeof setTimeout>;
  private pendingNavigation?: string;
  private readonly removals = new Map<ProductId, { timer: ReturnType<typeof setTimeout>; finish: () => void }>();

  constructor() {
    this.cart.openRequests.pipe(takeUntilDestroyed()).subscribe(() => this.open());
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd) this.close();
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.phaseTimer);
      this.pendingNavigation = undefined;
      for (const removal of [...this.removals.values()]) {
        clearTimeout(removal.timer);
        removal.finish();
      }
      this.restoreScroll?.();
      if (this.dialog().nativeElement.open) this.dialog().nativeElement.close();
    });
  }

  private reducedMotion(): boolean {
    return typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  open(): void {
    if (this.phase() === 'open' || this.phase() === 'opening') return;
    const dialog = this.dialog().nativeElement;
    const panel = dialog.querySelector<HTMLElement>('.cart-panel')!;
    const reopening = this.phase() === 'closing';
    clearTimeout(this.phaseTimer);
    this.pendingNavigation = undefined;
    panel.style.setProperty('--cart-enter-from', reopening ? getComputedStyle(panel).transform : 'translate3d(100%, 0, 0)');
    dialog.style.setProperty('--cart-backdrop-enter-from', reopening ? getComputedStyle(dialog, '::backdrop').opacity : '0');
    if (!reopening) {
      const document = dialog.ownerDocument;
      this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
      const elements = [document.documentElement, document.body];
      const saved = elements.map(element => ({
        value: element.style.getPropertyValue('overflow'),
        priority: element.style.getPropertyPriority('overflow'),
      }));
      elements.forEach(element => element.style.setProperty('overflow', 'hidden'));
      this.restoreScroll = () => elements.forEach((element, index) => {
        if (saved[index].value) element.style.setProperty('overflow', saved[index].value, saved[index].priority);
        else element.style.removeProperty('overflow');
      });
      dialog.showModal();
    }
    this.phase.set(this.reducedMotion() ? 'open' : 'opening');
    if (this.phase() === 'opening') this.phaseTimer = setTimeout(() => this.phase.set('open'), 500);
  }

  close(): void {
    if (!this.opened() || this.phase() === 'closing') return;
    clearTimeout(this.phaseTimer);
    if (this.reducedMotion()) {
      this.completeClose();
      return;
    }
    const dialog = this.dialog().nativeElement;
    const panel = dialog.querySelector<HTMLElement>('.cart-panel')!;
    const transform = getComputedStyle(panel).transform;
    panel.style.setProperty('--cart-exit-from', transform === 'none' ? 'translate3d(0, 0, 0)' : transform);
    dialog.style.setProperty('--cart-backdrop-exit-from', getComputedStyle(dialog, '::backdrop').opacity);
    this.phase.set('closing');
    this.phaseTimer = setTimeout(() => this.completeClose(), 400);
  }

  panelAnimationEnd(event: AnimationEvent): void {
    if (event.target !== event.currentTarget) return;
    if (event.animationName === 'cart-enter' && this.phase() === 'opening') {
      clearTimeout(this.phaseTimer);
      this.phase.set('open');
    } else if (event.animationName === 'cart-exit' && this.phase() === 'closing') {
      this.completeClose();
    }
  }

  private completeClose(): void {
    this.dialog().nativeElement.close();
    this.finishClose();
  }

  finishClose(): void {
    // A queued native close event must not reset a rapidly reopened drawer.
    if (!this.opened() || this.dialog().nativeElement.open) return;
    clearTimeout(this.phaseTimer);
    this.phaseTimer = undefined;
    this.phase.set('closed');
    this.restoreScroll?.();
    this.restoreScroll = undefined;
    if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
    this.returnFocus = undefined;
    const destination = this.pendingNavigation;
    this.pendingNavigation = undefined;
    if (destination) void this.router.navigateByUrl(destination);
  }

  navigateAfterClose(event: MouseEvent, destination: '/cart' | '/shop'): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    this.pendingNavigation = destination;
    this.close();
  }

  changeQuantity(line: CartLine, delta: -1 | 1): void {
    if (this.removingIds().has(line.product.id)) return;
    if (this.cart.changeQuantity(line.product.id, delta)) {
      const quantity = this.cart.items().find(item => item.product.id === line.product.id)!.quantity;
      this.status.set(`${line.product.name} quantity: ${quantity}.`);
    }
  }

  removeLine(line: CartLine): void {
    const id = line.product.id;
    const current = this.cart.items().find(item => item.product.id === id);
    if (!current || this.removals.has(id)) return;
    const finish = () => {
      const removal = this.removals.get(id);
      if (removal) clearTimeout(removal.timer);
      this.removals.delete(id);
      // Preserve a new addition that replaced the line while its old row exited.
      if (this.cart.items().includes(current)) {
        const dialog = this.dialog().nativeElement;
        const row = [...dialog.querySelectorAll<HTMLElement>('.cart-line')]
          .find(element => element.dataset['productId'] === String(id));
        if (row?.contains(dialog.ownerDocument.activeElement)) {
          dialog.querySelector<HTMLButtonElement>('.cart-close')?.focus({ preventScroll: true });
        }
        this.cart.remove(id);
        this.status.set(`Removed ${current.product.name} from your cart.`);
      }
      this.removingIds.update(ids => new Set([...ids].filter(value => value !== id)));
    };
    if (this.reducedMotion()) finish();
    else {
      this.removingIds.update(ids => new Set([...ids, id]));
      this.removals.set(id, { timer: setTimeout(finish, 340), finish });
    }
  }

  cancel(event: Event): void { event.preventDefault(); this.close(); }
  outside(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }
}
