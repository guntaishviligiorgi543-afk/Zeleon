interface ReportOrder {
  order_number?: string;
  customer_email?: string;
  total?: number | string;
  currency?: string;
  payment_status?: string;
}
interface ReportProduct {
  product_name?: string;
  units?: number | string;
  revenue?: number | string;
}
export interface ReportSnapshot {
  total_customers?: number | string;
  total_orders?: number | string;
  revenue?: number | string;
  active_products?: number | string;
  active_admins?: number | string;
  active_support?: number | string;
  recent_orders?: ReportOrder[];
  product_performance?: ReportProduct[];
}

const clean = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[()\\]/g, (character) => `\\${character}`);
const money = (value: unknown): string => `$${Number(value ?? 0).toFixed(2)}`;

export function createManagerPdf(
  snapshot: ReportSnapshot,
  days: number,
  generatedAt = new Date(),
): Uint8Array {
  const lines: Array<{ text: string; size: number; x: number; y: number }> = [
    { text: 'ZELEON Manager Report', size: 22, x: 52, y: 754 },
    {
      text: `Generated ${generatedAt.toISOString()} | Reporting window ${days} days`,
      size: 9,
      x: 52,
      y: 735,
    },
    { text: 'OPERATING SUMMARY', size: 10, x: 52, y: 700 },
    { text: `Registered customers: ${snapshot.total_customers ?? 0}`, size: 11, x: 52, y: 678 },
    { text: `Total orders: ${snapshot.total_orders ?? 0}`, size: 11, x: 52, y: 660 },
    { text: `Paid revenue: ${money(snapshot.revenue)}`, size: 11, x: 52, y: 642 },
    { text: `Active products: ${snapshot.active_products ?? 0}`, size: 11, x: 290, y: 678 },
    { text: `Active Admins: ${snapshot.active_admins ?? 0}`, size: 11, x: 290, y: 660 },
    { text: `Active Support: ${snapshot.active_support ?? 0}`, size: 11, x: 290, y: 642 },
    { text: 'TOP PRODUCT PERFORMANCE', size: 10, x: 52, y: 600 },
  ];
  let y = 578;
  const products = Array.isArray(snapshot.product_performance)
    ? snapshot.product_performance.slice(0, 8)
    : [];
  if (!products.length)
    lines.push({ text: 'No completed product sales in this period.', size: 10, x: 52, y });
  for (const product of products) {
    lines.push({
      text: `${product.product_name ?? 'Product'} | ${product.units ?? 0} units | ${money(product.revenue)}`,
      size: 10,
      x: 52,
      y,
    });
    y -= 18;
  }
  y -= 20;
  lines.push({ text: 'RECENT ORDERS', size: 10, x: 52, y });
  y -= 22;
  const orders = Array.isArray(snapshot.recent_orders) ? snapshot.recent_orders.slice(0, 8) : [];
  if (!orders.length) lines.push({ text: 'No recent orders.', size: 10, x: 52, y });
  for (const order of orders) {
    lines.push({
      text: `${order.order_number ?? 'Order'} | ${order.customer_email ?? ''} | ${money(order.total)} | ${order.payment_status ?? ''}`,
      size: 9,
      x: 52,
      y,
    });
    y -= 17;
  }
  lines.push({
    text: 'Revenue includes orders with payment_status = paid only.',
    size: 8,
    x: 52,
    y: 46,
  });

  const stream = lines
    .map((line) => `BT /F1 ${line.size} Tf ${line.x} ${line.y} Td (${clean(line.text)}) Tj ET`)
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index++)
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
