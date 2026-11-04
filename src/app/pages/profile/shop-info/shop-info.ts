import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Cart } from '../../../services/cart';

@Component({ imports: [RouterLink, CurrencyPipe], selector: 'app-shop-info', styleUrl: './shop-info.css', templateUrl: './shop-info.html' })
export class ShopInfo { readonly cart = inject(Cart); }
