import { createClient } from '@supabase/supabase-js';
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

  it('saves product and stock atomically through an authorized RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({data:12,error:null}); const service=setup({rpc});
    const value={category_id:1,product_type_id:null,flavor_id:null,name:'Product',slug:'product',description:null,brand:null,price:10,currency:'USD' as const,is_active:false};
    expect(await service.saveProduct(value,12,{quantity:4,threshold:10,reason:'Restock',expected:1},'catalog/image.webp')).toBe(12);
    expect(rpc).toHaveBeenCalledWith('catalog_save_product',expect.objectContaining({p_value:value,p_id:12,p_quantity:4,p_expected_quantity:1,p_image_path:'catalog/image.webp'}));
  });
  it('deactivates a product and preserves stored objects and history',async()=>{
    const single=vi.fn().mockResolvedValue({data:{id:2},error:null}); const eq=vi.fn(()=>({select:()=>({single})})); const update=vi.fn(()=>({eq}));
    await setup({from:()=>({update})}).deleteProduct({id:2,images:[]} as unknown as ManagerProduct);
    expect(update).toHaveBeenCalledWith({is_active:false}); expect(eq).toHaveBeenCalledWith('id',2);
  });
  it('uploads a validated image before any database reference changes',async()=>{
    const upload=vi.fn().mockResolvedValue({error:null}); const from=vi.fn();
    const service=setup({from,storage:{from:()=>({upload})}});
    const path=await service.uploadImage(4,new File(['image'],'untrusted.name.webp',{type:'image/webp'}));
    expect(path).toMatch(/^catalog\/[0-9a-f-]+\.webp$/);expect(upload).toHaveBeenCalledOnce();expect(from).not.toHaveBeenCalled();
    await expect(service.uploadImage(4,new File(['bad'],'x.svg',{type:'image/svg+xml'}))).rejects.toThrow('Choose');
    await expect(service.uploadImage(4,new File([new Uint8Array(10485761)],'x.png',{type:'image/png'}))).rejects.toThrow('Choose');
  });
  it('uses the existing staff-management Edge Function for assignment and suspension', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
    const service = setup({ functions: { invoke } });
    await service.manageStaff({
      action: 'assign',
      email: 'employee@example.com',
      role: 'admin',
    });
    await service.manageStaff({
      action: 'set_status',
      targetUserId: '00000000-0000-0000-0000-000000000001',
      status: 'suspended',
    });
    expect(invoke).toHaveBeenNthCalledWith(1, 'staff-management', {
      body: { action: 'assign', email: 'employee@example.com', role: 'admin' },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'staff-management', {
      body: {
        action: 'set_status',
        targetUserId: '00000000-0000-0000-0000-000000000001',
        status: 'suspended',
      },
    });
  });

  it('rejects an unconfirmed assignment response', async () => {
    const service = setup({
      functions: { invoke: vi.fn().mockResolvedValue({ data: {}, error: null }) },
    });
    await expect(
      service.manageStaff({ action: 'assign', email: 'employee@example.com', role: 'support' }),
    ).rejects.toThrow('could not complete');
  });

  it('does not expose backend details on assignment failure', async () => {
    const service = setup({
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: { error: 'Internal database failure: confidential details' },
          error: null,
        }),
      },
    });
    await expect(
      service.manageStaff({ action: 'assign', email: 'employee@example.com', role: 'support' }),
    ).rejects.toThrow(
      'The staff service could not complete the request. Check your connection and try again.',
    );
  });

  it('sends the user bearer token and public API key through the shared Supabase SDK', async () => {
    const requests: Request[] = [];
    const client = createClient('https://example.supabase.co', 'sb_publishable_test', {
      accessToken: async () => 'test-user-jwt',
      global: { fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      } },
    });
    const service = setup(client);
    await service.manageStaff({ action: 'assign', email: 'employee@example.com', role: 'support' });
    expect(requests).toHaveLength(1);
    expect(requests[0].headers.get('Authorization')).toBe('Bearer test-user-jwt');
    expect(requests[0].headers.get('apikey')).toBe('sb_publishable_test');
    expect(await requests[0].json()).toEqual({ action: 'assign', email: 'employee@example.com', role: 'support' });
  });

  it('updates support assignment through the RLS-protected conversation table', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'conversation' }, error: null });
    const select = vi.fn(() => ({ maybeSingle }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const service = setup({ from: vi.fn(() => ({ update })) });
    await service.updateConversation('conversation', { assigned_support_id: 'support-user' });
    expect(update).toHaveBeenCalledWith({ assigned_support_id: 'support-user' });
    expect(eq).toHaveBeenCalledWith('id', 'conversation');
    expect(select).toHaveBeenCalledWith('id');
    expect(maybeSingle).toHaveBeenCalledOnce();
    maybeSingle.mockResolvedValueOnce({ data: null as any, error: null });
    await expect(service.updateConversation('conversation', { assigned_support_id: 'support-user' })).rejects.toThrow('Update denied');
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
