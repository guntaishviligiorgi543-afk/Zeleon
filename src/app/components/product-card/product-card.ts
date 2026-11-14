import { Component, computed, inject, input, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Product } from '../../models/product';
import { Cart } from '../../services/cart';

@Component({
  imports: [CurrencyPipe, RouterLink],
  selector: 'app-product-card, [appProductCard]',
  styleUrls: ['../../pages/shop/shop.css', './product-card.css'],
  templateUrl: './product-card.html',
})
export class ProductCard {
  readonly product = input.required<Product>();
  private readonly cart = inject(Cart);
  readonly cartBusy = signal(false);
  readonly inCart = computed(() => this.cart.items().some((line) => line.product.id === this.product().id));

  async toggleCart(event: Event): Promise<void> {
    event.stopPropagation();
    if (this.cartBusy()) return;

    this.cartBusy.set(true);
    try {
      await Promise.resolve(this.inCart()
        ? this.cart.remove(this.product().id)
        : this.cart.add(this.product(), 1));
    } finally {
      this.cartBusy.set(false);
    }
  }
}
