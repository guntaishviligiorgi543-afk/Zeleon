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
  types: ProductOption[];
  flavors: ProductOption[];
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
  escalated_at: string | null;
  created_at: string;
  updated_at: string;
  rating: SupportRating | null;
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
        'id,category_id,product_type_id,flavor_id,name,slug,description,brand,price,currency,is_active,updated_at,category:categories(id,name,slug),product_type:product_types(id,name,slug),flavor:product_flavors(id,name,slug),images:product_images(id,storage_path,is_primary)',
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
    const [categories, types, flavors] = await Promise.all([
      this.client.from('categories').select('id,name,slug').order('name'),
      this.client.from('product_types').select('id,name,slug').order('name'),
      this.client.from('product_flavors').select('id,name,slug').order('name'),
    ]);
    if (categories.error) throw categories.error;
    if (types.error) throw types.error;
    if (flavors.error) throw flavors.error;
    return {
      categories: (categories.data ?? []) as ProductOption[],
      types: (types.data ?? []) as ProductOption[],
      flavors: (flavors.data ?? []) as ProductOption[],
    };
  }

  async saveProduct(value: ProductEditorValue, id?: number): Promise<number> {
    const request = id
      ? this.client.from('products').update(value).eq('id', id).select('id').single()
      : this.client.from('products').insert(value).select('id').single();
    const { data, error } = await request;
    if (error) throw error;
    return Number(data.id);
  }

  async deleteProduct(product: ManagerProduct): Promise<void> {
    const { error } = await this.client.from('products').delete().eq('id', product.id);
    if (error) throw error;
    const paths = product.images.map((image) => image.storage_path);
    if (paths.length) {
      const removed = await this.client.storage.from(environment.productImagesBucket).remove(paths);
      if (removed.error)
        throw new Error(
          'The product was deleted, but one or more stored images require manual cleanup.',
        );
    }
  }

  async uploadImage(productId: number, file: File): Promise<void> {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${productId}/${crypto.randomUUID()}.${extension}`;
    const uploaded = await this.client.storage
      .from(environment.productImagesBucket)
      .upload(path, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      });
    if (uploaded.error) throw uploaded.error;
    const { error } = await this.client
      .from('product_images')
      .insert({ product_id: productId, storage_path: path, is_primary: true });
    if (error) {
      await this.client.storage.from(environment.productImagesBucket).remove([path]);
      throw error;
    }
  }

  async removeImage(image: ManagerProductImage): Promise<void> {
    const { error } = await this.client.from('product_images').delete().eq('id', image.id);
    if (error) throw error;
    const removed = await this.client.storage
      .from(environment.productImagesBucket)
      .remove([image.storage_path]);
    if (removed.error)
      throw new Error(
        'The image record was removed, but the stored object requires manual cleanup.',
      );
  }

  async createReference(
    table: 'product_types' | 'product_flavors',
    name: string,
  ): Promise<ProductOption> {
    const slug = name
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!slug) throw new Error('Enter a name that can produce a valid URL slug.');
    const { data, error } = await this.client
      .from(table)
      .insert({ name: name.trim(), slug })
      .select('id,name,slug')
      .single();
    if (error) throw error;
    return data as ProductOption;
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
          'id,customer_first_name,customer_last_name,customer_email,subject,status,assigned_support_id,escalation_reason,escalated_at,created_at,updated_at',
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
    return ((conversations.data ?? []) as unknown as Omit<SupportConversation, 'rating'>[]).map(
      (conversation) => ({
        ...conversation,
        rating: byConversation.get(conversation.id) ?? null,
      }),
    );
  }

  async updateConversation(
    id: string,
    changes: { assigned_support_id?: string | null; status?: SupportConversation['status']; escalation_reason?: string | null },
  ): Promise<void> {
    const { error } = await this.client.from('support_conversations').update(changes).eq('id', id);
    if (error) throw error;
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
