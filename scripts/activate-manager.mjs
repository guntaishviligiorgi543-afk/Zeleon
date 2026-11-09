// Run interactively as the account owner. No service key, saved credentials,
// customer UI changes, or direct role writes. Uses the deployed bootstrap API.
import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const target='81282c6b-37a8-42b9-8e46-409f56b2fb05';
const email='guntaishviligiorgi543@gmail.com';
const config=await readFile(new URL('../src/environments/environment.ts',import.meta.url),'utf8');
const url=config.match(/supabaseUrl:\s*'([^']+)'/)[1];
const key=config.match(/supabasePublishableKey:\s*'([^']+)'/)[1];
if(url!=='https://nunxmgltzvknnmkdvjsw.supabase.co') throw Error('Unexpected project');
if(!process.stdin.isTTY) throw Error('Run this helper in your own interactive terminal.');
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
async function hidden(label) {
  process.stdout.write(label);
  const silent=new Writable({write(_chunk,_encoding,done){done();}});
  const terminal=createInterface({input:process.stdin,output:silent,terminal:true});
  try { return await terminal.question(''); }
  finally { terminal.close();process.stdout.write('\n'); }
}
function check(error,message) { if(error) throw Error(message); }
async function passwordLogin() {
  let password=await hidden(`Current password for ${email} (hidden): `);
  try {
    const result=await client.auth.signInWithPassword({email,password});
    check(result.error,'Password sign-in rejected. Use your normal ZELEON password; no account settings were changed.');
    if(result.data.user?.id!==target) throw Error('Unexpected account; stopped.');
  } finally {password='';}
}
async function verifyTotp() {
  const factors=await client.auth.mfa.listFactors();
  check(factors.error,'Could not read your MFA factors.');
  let factor=factors.data.totp.find(item=>item.status==='verified');
  let qrServer;
  if(!factor) {
    const enrollment=await client.auth.mfa.enroll({factorType:'totp',friendlyName:`ZELEON Manager ${new Date().toISOString().slice(0,10)}`});
    check(enrollment.error,'TOTP enrollment failed. Check existing unverified factors in your Auth account.');
    factor=enrollment.data;
    const path='/'+randomBytes(24).toString('hex');
    const qr=enrollment.data.totp.qr_code.replaceAll('"','&quot;');
    // QR exists in memory only, served at an unpredictable loopback-only URL.
    qrServer=createServer((req,res)=>{
      if(req.url!==path || req.method!=='GET') {res.writeHead(404);res.end();return;}
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; img-src data:; style-src 'unsafe-inline'"});
      res.end(`<title>ZELEON authenticator setup</title><main style="font:20px sans-serif;padding:32px"><h1>ZELEON Manager authenticator</h1><p>Scan with your authenticator app, then enter its six-digit code in the terminal.</p><img width="300" height="300" src="${qr}"><p>Close this page after verification. Do not share the QR code.</p></main>`);
    });
    await new Promise(resolve=>qrServer.listen(0,'127.0.0.1',resolve));
    console.log(`Open this private local QR page: http://127.0.0.1:${qrServer.address().port}${path}`);
  }
  try {
    let code=await hidden('Current six-digit authenticator code (hidden): ');
    try {
      if(!/^\d{6}$/.test(code)) throw Error('A six-digit TOTP code is required.');
      const verification=await client.auth.mfa.challengeAndVerify({factorId:factor.id,code});
      check(verification.error,'TOTP verification rejected. Check the code and device clock.');
    } finally {code='';}
    const assurance=await client.auth.mfa.getAuthenticatorAssuranceLevel();
    check(assurance.error,'Could not verify MFA assurance.');
    if(assurance.data.currentLevel!=='aal2') throw Error('MFA did not reach aal2.');
    console.log('Verified TOTP and aal2.');
  } finally {if(qrServer) await new Promise(resolve=>qrServer.close(resolve));}
}
async function openGrant() {
  const opened=await client.rpc('staff_open_session');
  check(opened.error,'Staff grant rejected. Fresh password and TOTP verification must complete within five minutes.');
  const grant=await client.rpc('staff_session');
  check(grant.error,'Could not check staff grant.');
  if(grant.data!==true) throw Error('Staff grant is not valid.');
  console.log('Verified a live server-side Manager grant.');
}
let succeeded=false;
try {
  console.log('ZELEON owner activation. Inputs are hidden and never saved.');
  await passwordLogin();
  await verifyTotp();
  const assignment=await client.from('staff_roles').select('role,status').eq('user_id',target).maybeSingle();
  check(assignment.error,'Could not read your staff assignment.');
  if(!assignment.data) {
    let secret=process.env.STAFF_BOOTSTRAP_SECRET || await hidden('Existing STAFF_BOOTSTRAP_SECRET from your private records (hidden): ');
    try {
      if(secret.length<32 || secret.length>512) throw Error('The configured bootstrap secret must contain 32–512 characters.');
      const session=await client.auth.getSession();
      check(session.error || !session.data.session?.access_token, 'Could not obtain the authenticated session token.');
      const response=await fetch(url+'/functions/v1/bootstrap-manager',{
        method:'POST',
        headers:{
          apikey:key,
          Authorization:`Bearer ${session.data.session.access_token}`,
          'Content-Type':'application/json',
          'x-staff-bootstrap-secret':secret,
        },
        body:'{}',
      });
      let responseBody={};
      try { responseBody=await response.json(); } catch {}
      if(response.status!==200) {
        const reason=typeof responseBody.error==='string' ? responseBody.error : 'No safe server reason returned.';
        throw Error(`Bootstrap rejected (HTTP ${response.status}): ${reason}`);
      }
    } finally {secret='';}
    console.log('Bootstrap API completed.');
  } else if(assignment.data.role!=='manager' || assignment.data.status!=='active') {
    throw Error('An unexpected staff assignment exists; stopped without changing it.');
  }
  const verified=await client.from('staff_roles').select('role,status').eq('user_id',target).single();
  check(verified.error,'Could not verify Manager assignment.');
  if(verified.data.role!=='manager'||verified.data.status!=='active') throw Error('Manager activation not confirmed.');
  console.log(`Verified active Manager: ${target}`);
  // Enrollment/secret configuration may take time: use fresh authentication.
  await passwordLogin();await verifyTotp();await openGrant();
  const audits=await client.from('staff_audit_logs').select('id').eq('action','manager_bootstrapped').eq('target_user_id',target);
  check(audits.error,'Manager audit read rejected.');
  if(audits.data.length!==1) throw Error('Expected exactly one bootstrap audit record.');
  console.log('Verified Manager-only bootstrap audit access.');
  check((await client.rpc('staff_session',{p_revoke:true})).error,'Revocation failed.');
  const revoked=await client.rpc('staff_session');
  if(revoked.error||revoked.data!==false) throw Error('Revocation was not enforced.');
  console.log('Verified explicit grant revocation.');
  if(process.argv.includes('--verify-timeout')) {
    await passwordLogin();await verifyTotp();await openGrant();
    console.log('Waiting fifteen minutes and five seconds without renewing the grant. Leave this terminal open.');
    await new Promise(resolve=>setTimeout(resolve,905000));
    const expired=await client.rpc('staff_session',{p_touch:true});
    if(expired.error||expired.data!==false) throw Error('Expired-grant rejection was not confirmed.');
    console.log('Verified fifteen-minute inactivity expiration and renewal rejection.');
  }
  succeeded=true;
  console.log('Owner-side checks completed. Tell Codex completion status only; never send passwords, tokens, codes or secrets.');
} catch(error) {
  console.error(error instanceof Error?error.message:'Activation failed.');process.exitCode=1;
} finally {
  // Only the helper session is signed out; website customer sessions are preserved.
  await client.auth.signOut({scope:'local'});
  if(succeeded) console.log('Helper session signed out. Sign in through ZELEON normally for the browser checks.');
}
