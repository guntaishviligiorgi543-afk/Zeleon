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
}

/** Display estimates only. An order endpoint must independently price and reserve stock. */
export function checkoutUnitPrice(product: CheckoutProductFacts, now: number): number {
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

  async load(ids: readonly (string | number)[], signal: AbortSignal): Promise<ReadonlyMap<string, CheckoutProductFacts>> {
    if (!ids.length) return new Map();
    const [products, inventory, sales] = await Promise.all([
      this.client.from('products').select('id,price,currency,is_active').in('id', [...ids]).abortSignal(signal),
      this.client.from('product_inventory').select('product_id,quantity').in('product_id', [...ids]).abortSignal(signal),
      this.client.from('product_sales').select('product_id,sale_price,is_active,starts_at,ends_at')
        .in('product_id', [...ids]).eq('is_active', true).abortSignal(signal),
    ]);
    if (products.error || inventory.error || sales.error) {
      throw new Error('Current prices and availability could not be checked. Please try again.');
    }
    const facts = new Map<string, CheckoutProductFacts>();
    for (const product of products.data ?? []) {
      const price = Number(product.price);
      const stockRow = inventory.data?.find(row => String(row.product_id) === String(product.id));
      const stock = stockRow?.quantity ?? null;
      if (!Number.isFinite(price) || price < 0 || (stock !== null && (!Number.isInteger(stock) || stock < 0))) {
        throw new Error('Current prices and availability could not be checked. Please try again.');
      }
      facts.set(String(product.id), {
        price: Math.round(price * 100) / 100, currency: product.currency, active: product.is_active,
        stock, sales: (sales.data ?? []).filter(row => String(row.product_id) === String(product.id)),
      });
    }
    return facts;
  }
}
