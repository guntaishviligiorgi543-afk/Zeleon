import { Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CurrencyPipe } from '@angular/common';
import { Cart } from '../../services/cart';

@Component({
  selector: 'app-cart-sidebar',
  imports: [RouterLink, CurrencyPipe],
  templateUrl: './cart-sidebar.html',
  styleUrl: './cart-sidebar.css',
})
export class CartSidebar {
  readonly cart = inject(Cart);
  readonly opened = signal(false);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('drawer');
  private restoreScroll?: () => void;
  private returnFocus?: HTMLElement;

  constructor() {
    this.cart.openRequests.pipe(takeUntilDestroyed()).subscribe(() => this.open());
    inject(Router).events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd) this.close();
    });
    inject(DestroyRef).onDestroy(() => {
      this.restoreScroll?.();
      if (this.dialog().nativeElement.open) this.dialog().nativeElement.close();
    });
  }

  open(): void {
    if (this.opened()) return;
    const dialog = this.dialog().nativeElement;
    const document = dialog.ownerDocument;
    this.returnFocus = document.activeElement as HTMLElement;
    dialog.showModal();
    this.opened.set(true);
    const elements = [document.documentElement, document.body];
    const saved = elements.map((element) => ({
      value: element.style.getPropertyValue('overflow'),
      priority: element.style.getPropertyPriority('overflow'),
    }));
    elements.forEach((element) => element.style.setProperty('overflow', 'hidden'));
    this.restoreScroll = () => elements.forEach((element, index) => {
      if (saved[index].value) element.style.setProperty('overflow', saved[index].value, saved[index].priority);
      else element.style.removeProperty('overflow');
    });
  }

  close(): void {
    if (!this.opened()) return;
    this.dialog().nativeElement.close();
    this.finishClose();
  }

  finishClose(): void {
    if (!this.opened()) return;
    this.opened.set(false);
    this.restoreScroll?.();
    this.restoreScroll = undefined;
    if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
  }

  cancel(event: Event): void { event.preventDefault(); this.close(); }
  outside(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }
}
