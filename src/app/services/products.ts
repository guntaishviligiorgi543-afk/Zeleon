import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { Product } from '../models/product';
import { SUPABASE_CLIENT } from './supabase';
import { environment } from '../../environments/environment';

export interface ProductRecord {
  id: string | number;
  name: string;
  slug: string;
  price: number | string;
  currency: string;
  created_at: string;
  description?: string | null;
  category: { name: string; slug: string } | null;
  images: { storage_path: string; is_primary: boolean; created_at: string }[];
}

export const PRODUCT_SELECT = 'id,name,slug,description,price,currency,created_at,category:categories(name,slug),images:product_images(storage_path,is_primary,created_at)';

@Injectable({ providedIn: 'root' })
export class Products {
  private readonly client: SupabaseClient = inject(SUPABASE_CLIENT);

  async getActiveProducts(signal?: AbortSignal): Promise<Product[]> {
    let query = this.client.from('products').select(PRODUCT_SELECT).eq('is_active', true)
      .order('created_at').order('id');
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query.overrideTypes<ProductRecord[], { merge: false }>();
    if (error) throw new Error('Products could not be loaded. Please try again.');
    return this.withOffers((data ?? []).map((row) => this.mapProduct(row)), signal);
  }

  async getProduct(idOrSlug: string | number, signal?: AbortSignal): Promise<Product | null> {
    const value = String(idOrSlug).trim();
    if (!value || value.length > 200) return null;
    const isId = /^\d+$/.test(value) || /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
    let query = this.client.from('products').select(PRODUCT_SELECT).eq('is_active', true)
      .eq(isId ? 'id' : 'slug', value);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query.maybeSingle().overrideTypes<ProductRecord, { merge: false }>();
    if (error) throw new Error('This product could not be loaded. Please try again.');
    return data ? (await this.withOffers([this.mapProduct(data)], signal))[0] : null;
  }

  async getCategories(): Promise<{ id: number; name: string; slug: string }[]> {
    const { data, error } = await this.client.from('categories').select('id,name,slug').order('name');
    if (error) throw new Error('Categories could not be loaded. Please try again.');
    return data ?? [];
  }

  private async withOffers(products: Product[], signal?: AbortSignal): Promise<Product[]> {
    if (!products.length) return [];
    let query = this.client.from('catalog_product_offers').select('*').in('product_id', products.map(p => p.id));
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw new Error('Current prices and availability could not be loaded.');
    return products.map(product => {
      const offer = data?.find(row => String(row.product_id) === String(product.id));
      const stock = Number(offer?.stock_quantity ?? 0);
      const price = Number(offer?.effective_price ?? product.price);
      if (!Number.isInteger(stock) || stock < 0 || !Number.isFinite(price) || price < 0) throw new Error('Invalid catalog availability.');
      return { ...product, regularPrice: Number(offer?.regular_price ?? product.price), price, stock, onSale: !!offer?.on_sale && stock > 0 };
    });
  }

  private mapProduct(row: ProductRecord): Product {
    const images = [...(row.images ?? [])].sort((a, b) =>
      Number(b.is_primary) - Number(a.is_primary) ||
      a.created_at.localeCompare(b.created_at) || a.storage_path.localeCompare(b.storage_path),
    );
    const path = images[0]?.storage_path;
    return {
      id: row.id, name: row.name, slug: row.slug,
      price: Number(row.price), currency: row.currency,
      description: row.description ?? '',
      category: row.category?.slug ?? '', categoryName: row.category?.name ?? '',
      image: path ? this.client.storage.from(environment.productImagesBucket).getPublicUrl(path).data.publicUrl : '',
    };
  }
}
