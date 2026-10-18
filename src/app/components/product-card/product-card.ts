import { Component, input } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Product } from '../../models/product';

@Component({
  imports: [CurrencyPipe],
  selector: 'app-product-card, [appProductCard]',
  styleUrls: ['../../pages/shop/shop.css', './product-card.css'],
  templateUrl: './product-card.html',
})
export class ProductCard {
  readonly product = input.required<Product>();
}
