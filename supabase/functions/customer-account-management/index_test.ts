import { assertEquals, assert } from 'jsr:@std/assert@1';
import { handleRequest } from './index.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

function setup(options: {role?: string; aal?: string; session?: boolean; rpcError?: object; queryError?: boolean; emailOk?: boolean} = {}) {
  Deno.env.set('SUPABASE_URL', 'https://example.supabase.co');
  Deno.env.set('SUPABASE_ANON_KEY', 'test-anon');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service');
  Deno.env.set('RESEND_API_KEY', 'test-resend');
  const calls: Array<{name: string; args: unknown}> = [];
  const emails: RequestInit[] = [];
  const record = {id:'request',target_user_id:'customer',requested_by:'admin',action:'suspend',status:'executed',reason:'Evidence',manager_reply:'Reviewed evidence'};
  function query(table: string, caller: boolean) {
    const result = {data: options.queryError && !caller ? null : table === 'staff_roles' ? [{user_id:'manager'}] : table === 'customer_account_states' ? [{user_id:'customer',status:'suspended'}] : [record],error: options.queryError && !caller ? new Error('database error') : null};
    const builder = {
      select: (_columns: string) => builder,
      eq: (key: string,value: unknown) => {calls.push({name:table+'.eq',args:{key,value}});return builder;},
      order: () => builder,
      range: () => builder,
      returns: () => builder,
      single: async () => ({data:{role:options.role ?? 'admin',status:'active'},error:null}),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    return builder;
  }
  const factory = ((_url: string,key: string) => ({
    auth: {
      getClaims: async () => ({data:{claims:{sub:'admin',aal:options.aal ?? 'aal2'}},error:null}),
      admin: {
        listUsers: async ({page}: {page:number}) => {
          calls.push({name:'listUsers',args:page});
          return {data:{users:[{id:page === 1 ? 'customer' : 'second',email:'customer@example.test',created_at:'2026-11-01'}],nextPage:page === 1 ? 2 : null},error:null};
        },
        getUserById: async (id: string) => ({data:{user:{email:id+'@example.test'}},error:null}),
      },
    },
    from: (table: string) => query(table,key === 'test-anon'),
    rpc: async (name: string,args: unknown) => {
      calls.push({name,args});
      return name === 'staff_session' ? {data:options.session ?? true,error:null} : {data:options.rpcError ? null : record,error:options.rpcError ?? null};
    },
  })) as unknown as typeof createClient;
  const send = ((_url: string | URL | Request,init?: RequestInit) => {emails.push(init!);return Promise.resolve(new Response('{}',{status:options.emailOk === false ? 500 : 200}));}) as typeof fetch;
  const request = (body: unknown,extra: RequestInit = {}) => handleRequest(new Request('https://example.test', {method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json',Origin:'https://zeleon.store'},body:JSON.stringify(body),...extra}),factory,send);
  return {request,calls,emails};
}

Deno.test('rejects missing authorization and unknown origins before privileged work', async () => {
  const test=setup();
  assertEquals((await test.request({action:'list'},{headers:{}})).status,401);
  assertEquals((await test.request({action:'list'},{headers:{Origin:'https://attacker.test'}})).status,403);
  assertEquals(test.calls.length,0);
});
Deno.test('allows CORS preflight with all Supabase client headers', async () => {
  const test=setup();
  const response=await test.request(null,{method:'OPTIONS',body:null});
  assertEquals(response.status,204);
  assert(response.headers.get('Access-Control-Allow-Headers')?.includes('x-client-info'));
});
for (const options of [{aal:'aal1'},{session:false},{role:'support'}]) {
  Deno.test('rejects unverified staff '+JSON.stringify(options),async()=>{
    const test=setup(options);
    assertEquals((await test.request({action:'execute',requestId:'request'})).status,403);
    assert(!test.calls.some(call=>call.name==='customer_account_transition'));
    assertEquals(test.emails.length,0);
  });
}
Deno.test('paginates customers and limits Admin request history to the owner',async()=>{
  const test=setup();
  const response=await test.request({action:'list'});
  assertEquals(response.status,200);
  const body=await response.json();
  assertEquals(body.users.length,2);
  assertEquals(body.users[0].status,'suspended');
  assertEquals(test.calls.filter(c=>c.name==='listUsers').map(c=>c.args),[1,2]);
  assert(test.calls.some(c=>c.name==='customer_account_actions.eq'&&JSON.stringify(c.args)===JSON.stringify({key:'requested_by',value:'admin'})));
});
Deno.test('fails closed when directory restriction state cannot be read',async()=>{
  const test=setup({queryError:true});
  assertEquals((await test.request({action:'list'})).status,503);
});
Deno.test('Managers cannot request or execute; Admins cannot decide',async()=>{
  for(const action of ['request','execute'])assertEquals((await setup({role:'manager'}).request({action})).status,403);
  assertEquals((await setup().request({action:'decide'})).status,403);
});
Deno.test('database authorization failures send no email and preserve status',async()=>{
  const test=setup({rpcError:{code:'42501',message:'Manager approval required'}});
  const response=await test.request({action:'execute',requestId:'request'});
  assertEquals(response.status,403);
  assertEquals((await response.json()).error,'Manager approval required');
  assertEquals(test.emails.length,0);
});
Deno.test('approval calls only the decision transition and not execution',async()=>{
  const test=setup({role:'manager'});
  assertEquals((await test.request({action:'decide',requestId:'request',decision:'approved',reply:'Evidence confirmed'})).status,200);
  assertEquals(test.calls.filter(c=>c.name==='customer_account_transition').map(c=>(c.args as {p_action:string}).p_action),['decide']);
  assertEquals(test.emails.length,1);
});
Deno.test('email rejection does not report a committed action as failed',async()=>{
  const test=setup({emailOk:false});
  const response=await test.request({action:'execute',requestId:'request'});
  assertEquals(response.status,200);
  assertEquals((await response.json()).emailSent,false);
  assertEquals(test.emails.length,1);
});
Deno.test('execution uses caller JWT transition and sends customer notification',async()=>{
  const test=setup();
  const response=await test.request({action:'execute',requestId:'request'});
  assertEquals(response.status,200);
  assertEquals((await response.json()).emailSent,true);
  assertEquals(JSON.parse(test.emails[0].body as string).to,['customer@example.test']);
  assertEquals(test.calls.filter(c=>c.name==='customer_account_transition').length,1);
});
