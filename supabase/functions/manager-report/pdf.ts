interface ReportOrder { order_number?: string; customer_email?: string; total?: number | string; currency?: string; payment_status?: string; created_at?: string; }
interface ReportProduct { product_name?: string; units?: number | string; revenue?: number | string; }
interface SalesPoint { day?: string; revenue?: number | string; orders?: number | string; }
interface StaffActivity { action?: string; actor_email?: string; created_at?: string; }
export interface ReportSnapshot {
 total_customers?: number | string; total_orders?: number | string; revenue?: number | string;
 active_products?: number | string; active_admins?: number | string; active_support?: number | string;
 recent_orders?: ReportOrder[]; product_performance?: ReportProduct[];
 sales_series?: SalesPoint[]; recent_activity?: StaffActivity[];
}
const safe = (v: unknown) => String(v ?? '').normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replace(/[()\\]/g, c => '\\' + c);
const clip = (v: unknown, max: number) => { const s = String(v ?? ''); return s.length > max ? s.slice(0, max - 3) + '...' : s; };
const money = (v: unknown) => '$' + (Number(v ?? 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (v: unknown) => { const d = new Date(String(v ?? '')); return Number.isNaN(d.getTime()) ? '-' : d.toISOString().slice(0, 10); };

export function createManagerPdf(snapshot: ReportSnapshot, days: number, generatedAt = new Date()): Uint8Array {
 const pages: string[][] = [[], []];
 const navy = '0.090 0.180 0.310', blue = '0.220 0.510 0.780', gray = '0.400 0.470 0.550';
 const rect = (p: number,x:number,y:number,w:number,h:number,color:string) => pages[p].push(color + ' rg ' + x+' '+y+' '+w+' '+h+' re f');
 const txt = (p:number,x:number,y:number,value:unknown,size=10,color=navy,bold=false) =>
   pages[p].push(color+' rg BT /'+(bold?'F2':'F1')+' '+size+' Tf '+x+' '+y+' Td ('+safe(value)+') Tj ET');
 const line = (p:number,y:number) => rect(p,44,y,524,0.7,'0.850 0.890 0.930');
 const header = (p:number,section:string) => {
   rect(p,0,724,612,68,navy);
   rect(p,44,744,5,26,blue);
   txt(p,61,759,'ZELEON',22,'1 1 1',true);
   txt(p,61,743,'ENERGY DRINKS  /  MANAGEMENT INTELLIGENCE',8,'0.740 0.830 0.930');
   txt(p,44,702,section,15,navy,true);
   txt(p,44,684,'CONFIDENTIAL  |  INTERNAL MANAGEMENT USE',8,gray);
   line(p,674);
   line(p,47);
   txt(p,44,32,'ZELEON  |  MANAGEMENT REPORT  |  '+generatedAt.toISOString().slice(0,10),8,gray);
   txt(p,524,32,'PAGE '+(p+1)+' / 2',8,gray);
 };
 header(0,'Executive Business Report');
 header(1,'Operational Detail & Performance');
 txt(0,44,650,'REPORT INFORMATION',10,blue,true);
 txt(0,44,630,'Organization',9,gray); txt(0,185,630,'ZELEON',10,navy,true);
 txt(0,44,612,'Report generated',9,gray); txt(0,185,612,generatedAt.toISOString().replace('T',' ').slice(0,19)+' UTC',10);
 txt(0,44,594,'Reporting period',9,gray); txt(0,185,594,'Last '+days+' days',10);
 txt(0,44,576,'Report classification',9,gray); txt(0,185,576,'Internal / Management only',10);
 line(0,562);
 txt(0,44,542,'01  EXECUTIVE SUMMARY',12,navy,true);
 const cards: Array<[string,string]> = [
  ['PAID REVENUE',money(snapshot.revenue)],['TOTAL ORDERS',String(snapshot.total_orders ?? 0)],
  ['REGISTERED CUSTOMERS',String(snapshot.total_customers ?? 0)],['ACTIVE PRODUCTS',String(snapshot.active_products ?? 0)],
  ['ACTIVE ADMINISTRATORS',String(snapshot.active_admins ?? 0)],['ACTIVE SUPPORT STAFF',String(snapshot.active_support ?? 0)]
 ];
 cards.forEach(([label,value],i) => { const x=44+(i%2)*269, y=458-Math.floor(i/2)*76;
   rect(0,x,y,255,66,'0.950 0.971 0.990'); rect(0,x,y,3,66,blue);
   txt(0,x+15,y+44,label,8,gray,true);txt(0,x+15,y+17,value,18,navy,true);
 });
 txt(0,44,207,'02  REPORT METHODOLOGY',12,navy,true);
 txt(0,44,183,'Revenue represents orders marked as paid; unpaid orders are excluded.',9);
 txt(0,44,166,'Customer and order totals reflect recorded platform data at generation time.',9);
 txt(0,44,149,'Product performance and daily sales use the selected reporting window.',9);
 txt(0,44,117,'Prepared for authorized ZELEON management. Figures are operational,',9,gray);
 txt(0,44,101,'not audited financial statements or tax reporting documents.',9,gray);
 // Detail page
 txt(1,44,651,'03  TOP PRODUCT PERFORMANCE',12,navy,true);
 rect(1,44,625,524,20,'0.920 0.950 0.980');
 txt(1,54,632,'PRODUCT',8,navy,true);txt(1,392,632,'UNITS',8,navy,true);txt(1,475,632,'REVENUE',8,navy,true);
 const products=(snapshot.product_performance ?? []).slice(0,8);
 if(!products.length) txt(1,54,607,'No paid product sales recorded for this reporting period.',9,gray);
 products.forEach((v,i)=>{const y=606-i*22;if(i%2===1)rect(1,44,y-7,524,21,'0.975 0.985 0.995');
 txt(1,54,y,clip(v.product_name ?? 'Product',48),9);txt(1,392,y,v.units??0,9);txt(1,475,y,money(v.revenue),9);});
 line(1,408);
 txt(1,44,387,'04  RECENT CUSTOMER ORDERS',12,navy,true);
 rect(1,44,360,524,20,'0.920 0.950 0.980');
 txt(1,54,367,'ORDER',8,navy,true);txt(1,173,367,'CUSTOMER',8,navy,true);txt(1,412,367,'STATUS',8,navy,true);txt(1,494,367,'TOTAL',8,navy,true);
 const orders=(snapshot.recent_orders??[]).slice(0,7);
 if(!orders.length)txt(1,54,340,'No customer orders recorded.',9,gray);
 orders.forEach((v,i)=>{const y=340-i*22;if(i%2===1)rect(1,44,y-7,524,21,'0.975 0.985 0.995');
 txt(1,54,y,clip(v.order_number??'-',18),8);txt(1,173,y,clip(v.customer_email??'-',33),8);
 txt(1,412,y,clip(v.payment_status??'-',11),8);txt(1,494,y,money(v.total),8);});
 line(1,171);
 txt(1,44,151,'05  MANAGEMENT NOTES',12,navy,true);
 txt(1,44,131,'Sales performance is based on confirmed paid transactions only.',9);
 txt(1,44,115,'Data is generated from the live ZELEON commerce database.',9);
 txt(1,44,99,'This document is intended for internal planning and operational review.',9,gray);
 // Assemble two-page PDF with reusable font objects.
 const objects:string[] = [];
 const add=(s:string)=>{objects.push(s);return objects.length;};
 const catalog=add(''); const root=add('');
 const pageIds:number[]=[];
 for(let p=0;p<2;p++){
  const stream=pages[p].join('\n')+'\n';
  const streamId=add('<< /Length '+new TextEncoder().encode(stream).length+' >>\nstream\n'+stream+'endstream');
  const pageId=add('<< /Type /Page /Parent '+root+' 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R /F2 8 0 R >> >> /Contents '+streamId+' 0 R >>');
  pageIds.push(pageId);
 }
 add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
 objects[root-1]='<< /Type /Pages /Kids ['+pageIds.map(i=>i+' 0 R').join(' ')+'] /Count 2 >>';
 objects[catalog-1]='<< /Type /Catalog /Pages '+root+' 0 R >>';
 let pdf='%PDF-1.4\n'; const offsets=[0];
 objects.forEach((o,i)=>{offsets.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});
 const xref=pdf.length;pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
 for(let i=1;i<=objects.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
 pdf+='trailer\n<< /Size '+(objects.length+1)+' /Root '+catalog+' 0 R >>\nstartxref\n'+xref+'\n%%EOF';
 return new TextEncoder().encode(pdf);
}
