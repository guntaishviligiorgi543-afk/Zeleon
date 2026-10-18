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
  category: { name: string; slug: string } | null;
  images: { storage_path: string; is_primary: boolean; created_at: string }[];
}

export const PRODUCT_SELECT = 'id,name,slug,price,currency,created_at,category:categories(name,slug),images:product_images(storage_path,is_primary,created_at)';

@Injectable({ providedIn: 'root' })
export class Products {
  private readonly client: SupabaseClient = inject(SUPABASE_CLIENT);

  async getActiveProducts(signal?: AbortSignal): Promise<Product[]> {
    let query = this.client.from('products').select(PRODUCT_SELECT).eq('is_active', true)
      .order('created_at').order('id');
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query.overrideTypes<ProductRecord[], { merge: false }>();
    if (error) throw new Error('Products could not be loaded. Please try again.');
    return (data ?? []).map((row) => this.mapProduct(row));
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
    return data ? this.mapProduct(data) : null;
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
      category: row.category?.slug ?? '', categoryName: row.category?.name ?? '',
      image: path ? this.client.storage.from(environment.productImagesBucket).getPublicUrl(path).data.publicUrl : '',
    };
  }
}
