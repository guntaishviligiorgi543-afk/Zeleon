import { inject, Injectable } from '@angular/core';
import { FunctionsHttpError, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { StaffRole, StaffStatus } from './staff-access';
import { SUPABASE_CLIENT } from './supabase';

export interface ManagerOrderItem {
  id: number;
  product_name: string;
  quantity: number;
  unit_price: number | string;
  line_total: number | string;
}

export interface ManagerOrder {
  id: string;
  order_number: string;
  customer_email: string;
  customer_first_name: string | null;
  customer_last_name: string | null;
  total: number | string;
  currency: string;
  order_status: string;
  payment_status: string;
  created_at: string;
  items?: ManagerOrderItem[];
}

export interface SalesPoint {
  day: string;
  revenue: number;
  orders: number;
}
export interface CustomerGrowthPoint {
  day: string;
  customers: number;
}
export interface ProductPerformance {
  product_id: number | null;
  product_name: string;
  units: number;
  revenue: number;
}
export interface StaffActivity {
  id: number;
  action: string;
  actor_email: string | null;
  target_email: string | null;
  created_at: string;
}

export interface ManagerSnapshot {
  totalCustomers: number;
  totalOrders: number;
  revenue: number;
  activeProducts: number;
  activeAdmins: number;
  activeSupport: number;
  recentOrders: ManagerOrder[];
  salesSeries: SalesPoint[];
  customerGrowth: CustomerGrowthPoint[];
  productPerformance: ProductPerformance[];
  recentActivity: StaffActivity[];
}

export interface ProductOption {
  id: number;
  name: string;
  slug: string;
}
export interface ManagerProductImage {
  id: number;
  storage_path: string;
  is_primary: boolean;
  publicUrl: string;
}
export interface ManagerProduct {
  id: number;
  category_id: number;
  product_type_id: number | null;
  flavor_id: number | null;
  name: string;
  slug: string;
  description: string | null;
  brand: string | null;
  price: number | string;
  currency: string;
  is_active: boolean;
  updated_at: string;
  category: ProductOption | null;
  product_type: ProductOption | null;
  flavor: ProductOption | null;
  images: ManagerProductImage[];
  inventory?: { quantity: number | null; low_stock_threshold: number } | null;
}

export interface ProductEditorValue {
  category_id: number;
  product_type_id: number | null;
  flavor_id: number | null;
  name: string;
  slug: string;
  description: string | null;
  brand: string | null;
  price: number;
  currency: 'USD';
  is_active: boolean;
}

export interface ProductReferences {
  categories: ProductOption[];
  flavors?: ProductOption[];
  types?: ProductOption[];
}
export interface StaffDirectoryEntry {
  user_id: string;
  email: string;
  role: StaffRole;
  status: StaffStatus;
  appointed_at: string;
  updated_at: string;
}

export interface SupportRatingEntry {
  conversation_id: string;
  rating: number;
  feedback: string | null;
  created_at: string;
}
export interface SupportRating {
  rating: number;
  feedback: string | null;
}
export interface SupportConversation {
  id: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_email: string;
  subject: string | null;
  status: 'open' | 'waiting_customer' | 'resolved' | 'escalated';
  assigned_support_id: string | null;
  escalation_reason: string | null;
  escalation_target: 'admin' | 'manager' | null;
  escalated_at: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  rating: SupportRating | null;
  review_status?: 'pending' | 'in_review' | 'returned' | 'resolved' | null;
  reviewer_id?: string | null;
}
export interface SupportMessage {
  id: string;
  conversation_id: string;
  sender_type: 'customer' | 'support' | 'admin' | 'system';
  sender_user_id: string | null;
  body: string;
  created_at: string;
}

export type StaffManagementRequest =
  | { action: 'assign'; email: string; role: 'admin' | 'support' }
  | { action: 'set_status'; targetUserId: string; status: StaffStatus }
  | { action: 'remove'; targetUserId: string };

// Only these curated messages may be shown; never surface raw backend errors.
export class StaffManagementError extends Error {}

@Injectable({ providedIn: 'root' })
export class ManagerDashboard {
  private readonly client: SupabaseClient = inject(SUPABASE_CLIENT);

  async getSnapshot(days = 30): Promise<ManagerSnapshot> {
    const { data, error } = await this.client.rpc('manager_dashboard_snapshot', { p_days: days });
    if (error) throw error;
    const value = (data ?? {}) as Record<string, unknown>;
    return {
      totalCustomers: Number(value['total_customers'] ?? 0),
      totalOrders: Number(value['total_orders'] ?? 0),
      revenue: Number(value['revenue'] ?? 0),
      activeProducts: Number(value['active_products'] ?? 0),
      activeAdmins: Number(value['active_admins'] ?? 0),
      activeSupport: Number(value['active_support'] ?? 0),
      recentOrders: (value['recent_orders'] ?? []) as ManagerOrder[],
      salesSeries: (
        (value['sales_series'] ?? []) as Array<{
          day: string;
          revenue: number | string;
          orders: number;
        }>
      ).map((point) => ({
        day: point.day,
        revenue: Number(point.revenue),
        orders: Number(point.orders),
      })),
      customerGrowth: (
        (value['customer_growth'] ?? []) as Array<{ day: string; customers: number | string }>
      ).map((point) => ({
        day: point.day,
        customers: Number(point.customers),
      })),
      productPerformance: (
        (value['product_performance'] ?? []) as Array<{
          product_id: number | null;
          product_name: string;
          units: number | string;
          revenue: number | string;
        }>
      ).map((product) => ({
        ...product,
        units: Number(product.units),
        revenue: Number(product.revenue),
      })),
      recentActivity: (value['recent_activity'] ?? []) as StaffActivity[],
    };
  }

  async getProducts(): Promise<ManagerProduct[]> {
    const { data, error } = await this.client
      .from('products')
      .select(
        'id,category_id,product_type_id,flavor_id,name,slug,description,brand,price,currency,is_active,updated_at,category:categories(id,name,slug),product_type:product_types(id,name,slug),flavor:product_flavors(id,name,slug),images:product_images(id,storage_path,is_primary),inventory:product_inventory(quantity,low_stock_threshold)',
      )
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as unknown as ManagerProduct[]).map((product) => ({
      ...product,
      images: (product.images ?? []).map((image) => ({
        ...image,
        publicUrl: this.client.storage
          .from(environment.productImagesBucket)
          .getPublicUrl(image.storage_path).data.publicUrl,
      })),
    }));
  }

  async getProductReferences(): Promise<ProductReferences> {
    const results = await Promise.all(['categories', 'product_flavors', 'product_types'].map(table =>
      this.client.from(table).select('id,name,slug').order('name')));
    for (const result of results) if (result.error) throw result.error;
    return { categories: results[0].data ?? [], flavors: results[1].data ?? [], types: results[2].data ?? [] };
  }

  async saveProduct(value: ProductEditorValue, id?: number, inventory?: { quantity: number; threshold: number; reason: string; expected: number | null }, imagePath?: string): Promise<number> {
    const { data, error } = await this.client.rpc('catalog_save_product', {
      p_value: value, p_id: id ?? null, p_quantity: inventory?.quantity ?? 0,
      p_threshold: inventory?.threshold ?? 10, p_reason: inventory?.reason ?? 'Catalog edit',
      p_expected_quantity: inventory?.expected ?? null, p_image_path: imagePath ?? null,
    });
    if (error) throw error;
    return Number(data);
  }

  async deleteProduct(product: ManagerProduct): Promise<void> {
    // Preserve order references, images and inventory history.
    const { error } = await this.client.from('products').update({ is_active: false }).eq('id', product.id).select('id').single();
    if (error) throw error;
  }

  async uploadImage(_productId: number, file: File): Promise<string> {
    const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
    if (!extensions[file.type] || file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error('Choose a PNG, JPEG or WebP image up to 10 MB.');
    const path = `catalog/${crypto.randomUUID()}.${extensions[file.type]}`;
    const { error } = await this.client.storage.from(environment.productImagesBucket).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return path;
  }

  async cleanupImage(path: string): Promise<void> {
    // Storage policy rejects deletion while ANY product still references the object.
    const { error } = await this.client.storage.from(environment.productImagesBucket).remove([path]);
    if (error) throw new Error('The catalog was saved, but an unused image needs storage cleanup.');
  }

  async removeImage(image: ManagerProductImage): Promise<void> {
    const { error } = await this.client.rpc('catalog_remove_image', { p_image_id: image.id });
    if (error) throw error;
    await this.cleanupImage(image.storage_path);
  }

  async saveReference(table: 'categories' | 'product_types' | 'product_flavors', name: string, slug: string, id?: number): Promise<void> {
    if (!name.trim() || name.length > 200 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Enter a name and a valid lowercase URL slug.');
    const query = id ? this.client.from(table).update({ name: name.trim(), slug }).eq('id', id) : this.client.from(table).insert({ name: name.trim(), slug });
    const { error } = await query.select('id').single();
    if (error) throw new Error('Reference could not be saved. Check for duplicate names or slugs.');
  }

  async deleteReference(table: 'categories' | 'product_types' | 'product_flavors', id: number): Promise<void> {
    const { error } = await this.client.from(table).delete().eq('id', id).select('id').single();
    if (error) throw new Error('Only unused references can be deleted. Reassign their products first.');
  }

  async createReference(table: 'product_types' | 'product_flavors', name: string): Promise<ProductOption> {
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const { data, error } = await this.client.from(table).insert({ name: name.trim(), slug }).select('id,name,slug').single();
    if (error) throw error;
    return data;
  }

  async adjustInventory(productId: number, quantity: number, threshold: number, reason: string, expected: number | null): Promise<void> {
    const { error } = await this.client.rpc('catalog_adjust_inventory', { p_product_id: productId, p_quantity: quantity, p_threshold: threshold, p_reason: reason, p_expected_quantity: expected });
    if (error) throw new Error('Stock correction rejected. Reload to check current stock and your staff session.');
  }

  async inventoryHistory(productId: number): Promise<InventoryMovement[]> {
    const { data, error } = await this.client.from('inventory_movements').select('*').eq('product_id', productId).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return data ?? [];
  }

  async getDiscounts(): Promise<CatalogDiscount[]> {
    const results = await Promise.all(['product_sales', 'category_sales'].map(table => this.client.from(table).select('*').order('created_at', { ascending: false })));
    for (const result of results) if (result.error) throw result.error;
    return results.flatMap((result, index) => (result.data ?? []).map(row => ({ ...row, kind: index === 0 ? 'product' as const : 'category' as const })));
  }

  async saveDiscount(kind: 'product' | 'category', value: Record<string, unknown>, id?: number): Promise<void> {
    const table = kind === 'product' ? 'product_sales' : 'category_sales';
    const query = id ? this.client.from(table).update(value).eq('id', id) : this.client.from(table).insert(value);
    const { error } = await query.select('id').single();
    if (error) throw new Error('Discount rejected. Check stock, dates, price and overlapping discounts.');
  }

  async cancelDiscount(discount: CatalogDiscount): Promise<void> {
    await this.saveDiscount(discount.kind, discount.kind === 'product' ? { is_active: false, end_reason: 'cancelled' } : { status: 'cancelled' }, discount.id);
  }

  async getStaffDirectory(): Promise<StaffDirectoryEntry[]> {
    const { data, error } = await this.client.rpc('manager_staff_directory');
    if (error) throw error;
    return (data ?? []) as StaffDirectoryEntry[];
  }

  async manageStaff(body: StaffManagementRequest): Promise<{notificationSent?: boolean}> {
    const { data, error } = await this.client.functions.invoke('staff-management', { body });
    if (error || data?.ok !== true) {
      let status = 0;
      let details: unknown = data;
      if (error instanceof FunctionsHttpError) {
        status = error.context.status;
        try {
          details = await error.context.json();
        } catch {
          // A non-JSON response still receives a safe status-based message.
        }
      }
      const reason = JSON.stringify(details ?? {}).toLowerCase();
      let message =
        'The staff service could not complete the request. Check your connection and try again.';
      if (status === 401 || /session|expired|jwt|unauthorized|mfa/.test(reason)) {
        message =
          'Your staff session has expired or needs verification. Sign in to the staff workspace again.';
      } else if (status === 403 || /permission|forbidden|hierarchy/.test(reason)) {
        message = 'You do not have permission to make this staff change.';
      } else if (
        body.action === 'assign' &&
        (status === 404 || /not.found|not.verified|unverified|not.confirmed/.test(reason))
      ) {
        message =
          'No existing verified account was found for this email. Check the address and account verification.';
      } else if (body.action === 'assign' && /invalid.email|email.invalid/.test(reason)) {
        message = 'Enter a valid email address.';
      } else if (body.action === 'assign' && status === 400) {
        message =
          'The role could not be assigned. Check that the email belongs to an existing verified account and that the role change is allowed.';
      }
      throw new StaffManagementError(message);
    }
    return { notificationSent: data.notificationSent };
  }

  async getSupportRatings(): Promise<SupportRatingEntry[]> {
    const { data, error } = await this.client.from('support_ratings')
      .select('conversation_id,rating,feedback,created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as SupportRatingEntry[];
  }

  async getSupportConversations(): Promise<SupportConversation[]> {
    const [conversations, ratings] = await Promise.all([
      this.client
        .from('support_conversations')
        .select(
          'id,customer_first_name,customer_last_name,customer_email,subject,status,assigned_support_id,escalation_reason,escalation_target,escalated_at,created_at,updated_at',
        )
        .order('updated_at', { ascending: false }),
      this.client.from('support_ratings').select('conversation_id,rating,feedback'),
    ]);
    if (conversations.error) throw conversations.error;
    if (ratings.error) throw ratings.error;
    const byConversation = new Map(
      (ratings.data ?? []).map((rating) => [
        String(rating.conversation_id),
        { rating: Number(rating.rating), feedback: rating.feedback as string | null },
      ]),
    );
    const ids = (conversations.data ?? []).map((row) => row.id);
    // updated_at changes when a conversation is assigned or its status changes.
    // The queue must show the timestamp of the latest *actual message* instead.
    const timestamps = ids.length
      ? await this.client.from('support_conversation_last_message')
          .select('conversation_id,last_message_at').in('conversation_id', ids)
      : { data: [], error: null };
    if (timestamps.error) throw timestamps.error;
    const messageTimes = new Map(
      (timestamps.data ?? []).map(row => [row.conversation_id, row.last_message_at]),
    );
    const reviews = ids.length ? await this.client.from('support_escalation_reviews').select('conversation_id,review_status,reviewer_id').in('conversation_id', ids) : { data: [], error: null };
    if (reviews.error) throw reviews.error;
    const reviewMap = new Map((reviews.data ?? []).map(row => [row.conversation_id, row]));
    return ((conversations.data ?? []) as unknown as Omit<SupportConversation, 'rating'>[]).map(
      (conversation) => ({
        ...conversation,
        last_message_at: messageTimes.get(conversation.id) ?? null,
        rating: byConversation.get(conversation.id) ?? null,
        review_status: reviewMap.get(conversation.id)?.review_status ?? 'pending',
        reviewer_id: reviewMap.get(conversation.id)?.reviewer_id ?? null,
      }),
    ).sort((a, b) =>
      new Date(b.last_message_at ?? b.created_at).getTime() -
      new Date(a.last_message_at ?? a.created_at).getTime()
    );
  }

  async updateConversation(
    id: string,
    changes: { assigned_support_id?: string | null; status?: SupportConversation['status']; escalation_reason?: string | null; escalation_target?: 'admin' | 'manager' | null; escalated_at?: string | null },
  ): Promise<void> {
    const { data, error } = await this.client.from('support_conversations').update(changes).eq('id', id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Update denied: this conversation is not assigned to your account or you lack permission.');
  }

  async escalationAction(id: string, action: 'accept' | 'note' | 'return' | 'resolve', note?: string): Promise<void> {
    const { error } = await this.client.rpc('staff_escalation_action', {
      p_conversation_id: id, p_action: action, p_note: note ?? null,
    });
    if (error) throw error;
  }

  async escalationNotes(id: string): Promise<Array<{ id: string; body: string; author_id: string; created_at: string }>> {
    const { data, error } = await this.client.from('support_escalation_notes')
      .select('id,body,author_id,created_at').eq('conversation_id', id).order('created_at');
    if (error) throw error;
    return data ?? [];
  }

  async notifySupportEscalated(conversationId: string): Promise<'sent' | 'failed'> {
    return this.sendSupportNotification('support-escalation-notification', { conversationId });
  }

  private async sendSupportNotification(functionName: string, body: Record<string, string>): Promise<'sent' | 'failed'> {
    try {
      const { data: { session }, error: sessionError } = await this.client.auth.getSession();
      if (sessionError || !session?.access_token) return 'failed';
      const response = await fetch(`${environment.supabaseUrl}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: environment.supabasePublishableKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) {
        console.error('Support notification failed:', functionName, response.status, result.error);
        return 'failed';
      }
      return 'sent';
    } catch (error) {
      console.error('Support notification network error:', functionName, error);
      return 'failed';
    }
  }

  async notifyEscalationDecision(conversationId: string): Promise<'sent' | 'failed'> {
    return this.sendSupportNotification('support-escalation-decision-notification', { conversationId });
  }

  async notifySupportResolved(conversationId: string): Promise<'sent' | 'failed'> {
    return this.sendSupportNotification('support-resolution-notification', { conversationId });
  }

  async claimSupportConversation(conversationId: string): Promise<boolean> {
    const { data, error } = await this.client.rpc('support_claim_conversation', { p_conversation_id: conversationId });
    if (error) throw error;
    return data === true;
  }

  async sendSupportReply(conversationId: string, body: string): Promise<{ emailNotification: 'sent' | 'failed' }> {
    const { data: userData, error: userError } = await this.client.auth.getUser();
    if (userError || !userData.user) throw userError ?? new Error('Sign in required');
    const { data: reply, error } = await this.client.from('support_messages').insert({
      conversation_id: conversationId,
      sender_type: 'support',
      sender_user_id: userData.user.id,
      body: body.trim(),
    }).select('id').single();
    if (error) throw error;
    // Database trigger queues this reply for a 3-minute digest; cron sends only when the chat is inactive.
    return { emailNotification: 'sent' };
  }

  async getSupportMessages(conversationId: string): Promise<SupportMessage[]> {
    const { data, error } = await this.client
      .from('support_messages')
      .select('id,conversation_id,sender_type,sender_user_id,body,created_at')
      .eq('conversation_id', conversationId)
      .order('created_at');
    if (error) throw error;
    return (data ?? []) as SupportMessage[];
  }

  async getOrders(): Promise<ManagerOrder[]> {
    const { data, error } = await this.client
      .from('orders')
      .select(
        'id,order_number,customer_email,customer_first_name,customer_last_name,total,currency,order_status,payment_status,created_at,items:order_items(id,product_name,quantity,unit_price,line_total)',
      )
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as ManagerOrder[];
  }

  async exportPdf(days: number): Promise<Blob> {
    const session = await this.client.auth.getSession();
    if (session.error || !session.data.session?.access_token)
      throw session.error ?? new Error('A verified session is required.');
    const response = await fetch(`${environment.supabaseUrl}/functions/v1/manager-report`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.data.session.access_token}`,
        apikey: environment.supabasePublishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ days }),
    });
    if (!response.ok) throw new Error('The Manager report could not be generated.');
    return response.blob();
  }
}

export interface InventoryMovement { id: number; delta: number; quantity_after: number; reason: string; note?: string | null; created_at: string; actor_user_id: string | null; order_id: string | null; }
export interface CatalogDiscount { id: number; kind: 'product' | 'category'; product_id?: number; category_id?: number; sale_price?: number; discount_percent?: number; starts_at: string; ends_at: string; is_active?: boolean; end_reason?: string | null; status?: string; }
export function discountStatus(sale: CatalogDiscount, now = Date.now()): string {
  if (sale.kind === 'product' && !sale.is_active) return sale.end_reason ?? 'cancelled';
  if (sale.kind === 'category' && !['active', 'scheduled'].includes(sale.status ?? '')) return sale.status ?? 'cancelled';
  if (Date.parse(sale.ends_at) <= now) return 'expired';
  return Date.parse(sale.starts_at) > now ? 'scheduled' : 'active';
}
