import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { buildConsentPdf, ConsentRow } from './pdf.ts';
const origins = new Set(['https://zeleon.store', 'https://www.zeleon.store', 'http://localhost:4200']);
const cors = (r:Request) => ({
  ...(origins.has(r.headers.get('Origin') ?? '') ? { 'Access-Control-Allow-Origin':r.headers.get('Origin')! } : {}),
  'Access-Control-Allow-Headers':'authorization,content-type,apikey,x-client-info',
  'Access-Control-Allow-Methods':'POST,OPTIONS',
  'Vary':'Origin',
});
const respond=(r:Request,status:number,error:string)=>new Response(JSON.stringify({error}),{
  status,headers:{...cors(r),'Content-Type':'application/json','Cache-Control':'no-store'},
});
Deno.serve(async(request:Request)=>{
  const origin=request.headers.get('Origin');
  if(origin&&!origins.has(origin))return respond(request,403,'Origin not allowed');
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(request)});
  if(request.method!=='POST')return respond(request,405,'Method not allowed');
  try{
    const authorization=request.headers.get('Authorization') ?? '';
    const token=authorization.match(/^Bearer\s+(\S+)$/i)?.[1];
    if(!token)return respond(request,401,'Login required');
    const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_ANON_KEY');
    if(!url||!key)return respond(request,503,'Report service unavailable');
    const client=createClient(url,key,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:claims,error:claimsError}=await client.auth.getClaims(token);
    if(claimsError||!claims?.claims?.sub)return respond(request,401,'Login required');
    if(claims.claims.aal!=='aal2')return respond(request,403,'Manager MFA required');
    const session=await client.rpc('staff_session');
    if(session.error||session.data!==true)return respond(request,403,'Verified staff session required');
    const {data,error}=await client.rpc('newsletter_manager_consent_export');
    if(error)return respond(request,error.code==='42501'?403:500,error.code==='42501'?'Manager role required':'Report data unavailable');
    if(!Array.isArray(data?.subscribers))return respond(request,500,'Invalid report data');
    const pdf=buildConsentPdf(data.subscribers as ConsentRow[]);
    const buffer=pdf.buffer.slice(pdf.byteOffset,pdf.byteOffset+pdf.byteLength) as ArrayBuffer;
    return new Response(buffer,{status:200,headers:{
      ...cors(request),'Content-Type':'application/pdf',
      'Content-Disposition':'attachment; filename="zeleon-newsletter-consent-'+new Date().toISOString().slice(0,10)+'.pdf"',
      'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
    }});
  }catch(e){console.error('Consent report failure', e instanceof Error ? e.message:'unknown');return respond(request,503,'Report service unavailable');}
});
