export interface ConsentRow {
  email?: string; status?: string; consent_source?: string; consent_policy_version?: string;
  consent_at?: string | null; confirmed_at?: string | null;
  unsubscribed_at?: string | null; created_at?: string | null;
}
const ascii = (value: unknown) => String(value ?? '').normalize('NFKD')
  .replace(/[^\x20-\x7E]/g, '?').replace(/[\\()]/g, '\\$&');
const cut = (value: unknown, length: number) => {
  const text = String(value ?? '-');
  return text.length > length ? text.slice(0, length - 3) + '...' : text;
};
const date = (value: unknown) => value ? String(value).slice(0, 10) : '-';
const NAVY = '0.055 0.115 0.215', BLUE = '0.17 0.43 0.83', MUTED = '0.43 0.50 0.58';
export function buildConsentPdf(rows: ConsentRow[], now = new Date()): Uint8Array {
  const pages: string[][] = [];
  let ops: string[] = [];
  let y = 0;
  const drawRect = (x:number, yy:number, w:number, h:number, color:string) =>
    ops.push(color + ' rg ' + x + ' ' + yy + ' ' + w + ' ' + h + ' re f');
  const text = (x:number, yy:number, value:unknown, size=9, color=NAVY, bold=false) =>
    ops.push(color + ' rg BT /' + (bold ? 'F2' : 'F1') + ' ' + size +
      ' Tf ' + x + ' ' + yy + ' Td (' + ascii(value) + ') Tj ET');
  const counts = {
    confirmed: rows.filter(r => r.status === 'active' && r.confirmed_at).length,
    pending: rows.filter(r => r.status === 'pending_confirmation').length,
    inactive: rows.filter(r => r.status !== 'active' && r.status !== 'pending_confirmation').length,
  };
  const header = () => {
    ops = [];
    const page = pages.length + 1;
    drawRect(0, 717, 612, 75, NAVY);
    drawRect(42, 733, 5, 36, BLUE);
    text(60, 756, 'ZELEON', 24, '1 1 1', true);
    text(60, 739, 'NEWSLETTER  /  CONSENT AUDIT', 9, '0.67 0.81 0.96');
    text(42, 693, 'Newsletter Subscription Consent Report', 17, NAVY, true);
    text(42, 675, 'CONFIDENTIAL  |  AUTHORIZED MANAGEMENT ONLY', 8, MUTED);
    drawRect(42, 659, 528, 1, '0.83 0.87 0.92');
    drawRect(42, 46, 528, 1, '0.83 0.87 0.92');
    text(42, 30, 'Generated ' + now.toISOString().slice(0, 16).replace('T', ' ') + ' UTC', 8, MUTED);
    text(497, 30, 'PAGE ' + page, 8, MUTED);
    y = 642;
  };
  const addPage = () => {
    if (ops.length) pages.push(ops);
    header();
  };
  const section = (title: string) => {
    if (y < 125) addPage();
    drawRect(42, y-18, 528, 24, '0.92 0.95 0.99');
    text(50, y-10, title, 10, NAVY, true);
    y -= 34;
    drawRect(42, y-12, 528, 19, NAVY);
    text(50, y-6, 'EMAIL', 8, '1 1 1', true);
    text(277, y-6, 'STATUS', 8, '1 1 1', true);
    text(353, y-6, 'CONFIRMED', 8, '1 1 1', true);
    text(435, y-6, 'CONSENT', 8, '1 1 1', true);
    text(502, y-6, 'SOURCE', 8, '1 1 1', true);
    y -= 23;
  };
  const addRow = (r: ConsentRow, index: number) => {
    if (y < 85) {
      addPage();
      section('SUBSCRIBER REGISTER (CONTINUED)');
    }
    if (index % 2 === 0) drawRect(42, y-11, 528, 24, '0.96 0.975 0.993');
    text(50, y, cut(r.email, 36), 8);
    text(277, y, cut(r.status, 13), 8, r.status === 'active' ? '0.07 0.43 0.30' : MUTED);
    text(353, y, date(r.confirmed_at), 8);
    text(435, y, date(r.consent_at), 8);
    text(502, y, cut(r.consent_source, 12), 8);
    y -= 25;
  };
  header();
  text(42, 629, '01  EXECUTIVE OVERVIEW', 11, BLUE, true);
  const cards: Array<[string,string]> = [
    ['CONFIRMED', String(counts.confirmed)],
    ['PENDING', String(counts.pending)],
    ['OTHER / INACTIVE', String(counts.inactive)],
  ];
  cards.forEach(([label,value],i)=>{
    const x=42+i*179;
    drawRect(x,546,168,66,'0.925 0.952 0.991');
    drawRect(x,546,3,66,BLUE);
    text(x+13,589,label,8,MUTED,true);
    text(x+13,561,value,21,NAVY,true);
  });
  text(42, 522, 'TOTAL RECORDS: ' + rows.length + '  |  EXPORT SCOPE: ALL NEWSLETTER CONSENT STATUS TYPES', 9, NAVY, true);
  text(42, 503, 'Only confirmed active subscribers are eligible for marketing delivery.', 9, MUTED);
  text(42, 487, 'Pending requests are not proof of verified email consent.', 9, MUTED);
  y=460;
  const groups: Array<[string,ConsentRow[]]> = [
    ['02  CONFIRMED ACTIVE SUBSCRIBERS',rows.filter(r=>r.status==='active'&&!!r.confirmed_at)],
    ['03  PENDING EMAIL CONFIRMATION',rows.filter(r=>r.status==='pending_confirmation')],
    ['04  UNSUBSCRIBED / OTHER RECORDS',rows.filter(r=>!(r.status==='active'&&!!r.confirmed_at)&&r.status!=='pending_confirmation')],
  ];
  for (const [title,subset] of groups) {
    section(title + '  (' + subset.length + ')');
    if (!subset.length) { text(50,y,'No records in this section.',9,MUTED); y-=28; }
    subset.forEach(addRow);
    y -= 18;
  }
  if (ops.length) pages.push(ops);
  // PDF 1.4 with ASCII-only Helvetica text, no external assets or resources.
  const objects:string[]=[];
  const add=(value:string) => {objects.push(value);return objects.length;};
  const catalog=add('');
  const pageTree=add('');
  const normal=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const bold=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pageRefs:number[]=[];
  for(const pageOps of pages){
    const stream=pageOps.join('\n')+'\n';
    const streamRef=add('<< /Length '+stream.length+' >>\nstream\n'+stream+'endstream');
    const pageRef=add('<< /Type /Page /Parent '+pageTree+' 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 '+normal+' 0 R /F2 '+bold+' 0 R >> >> /Contents '+streamRef+' 0 R >>');
    pageRefs.push(pageRef);
  }
  objects[pageTree-1]='<< /Type /Pages /Kids ['+pageRefs.map(p=>p+' 0 R').join(' ')+'] /Count '+pageRefs.length+' >>';
  objects[catalog-1]='<< /Type /Catalog /Pages '+pageTree+' 0 R >>';
  let out='%PDF-1.4\n';
  const offsets:number[]=[0];
  for(let i=0;i<objects.length;i++){offsets.push(out.length);out+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}
  const xref=out.length;
  out+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
  for(let i=1;i<=objects.length;i++)out+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  out+='trailer\n<< /Size '+(objects.length+1)+' /Root '+catalog+' 0 R >>\nstartxref\n'+xref+'\n%%EOF';
  return new TextEncoder().encode(out);
}
