import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ManagerDashboard, ManagerProduct } from './manager-dashboard';
import { SUPABASE_CLIENT } from './supabase';

function setup(client: object): ManagerDashboard {
  TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: client }] });
  return TestBed.inject(ManagerDashboard);
}

describe('ManagerDashboard', () => {
  it('maps real dashboard RPC values without hardcoded statistics', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        total_customers: 7,
        total_orders: 3,
        revenue: '42.50',
        active_products: 4,
        active_admins: 1,
        active_support: 2,
        recent_orders: [],
        sales_series: [{ day: '2026-11-09', revenue: '42.50', orders: 2 }],
        customer_growth: [{ day: '2026-11-09', customers: 1 }],
        product_performance: [
          { product_id: 1, product_name: 'Test', units: '2', revenue: '42.50' },
        ],
        recent_activity: [],
      },
      error: null,
    });
    const service = setup({ rpc });
    const snapshot = await service.getSnapshot(30);
    expect(rpc).toHaveBeenCalledWith('manager_dashboard_snapshot', { p_days: 30 });
    expect(snapshot.revenue).toBe(42.5);
    expect(snapshot.salesSeries[0]).toEqual({ day: '2026-11-09', revenue: 42.5, orders: 2 });
    expect(snapshot.productPerformance[0]?.units).toBe(2);
  });

  it('creates and edits products through RLS-protected table operations', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 12 }, error: null });
    const insert = vi.fn(() => ({ select: () => ({ single }) }));
    const update = vi.fn(() => ({ eq: () => ({ select: () => ({ single }) }) }));
    const service = setup({ from: vi.fn(() => ({ insert, update })) });
    const value = {
      category_id: 1,
      product_type_id: null,
      flavor_id: null,
      name: 'Product',
      slug: 'product',
      description: null,
      brand: null,
      price: 10,
      currency: 'USD' as const,
      is_active: true,
    };
    await expect(service.saveProduct(value)).resolves.toBe(12);
    await expect(service.saveProduct(value, 12)).resolves.toBe(12);
    expect(insert).toHaveBeenCalledWith(value);
    expect(update).toHaveBeenCalledWith(value);
  });

  it('deletes a product and its storage objects only after confirmation is handled by the UI', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const service = setup({
      from: vi.fn(() => ({ delete: () => ({ eq }) })),
      storage: { from: vi.fn(() => ({ remove })) },
    });
    const product = {
      id: 2,
      images: [{ id: 1, storage_path: '2/image.webp', is_primary: true, publicUrl: 'url' }],
    } as ManagerProduct;
    await service.deleteProduct(product);
    expect(eq).toHaveBeenCalledWith('id', 2);
    expect(remove).toHaveBeenCalledWith(['2/image.webp']);
  });

  it('uploads an approved image and records it against the product', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const service = setup({
      storage: { from: vi.fn(() => ({ upload, remove })) },
      from: vi.fn(() => ({ insert })),
    });
    const file = new File(['image'], 'product.webp', { type: 'image/webp' });
    await service.uploadImage(4, file);
    expect(upload).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ product_id: 4, is_primary: true }),
    );
  });

  it('uses the existing staff-management Edge Function for assignment and suspension', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
    const service = setup({ functions: { invoke } });
    await service.manageStaff({
      action: 'assign',
      targetUserId: '00000000-0000-0000-0000-000000000001',
      role: 'admin',
    });
    await service.manageStaff({
      action: 'set_status',
      targetUserId: '00000000-0000-0000-0000-000000000001',
      status: 'suspended',
    });
    expect(invoke).toHaveBeenNthCalledWith(1, 'staff-management', {
      body: expect.objectContaining({ action: 'assign', role: 'admin' }),
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'staff-management', {
      body: expect.objectContaining({ action: 'set_status', status: 'suspended' }),
    });
  });

  it('updates support assignment through the RLS-protected conversation table', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const service = setup({ from: vi.fn(() => ({ update })) });
    await service.updateConversation('conversation', { assigned_support_id: 'support-user' });
    expect(update).toHaveBeenCalledWith({ assigned_support_id: 'support-user' });
    expect(eq).toHaveBeenCalledWith('id', 'conversation');
  });

  it('reads a selected support thread through its RLS-protected messages query', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'message',
          conversation_id: 'conversation',
          sender_type: 'customer',
          sender_user_id: 'user',
          body: 'Help',
          created_at: '2026-11-09',
        },
      ],
      error: null,
    });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const service = setup({ from: vi.fn(() => ({ select })) });
    const messages = await service.getSupportMessages('conversation');
    expect(eq).toHaveBeenCalledWith('conversation_id', 'conversation');
    expect(order).toHaveBeenCalledWith('created_at');
    expect(messages[0]?.body).toBe('Help');
  });

  it('requests a backend-authorized PDF with the active access token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Blob(['%PDF']), {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      }),
    );
    const service = setup({
      auth: {
        getSession: vi
          .fn()
          .mockResolvedValue({ data: { session: { access_token: 'token' } }, error: null }),
      },
    });
    const blob = await service.exportPdf(30);
    expect(blob.type).toBe('application/pdf');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/functions/v1/manager-report'),
      expect.objectContaining({ method: 'POST' }),
    );
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((options.headers as Record<string, string>)['Authorization']).toBe('Bearer token');
    fetchMock.mockRestore();
  });
});
