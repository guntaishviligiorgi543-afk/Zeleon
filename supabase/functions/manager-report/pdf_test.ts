import { assert, assertEquals } from 'jsr:@std/assert@1';
import { createManagerPdf } from './pdf.ts';

Deno.test('creates a valid single-page PDF from real-shaped dashboard data', () => {
  const bytes = createManagerPdf(
    {
      total_customers: 3,
      total_orders: 2,
      revenue: 49.5,
      active_products: 4,
      active_admins: 1,
      active_support: 2,
      recent_orders: [
        {
          order_number: 'Z-100',
          customer_email: 'customer@example.com',
          total: 49.5,
          payment_status: 'paid',
        },
      ],
      product_performance: [{ product_name: 'Hydration', units: 2, revenue: 49.5 }],
    },
    30,
    new Date('2026-11-09T00:00:00.000Z'),
  );
  const text = new TextDecoder().decode(bytes);
  assert(text.startsWith('%PDF-1.4'));
  assert(text.includes('ZELEON Manager Report'));
  assert(text.endsWith('%%EOF'));
  assertEquals(text.match(/\/Type \/Page\b/g)?.length, 1);
});
