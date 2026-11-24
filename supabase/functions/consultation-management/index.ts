import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const supaUrl = Deno.env.get('SUPABASE_URL') || '';
const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const db = createClient(supaUrl,service,{auth:{persistSession:false,autoRefreshToken:false}});
const origins = new Set(['https://zeleon.store','https://www.zeleon.store','http://localhost:4200']);
type Role = 'manager'|'admin'|'support';
const asString=(value:unknown)=>typeof value==='string'?value.trim():'';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const asUUID=(s:unknown)=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)?s:null;
const stamp=(s:unknown)=>typeof s==='string'&&Number.isFinite(Date.parse(s))?new Date(s):null;
function tbilisiSlot(start:Date,end:Date,windows:Array<{weekday:number;start_minute:number;end_minute:number}>):boolean{
 // Tbilisi observes UTC+04:00; no DST. Count weekdays using shifted UTC clock.
 const local=new Date(start.getTime()+4*3600_000);
 const localEnd=new Date(end.getTime()+4*3600_000);
 if(local.toISOString().slice(0,10)!==localEnd.toISOString().slice(0,10))return false;
 const weekday=local.getUTCDay(),minute=local.getUTCHours()*60+local.getUTCMinutes();
 const endMinute=localEnd.getUTCHours()*60+localEnd.getUTCMinutes();
 return weekday>=1 && weekday<=5 && windows.some(w=>w.weekday===weekday&&minute===w.start_minute&&endMinute===w.end_minute);
}
const localDate=(d:Date)=>new Date(d.getTime()+4*3600_000).toISOString().slice(0,10);
const weekMonday=(date:string)=>{const d=new Date(date+'T00:00:00Z');const delta=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-delta);return d.toISOString().slice(0,10);};
const managerLimit=async(managerId:string,start:Date,excludeId?:string):Promise<boolean>=>{
 const day=localDate(start),monday=weekMonday(day);
 const end=new Date(monday+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+5);
 const query=await db.from('consultation_meetings').select('id,starts_at,status').eq('manager_id',managerId)
 .in('status',['upcoming','postponed','completed']).gte('starts_at',new Date(monday+'T00:00:00+04:00').toISOString())
 .lt('starts_at',new Date(end.toISOString().slice(0,10)+'T00:00:00+04:00').toISOString()).limit(200);
 if(query.error)throw query.error;
 const list=(query.data||[]).filter(m=>m.id!==excludeId);
 return list.length<20 && list.filter(m=>localDate(new Date(m.starts_at))===day).length<4;
};
const isBlocked=async(managerId:string,start:Date):Promise<boolean>=>{
 const result=await db.from('manager_blocked_dates').select('blocked_date').eq('manager_id',managerId).eq('blocked_date',localDate(start)).maybeSingle();
 if(result.error)throw result.error;return !!result.data;
};
const sameSlot=(start:Date,end:Date,windows:Array<{weekday:number;start_minute:number;end_minute:number}>)=>tbilisiSlot(start,end,windows);
async function email(to:string,subject:string,body:string,idempotency:string):Promise<void>{
 const key=Deno.env.get('RESEND_API_KEY'); if(!key)throw new Error('Email provider unavailable');
 const markup='<div style="background:#eaf2fb;padding:35px;font-family:Arial,sans-serif;color:#20324d"><div style="max-width:540px;margin:auto;background:white;border-radius:18px;padding:32px"><h2 style="color:#137eb4">⚡ ZELEON</h2>'+body+'<p style="font-size:12px;color:#6b7b92">ZELEON Customer Experience · zeleon.store</p></div></div>';
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':idempotency},body:JSON.stringify({from:'ZELEON <no-reply@zeleon.store>',to:[to],subject,html:markup})});
 if(!response.ok)throw new Error('Email delivery rejected '+response.status);
}
Deno.serve(async(req)=>{
 const origin=req.headers.get('origin');const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization,content-type,apikey,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS',...(origin&&origins.has(origin)?{'Access-Control-Allow-Origin':origin}:{})};
 const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(origin&&!origins.has(origin))return respond({error:'Origin denied'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return respond({error:'Method not allowed'},405);
 if(Number(req.headers.get('content-length')||0)>12000)return respond({error:'Payload too large'},413);
 const match=/^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization')||'');if(!match)return respond({error:'Staff sign-in required'},401);
 if(!supaUrl||!anon||!service)return respond({error:'Service unavailable'},503);
 let body:Record<string,unknown>;try{const v=await req.json();if(!v||typeof v!=='object'||Array.isArray(v))throw Error();body=v;}catch{return respond({error:'Invalid JSON'},400);}
 try{
  const userResult=await db.auth.getUser(match[1]);if(userResult.error||!userResult.data.user)return respond({error:'Session expired'},401);
  const user=userResult.data.user;
  const caller=createClient(supaUrl,anon,{global:{headers:{Authorization:'Bearer '+match[1]}},auth:{persistSession:false,autoRefreshToken:false}});
  const [assurance,grant,assignment]=await Promise.all([
   caller.auth.getClaims(match[1]),
   caller.rpc('staff_session',{p_touch:false}),
   caller.from('staff_roles').select('role,status').eq('user_id',user.id).maybeSingle()
  ]);
  if(assurance.error||assurance.data?.claims.aal!=='aal2'||grant.error||grant.data!==true||assignment.error||assignment.data?.status!=='active')return respond({error:'Active MFA staff session required'},403);
  const role=assignment.data.role as Role;
  if(!['manager','admin','support'].includes(role))return respond({error:'Forbidden'},403);
  const action=asString(body['action']);
  // Support sees only manager identities and busy slots, never other customer details.
  if(action==='calendar'){
   const [managers,slots]=await Promise.all([
    db.from('staff_roles').select('user_id').eq('role','manager').eq('status','active'),
    db.from('consultation_meetings').select('manager_id,starts_at,ends_at,status').in('status',['upcoming','postponed']).gte('ends_at',new Date().toISOString()).order('starts_at',{ascending:true}).limit(400)
   ]);
   if(managers.error||slots.error)throw Error('Calendar unavailable');
   const ids=managers.data.map(m=>m.user_id);
   const availability=await db.from('manager_availability').select('manager_id,weekday,start_minute,end_minute').in('manager_id',ids.length?ids:['00000000-0000-0000-0000-000000000000']);
   if(availability.error)throw availability.error;
   const blocked=await db.from('manager_blocked_dates').select('manager_id,blocked_date').in('manager_id',ids.length?ids:['00000000-0000-0000-0000-000000000000']).gte('blocked_date',localDate(new Date()));
   if(blocked.error)throw blocked.error;
   return respond({managers:ids,slots:slots.data,availability:availability.data,blocked:blocked.data});
  }
  if(action==='slots'){
   if(role!=='support'&&role!=='manager')return respond({error:'Staff only'},403);
   const managerId=asUUID(body['managerId']);
   if(role==='manager'&&managerId!==user.id)return respond({error:'Only your own calendar'},403);
   if(!managerId)return respond({error:'Choose manager'},400);
   const [w,busy,pending,blocked]=await Promise.all([
    db.from('manager_availability').select('weekday,start_minute,end_minute').eq('manager_id',managerId),
    db.from('consultation_meetings').select('starts_at,ends_at,status').eq('manager_id',managerId).in('status',['upcoming','postponed','completed']).gte('starts_at',new Date(Date.now()-86400000).toISOString()).limit(500),
    db.from('consultation_requests').select('proposed_at,duration_minutes').eq('manager_id',managerId).eq('status','pending_admin').gte('proposed_at',new Date().toISOString()).limit(200),
    db.from('manager_blocked_dates').select('blocked_date').eq('manager_id',managerId)
   ]);
   if(w.error||busy.error||pending.error||blocked.error)throw Error('Slots unavailable');
   const blockedDays=new Set((blocked.data||[]).map(b=>b.blocked_date));
   const free:Array<{start:string;end:string;duration:number}>=[];
   const bookings=busy.data||[];
   for(let i=0;i<35;i++){
    const localNow=new Date(Date.now()+4*3600_000+i*86400000);
    const day=localNow.toISOString().slice(0,10);
    const wd=localNow.getUTCDay();if(wd===0||wd===6||blockedDays.has(day))continue;
    const monday=weekMonday(day);
    const bookedDay=bookings.filter(b=>localDate(new Date(b.starts_at))===day);
    const bookedWeek=bookings.filter(b=>weekMonday(localDate(new Date(b.starts_at)))===monday);
    if(bookedDay.length>=4||bookedWeek.length>=20)continue;
    for(const win of (w.data||[]).filter(v=>v.weekday===wd).sort((a,b)=>a.start_minute-b.start_minute)){
     const start=new Date(day+'T00:00:00+04:00');start.setTime(start.getTime()+win.start_minute*60000);
     const end=new Date(start.getTime()+(win.end_minute-win.start_minute)*60000);
     if(start.getTime()<=Date.now()+60000)continue;
     if(bookings.some(b=>new Date(b.starts_at)<end&&new Date(b.ends_at)>start))continue;
     if((pending.data||[]).some(b=>new Date(b.proposed_at)<end&&new Date(new Date(b.proposed_at).getTime()+b.duration_minutes*60000)>start))continue;
     free.push({start:start.toISOString(),end:end.toISOString(),duration:win.end_minute-win.start_minute});
    }
   }
   return respond({slots:free});
  }
  if(action==='list'){
   const [requests,meetings,notes]=await Promise.all([
    role==='support'?db.from('consultation_requests').select('id,conversation_id,customer_name,reason,rejected_reason,manager_id,proposed_at,duration_minutes,status,created_at').eq('support_id',user.id).order('created_at',{ascending:false}).limit(200):db.from('consultation_requests').select('*').order('created_at',{ascending:false}).limit(300),
    role==='support'?db.from('consultation_meetings').select('id,manager_id,starts_at,ends_at,status,reschedule_pending,customer_notification_pending,support_id').eq('support_id',user.id).order('starts_at',{ascending:false}).limit(300):db.from('consultation_meetings').select('*').order('starts_at',{ascending:false}).limit(300),
    role==='support'?db.from('meeting_notifications').select('*').eq('recipient_role','support').order('created_at',{ascending:false}).limit(100):role==='manager'?db.from('meeting_notifications').select('*').eq('recipient_role','manager').order('created_at',{ascending:false}).limit(100):db.from('meeting_notifications').select('*').eq('recipient_role','admin').order('created_at',{ascending:false}).limit(100)
   ]);
   if(requests.error||meetings.error||notes.error)throw Error('Meetings cannot be loaded');
   // Support may view associated customer only through its own linked request.
   const ownMeetings=role==='manager'?meetings.data.filter(m=>m.manager_id===user.id):meetings.data;
   const visibleMeetings=role==='manager'?ownMeetings:role==='support'?ownMeetings:meetings.data;
   const noteMeetingIds=new Set(visibleMeetings.map(m=>m.id));
   const visibleNotes=(notes.data||[]).filter(n=>noteMeetingIds.has(n.meeting_id));
   const history=role==='manager'?await db.from('meeting_status_history').select('meeting_id,actor_id,from_status,to_status,note,created_at').in('meeting_id',visibleMeetings.length?visibleMeetings.map(m=>m.id):['00000000-0000-0000-0000-000000000000']).order('created_at',{ascending:false}).limit(400):{data:[],error:null};
   if(history.error)throw history.error;
   return respond({requests:requests.data,meetings:visibleMeetings,notifications:visibleNotes,history:history.data});
  }
  if(action==='availability'){
   if(role!=='manager')return respond({error:'Manager only'},403);
   const windows=body['windows'];
   if(!Array.isArray(windows)||windows.length>20)return respond({error:'Maximum 20 weekly slots'},400);
   const accepted:Array<{manager_id:string;weekday:number;start_minute:number;end_minute:number}>=[];
   for(const item of windows){
    if(!item||!Number.isInteger(item.weekday)||!Number.isInteger(item.start_minute)||!Number.isInteger(item.end_minute)||item.weekday<1||item.weekday>5||item.start_minute<0||item.end_minute>1440||item.end_minute<=item.start_minute) return respond({error:'Invalid weekly hours'},400);
    accepted.push({manager_id:user.id,weekday:item.weekday,start_minute:item.start_minute,end_minute:item.end_minute});
   }
   const counts=new Map<number,number>();
   for(const w of accepted){counts.set(w.weekday,(counts.get(w.weekday)||0)+1);}
   if([...counts.values()].some(n=>n>4))return respond({error:'Maximum four slots per workday'},400);
   for(const [i,w] of accepted.entries()){
    if(accepted.some((v,j)=>j!==i&&v.weekday===w.weekday&&v.start_minute<w.end_minute&&v.end_minute>w.start_minute))
     return respond({error:'Availability slots must not overlap'},400);
   }
   const deleted=await db.from('manager_availability').delete().eq('manager_id',user.id);if(deleted.error)throw deleted.error;
   if(accepted.length){const created=await db.from('manager_availability').insert(accepted);if(created.error)throw created.error;}
   return respond({message:'Availability saved'});
  }
  if(action==='block_date'){
   if(role!=='manager')return respond({error:'Manager only'},403);
   const date=asString(body['date']),reason=asString(body['reason'])||'Unavailable';
   if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||reason.length>500)return respond({error:'Invalid date'},400);
   const write=body['blocked']===false
    ?await db.from('manager_blocked_dates').delete().eq('manager_id',user.id).eq('blocked_date',date)
    :await db.from('manager_blocked_dates').upsert({manager_id:user.id,blocked_date:date,reason});
   if(write.error)throw write.error;
   return respond({message:body['blocked']===false?'Day reopened':'Day blocked for future requests'});
  }
  if(action==='request'){
   if(role!=='support')return respond({error:'Support only'},403);
   const conversationId=asUUID(body['conversationId']),managerId=asUUID(body['managerId']),reason=asString(body['reason']);
   const start=stamp(body['start']);const duration=Number(body['duration']||45);
   if(!conversationId||!managerId||!start||reason.length<10||reason.length>2000||!Number.isInteger(duration)||duration<15||duration>180||start.getTime()<=Date.now())return respond({error:'Complete the consultation request with a future date and valid reason'},400);
   if(body['customerAgreed']!==true)return respond({error:'Confirm the customer agreed to the proposed time'},400);
   const conversation=await db.from('support_conversations').select('id,customer_user_id,customer_first_name,customer_last_name,customer_email,assigned_support_id,subject').eq('id',conversationId).maybeSingle();
   if(conversation.error||!conversation.data||conversation.data.assigned_support_id!==user.id)return respond({error:'Claim this customer conversation before escalating'},403);
   // The explicitly invoked Schedule Consultation action works for any claimed support chat.
   const manager=await db.from('staff_roles').select('role,status').eq('user_id',managerId).maybeSingle();
   if(manager.error||manager.data?.role!=='manager'||manager.data?.status!=='active')return respond({error:'Manager unavailable'},400);
   const end=new Date(start.getTime()+duration*60000);
   const windows=await db.from('manager_availability').select('weekday,start_minute,end_minute').eq('manager_id',managerId);
   if(windows.error||!sameSlot(start,end,windows.data??[]))return respond({error:'Choose a published manager appointment slot'},400);
   if(await isBlocked(managerId,start))return respond({error:'Manager blocked this date'},409);
   if(!await managerLimit(managerId,start))return respond({error:'Daily/weekly meeting limit reached'},409);
   const held=await db.from('consultation_requests').select('proposed_at,duration_minutes').eq('manager_id',managerId).eq('status','pending_admin').lt('proposed_at',end.toISOString()).gte('proposed_at',new Date(start.getTime()-180*60000).toISOString());
   if(held.error)throw held.error;
   if((held.data||[]).some(r=>new Date(new Date(r.proposed_at).getTime()+r.duration_minutes*60000)>start))return respond({error:'Appointment is awaiting Admin approval'},409);
   const busy=await db.from('consultation_meetings').select('id').eq('manager_id',managerId).in('status',['upcoming','postponed']).lt('starts_at',end.toISOString()).gt('ends_at',start.toISOString()).limit(1);
   if(busy.error||busy.data?.length)return respond({error:'Manager is already booked'},409);
   const existing=await db.from('consultation_requests').select('id,status').eq('conversation_id',conversationId).maybeSingle();
   if(existing.error)throw existing.error;
   if(existing.data&&existing.data.status!=='rejected'&&existing.data.status!=='cancelled')return respond({error:'This conversation already has an active consultation request'},409);
   const details={conversation_id:conversationId,customer_id:conversation.data.customer_user_id,support_id:user.id,customer_name:[conversation.data.customer_first_name,conversation.data.customer_last_name].filter(Boolean).join(' ')||'Customer',customer_email:conversation.data.customer_email,reason,manager_id:managerId,proposed_at:start.toISOString(),duration_minutes:duration,customer_agreed:true,rejected_reason:null,status:'pending_admin'};
   const inserted=existing.data?await db.from('consultation_requests').update(details).eq('id',existing.data.id).select('id').single():await db.from('consultation_requests').insert(details).select('id').single();
   if(inserted.error)return respond({error:inserted.error.code==='23505'?'This conversation already has a consultation request':'Could not save consultation'},409);
   return respond({message:'Consultation sent to Admin',id:inserted.data.id});
  }
  if(action==='create'){
   if(role!=='admin')return respond({error:'Admin only'},403);
   const id=asUUID(body['requestId']);if(!id)return respond({error:'Invalid request'},400);
   const request=await db.from('consultation_requests').select('*').eq('id',id).eq('status','pending_admin').maybeSingle();
   if(request.error||!request.data)return respond({error:'Request already processed'},409);
   const start=new Date(request.data.proposed_at),end=new Date(start.getTime()+request.data.duration_minutes*60000);
   if(start.getTime()<=Date.now())return respond({error:'Meeting time is in the past; ask Support to reschedule'},409);
   const w=await db.from('manager_availability').select('weekday,start_minute,end_minute').eq('manager_id',request.data.manager_id);
   if(w.error||!sameSlot(start,end,w.data??[]))return respond({error:'Outside manager appointment slots'},409);
   if(await isBlocked(request.data.manager_id,start)||!await managerLimit(request.data.manager_id,start))return respond({error:'Meeting limit or blocked day; return to Support'},409);
   const saved=await db.from('consultation_meetings').insert({request_id:id,manager_id:request.data.manager_id,support_id:request.data.support_id,customer_id:request.data.customer_id,created_by:user.id,customer_name:request.data.customer_name,customer_email:request.data.customer_email,reason:request.data.reason,starts_at:start.toISOString(),ends_at:end.toISOString()}).select('id').single();
   if(saved.error)return respond({error:'Time unavailable or meeting already exists'},409);
   await Promise.all([
    db.from('consultation_requests').update({status:'scheduled'}).eq('id',id),
    db.from('meeting_status_history').insert({meeting_id:saved.data.id,actor_id:user.id,to_status:'upcoming',note:'Admin scheduled the consultation'}),
    db.from('meeting_notifications').insert([{meeting_id:saved.data.id,recipient_role:'manager',message:'New consultation scheduled'},{meeting_id:saved.data.id,recipient_role:'support',message:'Meeting scheduled; confirm details with customer'}])
   ]);
   // A successful database write is never rolled back by a mail-provider outage.
   let delivered=false;
   try {
    const when=start.toLocaleString('en-GB',{timeZone:'Asia/Tbilisi',dateStyle:'full',timeStyle:'short'});
    await email(request.data.customer_email,'ZELEON — Consultation scheduled','<p>Hello '+escape(request.data.customer_name)+',</p><p>Your consultation has been scheduled for <strong>'+escape(when)+' (Tbilisi time)</strong>.</p><p>ZELEON Support will confirm the meeting location and any further details. For changes, contact Support on our website.</p>','consultation-booked-'+saved.data.id);
    delivered=true;
   }catch(e){console.warn('Booking notification failed',e instanceof Error?e.message:'unknown');}
   return respond({message:delivered?'Meeting created; customer emailed and Manager notified':'Meeting created; Manager notified, but customer email was not confirmed',id:saved.data.id});
  }
  if(action==='reject'){
   if(role!=='admin')return respond({error:'Admin only'},403);
   const id=asUUID(body['requestId']),reason=asString(body['reason']);
   if(!id||reason.length<10||reason.length>500)return respond({error:'Provide rejection reason (10-500 characters)'},400);
   const result=await db.from('consultation_requests').update({status:'rejected',rejected_reason:reason}).eq('id',id).eq('status','pending_admin').select('support_id').maybeSingle();
   if(result.error||!result.data)return respond({error:'Request no longer pending'},409);
   return respond({message:'Consultation rejected; Support can see reason'});
  }
  const id=asUUID(body['meetingId']);if(!id)return respond({error:'Invalid meeting'},400);
  const found=await db.from('consultation_meetings').select('*').eq('id',id).maybeSingle();
  if(found.error||!found.data)return respond({error:'Meeting not found'},404);
  const meeting=found.data;
  if(action==='postpone'){
   if(role!=='manager'||meeting.manager_id!==user.id)return respond({error:'Manager only'},403);
   if(!['upcoming','postponed'].includes(meeting.status))return respond({error:'Meeting cannot be postponed'},409);
   const start=stamp(body['start']),note=asString(body['note']);
   if(!start||start.getTime()<Date.now()||note.length<10)return respond({error:'New date and reason required'},400);
   const end=new Date(start.getTime()+new Date(meeting.ends_at).getTime()-new Date(meeting.starts_at).getTime());
   const w=await db.from('manager_availability').select('weekday,start_minute,end_minute').eq('manager_id',meeting.manager_id);
   if(w.error||!sameSlot(start,end,w.data??[]))return respond({error:'Choose an exact available meeting slot'},409);
   if(await isBlocked(meeting.manager_id,start)||!await managerLimit(meeting.manager_id,start,id))return respond({error:'Date unavailable or limit reached'},409);
   const updated=await db.from('consultation_meetings').update({status:'postponed',proposed_starts_at:start.toISOString(),proposed_ends_at:end.toISOString(),reschedule_reason:note,reschedule_pending:true,customer_notification_pending:true,updated_at:new Date().toISOString()}).eq('id',id).in('status',['upcoming','postponed']);
   if(updated.error)return respond({error:'Meeting conflicts with another booking'},409);
   await Promise.all([db.from('meeting_status_history').insert({meeting_id:id,actor_id:user.id,from_status:meeting.status,to_status:'postponed',note}),db.from('meeting_notifications').insert({meeting_id:id,recipient_role:'support',message:'Meeting postponed. Contact customer to agree on new date and send email notice.'})]);
   try {
    const recipient=await db.auth.admin.getUserById(meeting.support_id);
    if(recipient.data.user?.email) await email(recipient.data.user.email,'ZELEON — Consultation date changed','<p>A Manager postponed a consultation. Please agree the new time with the customer and send the rescheduling notice from <a href="https://zeleon.store/support/consultations">Consultation Desk</a>.</p>','consultation-postponed-'+id+'-'+start.getTime());
   }catch(e){console.warn('Support postponement email failed',e instanceof Error?e.message:'unknown');}
   return respond({message:'Postponed. Support must notify the customer.'});
  }
  if(action==='archive'){
   if(role!=='manager'||meeting.manager_id!==user.id)return respond({error:'Manager only'},403);
   if(!['completed','cancelled'].includes(meeting.status))return respond({error:'Only closed meetings can be archived'},409);
   const updated=await db.from('consultation_meetings').update({archived_at:body['restore']===true?null:new Date().toISOString()}).eq('id',id);
   if(updated.error)throw updated.error;
   await db.from('meeting_status_history').insert({meeting_id:id,actor_id:user.id,from_status:meeting.status,to_status:meeting.status,note:body['restore']===true?'Restored from archive':'Archived by Manager'});
   return respond({message:body['restore']===true?'Meeting restored':'Meeting archived'});
  }
  if(action==='cancel'){
   const byManager=role==='manager'&&meeting.manager_id===user.id;
   const bySupport=role==='support'&&meeting.support_id===user.id;
   if(!byManager&&!bySupport)return respond({error:'Not permitted'},403);
   if(bySupport&&body['customerConfirmed']!==true)return respond({error:'Customer confirmation required'},400);
   if(!['upcoming','postponed','completed'].includes(meeting.status)||(!byManager&&meeting.status==='completed'))return respond({error:'Already closed'},409);
   const reason=asString(body['note']);if(reason.length<10)return respond({error:'Customer cancellation reason required'},400);
   const updated=await db.from('consultation_meetings').update({status:'cancelled',customer_confirmed_cancel:bySupport,reschedule_pending:false,customer_notification_pending:false,proposed_starts_at:null,proposed_ends_at:null,completed_automatically:false,updated_at:new Date().toISOString()}).eq('id',id).in('status',byManager?['upcoming','postponed','completed']:['upcoming','postponed']);
   if(updated.error)throw updated.error;
   await Promise.all([db.from('meeting_status_history').insert({meeting_id:id,actor_id:user.id,from_status:meeting.status,to_status:'cancelled',note:reason}),db.from('meeting_notifications').insert({meeting_id:id,recipient_role:byManager?'support':'manager',message:(byManager?'Manager cancelled meeting: ':'Customer confirmed meeting cancellation with Support: ')+reason.slice(0,500)})]);
   // Deliver an additional direct email alert to the assigned manager.
   try {
    const recipient=await db.auth.admin.getUserById(meeting.manager_id);
    if(recipient.data.user?.email) await email(recipient.data.user.email,'ZELEON — Consultation cancelled by customer','<p>A customer confirmed cancellation of a scheduled consultation with Support.</p><p>Review your <a href="https://zeleon.store/manager/meetings">Meetings dashboard</a> for the updated record.</p>','consultation-cancel-manager-'+id);
   }catch(e){console.warn('Manager cancellation email failed',e instanceof Error?e.message:'unknown');}
   try {
    const recipient=await db.auth.admin.getUserById(meeting.support_id);
    if(byManager&&recipient.data.user?.email)await email(recipient.data.user.email,'ZELEON — Manager cancelled consultation','<p>Manager cancelled a consultation. Please contact the customer from Support Chat.</p>','consultation-manager-cancel-support-'+id);
    await email(meeting.customer_email,'ZELEON — Consultation cancelled','<p>Hello '+escape(meeting.customer_name)+',</p><p>Your consultation has been cancelled. Reason: '+escape(reason.slice(0,400))+'. Please contact ZELEON Support if you need another appointment.</p>','consultation-cancel-customer-'+id);
   }catch(e){console.warn('Cancellation email unavailable',e instanceof Error?e.message:'unknown');}
   return respond({message:'Meeting cancelled; staff notified; customer email attempted'});
  }
  if(action==='decline_postponed'){
   if(role!=='support'||meeting.support_id!==user.id||meeting.status!=='postponed'||!meeting.reschedule_pending)return respond({error:'Not permitted'},403);
   await db.from('meeting_notifications').insert({meeting_id:id,recipient_role:'manager',message:'Customer declined postponed slot. Please suggest a new time or cancel.'});
   return respond({message:'Manager notified that customer declined new time'});
  }
  if(action==='notify_postponed'){
   if(role!=='support'||meeting.support_id!==user.id)return respond({error:'Assigned Support only'},403);
   if(meeting.status!=='postponed'||!meeting.customer_notification_pending||!meeting.proposed_starts_at)return respond({error:'No pending postponement'},409);
   if(body['customerAgreed']!==true)return respond({error:'Please confirm the customer accepted the new date first'},400);
   const proposedStart=new Date(meeting.proposed_starts_at),proposedEnd=new Date(meeting.proposed_ends_at);
   const w=await db.from('manager_availability').select('weekday,start_minute,end_minute').eq('manager_id',meeting.manager_id);
   if(w.error||!sameSlot(proposedStart,proposedEnd,w.data||[])||await isBlocked(meeting.manager_id,proposedStart)||!await managerLimit(meeting.manager_id,proposedStart,id))return respond({error:'Proposed time is no longer available; ask Manager for another slot'},409);
   const slot=proposedStart.toLocaleString('en-GB',{timeZone:'Asia/Tbilisi',dateStyle:'full',timeStyle:'short'});
   const updated=await db.from('consultation_meetings').update({status:'upcoming',starts_at:proposedStart.toISOString(),ends_at:proposedEnd.toISOString(),proposed_starts_at:null,proposed_ends_at:null,customer_notification_pending:false,reschedule_pending:false,updated_at:new Date().toISOString()}).eq('id',id).eq('status','postponed');
   if(updated.error)throw updated.error;
   await db.from('meeting_status_history').insert({meeting_id:id,actor_id:user.id,from_status:'postponed',to_status:'upcoming',note:'Customer confirmed new time with Support'});
   await db.from('meeting_notifications').insert({meeting_id:id,recipient_role:'manager',message:'Support confirmed postponed date with customer'});
   let emailed=true;
   try{await email(meeting.customer_email,'ZELEON — Consultation rescheduled','<p>Hello '+escape(meeting.customer_name)+',</p><p>As agreed with ZELEON Support, your consultation is rescheduled to <strong>'+escape(slot)+' (Tbilisi time)</strong>.</p><p>If you need another change, please contact Support through our website.</p>','consultation-moved-'+id+'-'+proposedStart.getTime());}
   catch(e){emailed=false;console.warn('Reschedule email unavailable',e instanceof Error?e.message:'unknown');}
   return respond({message:emailed?'New slot confirmed; customer emailed':'New slot confirmed, but customer email delivery failed; contact customer manually'});
  }
  return respond({error:'Unsupported action'},400);
 }catch(e){console.error('Meeting operation failed',e instanceof Error?e.message:'unknown');return respond({error:'Unable to complete meeting operation'},503);}
});
