// Read-only public smoke checks. Uses only the existing browser publishable key.
import { readFile } from 'node:fs/promises';
const config=await readFile(new URL('../src/environments/environment.ts',import.meta.url),'utf8');
const url=config.match(/supabaseUrl:\s*'([^']+)'/)[1];
const key=config.match(/supabasePublishableKey:\s*'([^']+)'/)[1];
if(url!=='https://nunxmgltzvknnmkdvjsw.supabase.co') throw Error('Unexpected project');
const after=process.argv.includes('--after');
const checks=[
  ...['products','categories','product_images'].map(t=>({name:`public ${t}`,path:`/rest/v1/${t}?select=id&limit=1`,statuses:[200]})),
  {name:'Auth settings available',path:'/auth/v1/settings',statuses:[200]},
  ...['staff_roles','staff_audit_logs'].map(t=>({name:`anonymous denied ${t}`,path:`/rest/v1/${t}?select=*&limit=1`,statuses:[401,403]})),
];
if(after) {
  checks.push(...['staff_session','staff_open_session','staff_manage','staff_bootstrap_manager','staff_bootstrap_attempt'].map(fn=>({
    name:`anonymous denied RPC ${fn}`,path:`/rest/v1/rpc/${fn}`,method:'POST',
    body:fn==='staff_manage'?{p_action:'assign',p_target_user_id:'81282c6b-37a8-42b9-8e46-409f56b2fb05',p_role:'manager'}:
      fn==='staff_bootstrap_manager'?{p_user_id:'81282c6b-37a8-42b9-8e46-409f56b2fb05',p_session_id:'00000000-0000-4000-8000-000000000000'}:
      fn==='staff_bootstrap_attempt'?{p_user_id:'81282c6b-37a8-42b9-8e46-409f56b2fb05'}:{},statuses:[401,403]
  })));
  for(const fn of ['staff-management','bootstrap-manager']) {
    checks.push({name:`unauthenticated denied ${fn}`,path:`/functions/v1/${fn}`,method:'POST',body:{},statuses:[401]});
    const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
    const forged=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:'81282c6b-37a8-42b9-8e46-409f56b2fb05',role:'authenticated',aal:'aal2',exp:Math.floor(Date.now()/1000)+300})}.${Buffer.alloc(32).toString('base64url')}`;
    checks.push({name:`forged JWT denied ${fn}`,path:`/functions/v1/${fn}`,method:'POST',body:{},authorization:`Bearer ${forged}`,statuses:[401]});
  }
}
let failed=0;
for(const check of checks) {
  const response=await fetch(url+check.path,{method:check.method??'GET',headers:{apikey:key,'Content-Type':'application/json',...(check.authorization?{Authorization:check.authorization}:{})},...(check.body?{body:JSON.stringify(check.body)}:{})});
  await response.arrayBuffer();
  const ok=check.statuses.includes(response.status);
  console.log(`${ok?'PASS':'FAIL'} ${check.name}: HTTP ${response.status}`);
  if(!ok) failed++;
}
if(failed) process.exitCode=1;
