import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
const origins=new Set(["https://zeleon.store","https://www.zeleon.store","http://localhost:4200"]);
const url=Deno.env.get("SUPABASE_URL")||"";
const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const encoder=new TextEncoder();
const hex=(a:Uint8Array)=>Array.from(a).map(x=>x.toString(16).padStart(2,"0")).join("");
async function sha(v:string){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(v))))}
function token(){return hex(crypto.getRandomValues(new Uint8Array(32)))}
function headers(origin:string|null){return {"Content-Type":"application/json","Vary":"Origin","Access-Control-Allow-Headers":"content-type,authorization,apikey,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS",...(origin&&origins.has(origin)?{"Access-Control-Allow-Origin":origin}:{})}}
function reply(data:unknown,status=200,origin:string|null=null){return new Response(JSON.stringify(data),{status,headers:headers(origin)})}
const generic={message:"If eligible, a confirmation email will be sent."};
async function send(to:string,subject:string,body:string,unsubscribe?:string){
 const api=Deno.env.get("RESEND_API_KEY");if(!api)throw Error("Email provider unavailable");
 const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+api,"Content-Type":"application/json"},body:JSON.stringify({from:"ZELEON <no-reply@zeleon.store>",to:[to],subject,html:'<div style="background:#eef7ff;padding:36px;font-family:Arial,sans-serif;color:#17324d"><div style="max-width:540px;margin:auto;background:white;border-radius:16px;padding:32px"><h1 style="color:#267fb8">⚡ ZELEON</h1>'+body+'<p style="font-size:12px;color:#64819b">ZELEON · zeleon.store</p></div></div>',...(unsubscribe?{headers:{"List-Unsubscribe":"<"+unsubscribe+">"}}:{})})});
 if(!r.ok)throw Error("Resend rejected request "+r.status);
}
async function captcha(value:string,ip:string){const secret=Deno.env.get("NEWSLETTER_TURNSTILE_SECRET");if(!secret||!value)return false;const f=new FormData();f.set("secret",secret);f.set("response",value);if(ip)f.set("remoteip",ip);try{const r=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:f});const d=await r.json();return d.success===true&&(!d.hostname||["zeleon.store","www.zeleon.store","localhost"].includes(d.hostname))}catch{return false}}
Deno.serve(async(req)=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
 if(origin&&!origins.has(origin))return reply({error:"Origin not allowed"},403,origin);
 if(req.method!=="POST")return reply({error:"Method not allowed"},405,origin);
 if(Number(req.headers.get("content-length")||0)>8192)return reply({error:"Payload too large"},413,origin);
 let input:any;try{input=await req.json()}catch{return reply({error:"Invalid JSON"},400,origin)}
 const action=input?.action;
 try{
 if(action==="subscribe"){
  const email=String(input.email||"").trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||input.consent!==true)return reply({error:"Valid email and consent required"},400,origin);
  const ip=(req.headers.get("cf-connecting-ip")||"").slice(0,64);
  if(!await captcha(String(input.captcha||""),ip))return reply({error:"Human verification required"},403,origin);
  const h=await sha(email),ih=await sha(ip||"unknown");
  const a=await admin.rpc("newsletter_allow_request",{p_key:"email:"+h,p_limit:3,p_window_seconds:3600});
  const b=await admin.rpc("newsletter_allow_request",{p_key:"ip:"+ih,p_limit:10,p_window_seconds:3600});
  if(a.error||b.error)return reply({error:"Temporarily unavailable"},503,origin);
  if(a.data!==true||b.data!==true)return reply(generic,200,origin);
  const raw=token(),hash=await sha(raw);
  const result=await admin.rpc("newsletter_issue_confirmation",{p_email:email,p_token_hash:hash,p_source:"website",p_policy:"v1"});
  if(result.error)throw result.error;
  if(result.data===true){
   const link="https://zeleon.store/newsletter/confirm?token="+raw;
   await send(email,"Confirm your ZELEON newsletter subscription",'<h2>Confirm your subscription</h2><p>Thank you for your interest in ZELEON. Confirm your email to receive product news and updates.</p><p><a href="'+link+'">Confirm subscription</a></p><p>If you did not request this, ignore this message.</p>');
  }
  return reply(generic,200,origin);
 }
 if(action==="status"){
  const raw=String(input.token||"");
  if(!/^[0-9a-f]{64}$/.test(raw))return reply({status:"invalid"},200,origin);
  const result=await admin.rpc("newsletter_token_status",{p_hash:await sha(raw)});
  if(result.error)throw result.error;
  return reply({status:result.data||"invalid"},200,origin);
 }
 if(action==="confirm"){
  const raw=String(input.token||"");if(!/^[0-9a-f]{64}$/.test(raw))return reply({error:"Invalid token"},400,origin);
  const result=await admin.rpc("newsletter_confirm_token",{p_hash:await sha(raw)});
  if(result.error)throw result.error;
  if(!result.data){
   const state=await admin.rpc("newsletter_token_status",{p_hash:await sha(raw)});
   if(state.error)throw state.error;
   if(state.data==="confirmed")return reply({message:"This subscription is already confirmed.",status:"already_confirmed"},200,origin);
   return reply({error:state.data==="expired"?"This confirmation link has expired. Please subscribe again.":"This confirmation link is invalid or has already been used.",status:state.data||"invalid"},400,origin);
  }
  const email=String(result.data);
  const unsub=token();
  const issued=await admin.rpc("newsletter_issue_unsubscribe",{p_email:email,p_hash:await sha(unsub)});
  if(issued.error)throw issued.error;
  const link="https://zeleon.store/newsletter/unsubscribe?token="+unsub;
  await send(email,"Welcome to ZELEON Newsletter",'<h2>You are subscribed!</h2><p>Thanks for joining the ZELEON community. Discover new flavors and updates.</p><p><a href="https://zeleon.store/shop/">Find Your Energy</a></p><p><a href="'+link+'">Unsubscribe</a></p>',link);
  return reply({message:"Subscription confirmed."},200,origin);
 }
 if(action==="unsubscribe"){
  const raw=String(input.token||"");if(!/^[0-9a-f]{64}$/.test(raw))return reply({error:"Invalid token"},400,origin);
  const result=await admin.rpc("newsletter_unsubscribe_token",{p_hash:await sha(raw)});
  if(result.error)throw result.error;
  if(!result.data)return reply({message:"Subscription already cancelled or link expired."},200,origin);
  await send(String(result.data),"Your ZELEON newsletter subscription is cancelled",'<h2>Subscription cancelled</h2><p>Thank you for being with us. You will no longer receive newsletter updates.</p><p>You can rejoin anytime by subscribing again at <a href="https://zeleon.store/">ZELEON</a>.</p>');
  return reply({message:"Subscription cancelled."},200,origin);
 }
 return reply({error:"Unknown action"},400,origin);
 }catch(e){console.error("Newsletter operation failed",e instanceof Error?e.message:"unknown");return reply({error:"Unable to complete request"},500,origin)}
});