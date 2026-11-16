import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Cart } from '../../services/cart';
@Component({
  selector: 'app-cart-login-dialog',
  template: `<dialog #modal aria-labelledby="cart-login-title" (click)="outside($event)">
    <h2 id="cart-login-title">Login Required</h2>
    <p>Please log in or create an account to add products to your cart.</p>
    <div class="actions"><button type="button" (click)="login()">Log In</button>
    <button type="button" class="cancel" (click)="close()" autofocus>Cancel</button></div>
  </dialog>`,
  styleUrl: './cart-login-dialog.css',
})
export class CartLoginDialog {
  private readonly cart = inject(Cart);
  private readonly router = inject(Router);
  private readonly modal = viewChild.required<ElementRef<HTMLDialogElement>>('modal');
  constructor() {
    this.cart.loginRequests.pipe(takeUntilDestroyed()).subscribe(() => {
      if (!this.modal().nativeElement.open) this.modal().nativeElement.showModal();
    });
    this.cart.accountChanges.pipe(takeUntilDestroyed()).subscribe(() => this.close());
    this.router.events.pipe(takeUntilDestroyed()).subscribe(() => this.close());
  }
  close(): void { if (this.modal().nativeElement.open) this.modal().nativeElement.close(); }
  login(): void {
    this.close();
    void this.router.navigate(['/login'], { queryParams: { returnUrl: '/cart' } });
  }
  outside(event: MouseEvent): void { if (event.target === this.modal().nativeElement) this.close(); }
}
