import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const origins = new Set(['https://zeleon.store','https://www.zeleon.store','http://localhost:4200']);
const url = Deno.env.get('SUPABASE_URL') || '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
const db = createClient(url, serviceKey, {auth:{persistSession:false,autoRefreshToken:false}});
const encoder = new TextEncoder();
const asEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]!));
const safeName = (value: unknown) => String(value ?? '').trim().replace(/[\\u0000-\\u001f\\u007f]/g, ' ').trim();
async function hash(value: string): Promise<string> { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join(''); }
function cors(origin: string | null): Record<string,string> { return {'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'content-type,authorization,apikey,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS',...(origin && origins.has(origin)?{'Access-Control-Allow-Origin':origin}:{})}; }

Deno.serve(async (req) => {
 const origin=req.headers.get('origin');
 const headers=cors(origin);
 const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!origins.has(origin))return json({error:'Origin not permitted.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return json({error:'Method not permitted.'},405);
 if(Number(req.headers.get('content-length')||'0')>9000)return json({error:'Request too large.'},413);
 if(!url||!serviceKey||!anonKey)return json({error:'Contact service is unavailable.'},503);
 let payload:Record<string,unknown>;
 try { const body=await req.json(); if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Invalid request.'},400);payload=body; } catch {return json({error:'Invalid request.'},400);}
 const action=payload['action'];
 const authHeader=req.headers.get('authorization');
 const token=authHeader?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
 try {
  if(action==='submit') {
   // A signed-in visitor must use their verified account email.
   // A guest can use any valid reply address.
   let accountId:string|null=null;
   let accountEmail:string|null=null;
   if(authHeader&&!token)return json({error:'Your session is invalid. Please sign in again.'},401);
   if(token){
    const verified=await db.auth.getUser(token);
    if(verified.error||!verified.data.user)return json({error:'Your session has expired. Please sign in again.'},401);
    accountId=verified.data.user.id;
    accountEmail=verified.data.user.email?.trim().toLowerCase()||null;
    if(!accountEmail || !verified.data.user.email_confirmed_at) return json({error:'Verify your registered email before sending a message.'},403);
   }
   const firstName=safeName(payload['firstName']),lastName=safeName(payload['lastName']);
   const email=asEmail(payload['email']);
   const message=String(payload['message']??'').trim();
   if(firstName.length<1||firstName.length>80||lastName.length<1||lastName.length>80||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||message.length<10||message.length>4000)return json({error:'Please complete all fields (message must be 10–4000 characters).'},400);
   if(accountEmail&&email!==accountEmail)return json({error:'Use the email address registered to your ZELEON account.'},403);
   // Honeypot and hashed rate limits protect the public inbox without exposing whether an address exists.
   if(String(payload['website']??'').trim())return json({message:'Your message was received.'});
   const clientIp=(req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown').trim().slice(0,70);
   const emailKey='contact:email:'+await hash(email);
   const ipKey='contact:ip:'+await hash(clientIp);
   const [emailLimit,ipLimit]=await Promise.all([
    db.rpc('newsletter_allow_request',{p_key:emailKey,p_limit:3,p_window_seconds:3600}),
    db.rpc('newsletter_allow_request',{p_key:ipKey,p_limit:12,p_window_seconds:3600}),
   ]);
   if(emailLimit.error||ipLimit.error)return json({error:'Contact service is temporarily unavailable.'},503);
   if(emailLimit.data!==true||ipLimit.data!==true)return json({error:'Too many requests. Please try again later.'},429);
   const inserted=await db.from('contact_inquiries').insert({user_id:accountId,first_name:firstName,last_name:lastName,email,message}).select('id').single();
   if(inserted.error||!inserted.data)throw new Error('Contact insert failed');
   return json({message:'Your message has been sent to ZELEON administrators.',reference:inserted.data.id});
  }

  // Manager and Admin only; require active MFA-verified staff session.
  if(action!=='list'&&action!=='reply')return json({error:'Unknown operation.'},400);
  if(!token)return json({error:'Staff login required.'},401);
  const caller=createClient(url,anonKey,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
  const verified=await caller.auth.getUser();
  if(verified.error||!verified.data.user)return json({error:'Staff login required.'},401);
  const assurance=await caller.auth.mfa.getAuthenticatorAssuranceLevel();
  if(assurance.error||assurance.data.currentLevel!=='aal2')return json({error:'Staff MFA required.'},403);
  const [grant,assignment]=await Promise.all([caller.rpc('staff_session',{p_touch:false}),caller.from('staff_roles').select('role,status').eq('user_id',verified.data.user.id).maybeSingle()]);
  if(grant.error||grant.data!==true||assignment.error||assignment.data?.status!=='active'||!['admin','manager'].includes(assignment.data.role))return json({error:'Staff access denied.'},403);
  if(action==='list'){
   const items=await db.from('contact_inquiries').select('id,first_name,last_name,email,message,status,reply_body,replied_at,created_at').order('created_at',{ascending:false}).limit(200);
   if(items.error)throw items.error;
   return json({inquiries:items.data??[]});
  }
  const id=String(payload['id']??'');
  const reply=String(payload['reply']??'').trim();
  if(!/^[0-9a-f-]{36}$/i.test(id)||reply.length<10||reply.length>4000)return json({error:'Enter a reply of 10–4000 characters.'},400);
  const row=await db.from('contact_inquiries').update({status:'sending',processing_at:new Date().toISOString()}).eq('id',id).eq('status','open').select('id,first_name,last_name,email').maybeSingle();
  if(row.error)throw row.error;
  if(!row.data)return json({error:'This request has already been handled or is being processed. Refresh the inbox.'},409);
  try {
   const api=Deno.env.get('RESEND_API_KEY');
   if(!api)throw new Error('Email provider unavailable');
   const person=escapeHtml(row.data.first_name);
   const safeReply=escapeHtml(reply).replace(/\n/g,'<br>');
   const markup='<div style="background:#f1f7fd;padding:32px;color:#1b334d;font-family:Arial,sans-serif"><div style="max-width:560px;margin:auto;background:white;border-radius:16px;padding:32px"><h2 style="color:#1973aa">⚡ ZELEON</h2><p>Hello '+person+',</p><p>Our team has reviewed your Contact Us message.</p><p style="line-height:1.7;white-space:normal">'+safeReply+'</p><p>If this response does not resolve your concern, reply to this email to request information about an in-person consultation. An office visit can only be arranged after our team confirms the location and appointment.</p><p style="font-size:12px;color:#60738c">ZELEON Customer Experience · zeleon.store</p></div></div>';
   const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+api,'Content-Type':'application/json','Idempotency-Key':'contact-reply-'+id},body:JSON.stringify({from:'ZELEON <no-reply@zeleon.store>',to:[row.data.email],subject:'ZELEON — Response to your contact request',html:markup,reply_to:'no-reply@zeleon.store'})});
   if(!sent.ok)throw new Error('Email provider rejected the request: '+sent.status);
   const saved=await db.from('contact_inquiries').update({status:'replied',reply_body:reply,replied_by:verified.data.user.id,replied_at:new Date().toISOString(),processing_at:null}).eq('id',id).eq('status','sending');
   if(saved.error)throw saved.error;
   return json({message:'Reply sent by email and saved.'});
  }catch(e){
   console.error('ZELEON contact reply could not be completed',e instanceof Error?e.message:'unknown');
   // Preserve retryability; the email provider uses an idempotency key.
   await db.from('contact_inquiries').update({status:'open',processing_at:null}).eq('id',id).eq('status','sending');
   return json({error:'Email delivery was not confirmed. The request remains open.'},502);
  }
 } catch(e) {
  console.error('ZELEON contact request failed',e instanceof Error?e.message:'unknown');
  return json({error:'Unable to complete the contact request.'},503);
 }
});
