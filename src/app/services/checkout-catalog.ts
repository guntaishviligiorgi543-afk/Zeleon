import { Injectable, inject } from '@angular/core';
import { SUPABASE_CLIENT } from './supabase';

export interface CheckoutSale {
  sale_price: number | string;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
}
export interface CheckoutProductFacts {
  price: number;
  currency: string;
  active: boolean;
  stock: number | null;
  sales: CheckoutSale[];
  effectivePrice?: number;
}

/** Display estimates only. An order endpoint must independently price and reserve stock. */
export function checkoutUnitPrice(product: CheckoutProductFacts, now: number): number {
  if (product.effectivePrice !== undefined) return product.effectivePrice;
  return product.sales.reduce((price, sale) => {
    const start = sale.starts_at === null ? -Infinity : Date.parse(sale.starts_at);
    const end = sale.ends_at === null ? Infinity : Date.parse(sale.ends_at);
    const amount = Number(sale.sale_price);
    return sale.is_active && start <= now && now < end && Number.isFinite(amount) && amount >= 0
      ? Math.min(price, Math.round(amount * 100) / 100) : price;
  }, product.price);
}

@Injectable({ providedIn: 'root' })
export class CheckoutCatalog {
  private readonly client = inject(SUPABASE_CLIENT);

  async quote(items: readonly { productId: string | number; quantity: number }[]): Promise<void> {
    const { error } = await this.client.rpc('catalog_quote_cart', { p_items: items.map(item => ({ product_id: item.productId, quantity: item.quantity })) });
    if (error) throw new Error('Your cart changed or could not be validated. Review stock and prices before checkout.');
  }

  async load(ids: readonly (string | number)[], signal: AbortSignal): Promise<ReadonlyMap<string, CheckoutProductFacts>> {
    if (!ids.length) return new Map();
    const { data, error } = await this.client.from('catalog_product_offers').select('*')
      .in('product_id', [...ids]).abortSignal(signal);
    if (error) throw new Error('Current prices and availability could not be checked. Please try again.');
    const facts = new Map<string, CheckoutProductFacts>();
    for (const product of data ?? []) {
      const price = Number(product.regular_price);
      const effectivePrice = Number(product.effective_price);
      const stock = Number(product.stock_quantity ?? 0);
      if (!Number.isFinite(price) || price < 0 || !Number.isFinite(effectivePrice) || effectivePrice < 0 || effectivePrice > price || !Number.isInteger(stock) || stock < 0) {
        throw new Error('Current prices and availability could not be checked. Please try again.');
      }
      facts.set(String(product.product_id), { price, effectivePrice, currency: product.currency, active: true, stock, sales: [] });
    }
    return facts;
  }
}
