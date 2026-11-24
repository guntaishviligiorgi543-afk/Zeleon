import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { SUPABASE_CLIENT } from '../../../services/supabase';
import { StaffAccess } from '../../../services/staff-access';
import { Auth } from '../../../services/auth';

type RecordData = any;
@Component({
 selector:'app-consultation-workspace',imports:[DatePipe,FormsModule],
 styleUrls:['../manager-page.css','./consultation-workspace.css'],
 templateUrl:'./consultation-workspace.html'
})
export class ConsultationWorkspace implements OnInit {
 private readonly client=inject(SUPABASE_CLIENT);
 private readonly staff=inject(StaffAccess);
 private readonly auth=inject(Auth);
 private readonly route=inject(ActivatedRoute);
 readonly role=this.staff.role();
 readonly requests=signal<RecordData[]>([]);
 readonly meetings=signal<RecordData[]>([]);
 readonly slots=signal<RecordData[]>([]);
 readonly blocked=signal<RecordData[]>([]);
 readonly blockedDate=signal('');
 readonly history=signal<RecordData[]>([]);
 readonly historyFrom=signal('');
 readonly historyTo=signal('');
 readonly historyStatus=signal('all');
 readonly showArchived=signal(false);
 readonly selectedArchives=signal<string[]>([]);
 readonly windows=signal<RecordData[]>([]);
 readonly managers=signal<string[]>([]);
 readonly notes=signal<RecordData[]>([]);
 readonly selected=signal<string|null>(null);
 readonly filter=signal('all');
 readonly shown=computed(()=>this.meetings().filter(m=>(this.role!=='manager'||(this.showArchived()?!!m.archived_at:!m.archived_at))&&(this.filter()==='all'||m.status===this.filter())));
 readonly historical=computed(()=>this.meetings().filter(m=>{
  if(this.role!=='manager')return false;
  if(!this.showArchived()&&m.archived_at)return false;
  const d=this.dayKey(m.starts_at);
  return (!this.historyFrom()||d>=this.historyFrom())&&(!this.historyTo()||d<=this.historyTo())&&(this.historyStatus()==='all'||m.status===this.historyStatus());
 }));
 readonly loading=signal(false);
 readonly error=signal('');
 readonly success=signal('');
 readonly conversation=signal('');
 readonly forwardedFromChat=signal(false);
 readonly selectedCustomer=computed(()=>this.consultationChats().find(chat=>chat.id===this.conversation())??null);
 readonly consultationChats=signal<Array<{id:string;customer_first_name:string|null;customer_last_name:string|null;customer_email:string|null;subject:string|null;assigned_support_id:string|null}>>([]);
 readonly manager=signal('');
 readonly date=signal('');
 readonly duration=signal(45);
 readonly reason=signal('');
 readonly confirmed=signal(false);
 readonly cancelConfirmed=signal(false);
 readonly actionNote=signal('');
 readonly actionDate=signal('');
 readonly rescheduleSlots=signal<Array<{start:string;end:string;duration:number}>>([]);
 readonly day=signal(1);
 readonly startTime=signal('10:00');
 readonly endTime=signal('18:00');
 readonly days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
 ngOnInit():void{
  const forwarded=this.route.snapshot.queryParamMap.get('conversation')||'';
  this.conversation.set(forwarded);
  this.forwardedFromChat.set(!!forwarded);
  void this.refresh();
 }
 private async api(action:string,extra:Record<string,unknown>={}):Promise<any>{
  const {data,error}=await this.client.functions.invoke('consultation-management',{body:{action,...extra}});
  if(error){let message='Unable to reach consultation service.';try{const response=await error.context?.json();if(response?.error)message=response.error;}catch{}throw new Error(message);}
  if(data?.error)throw new Error(data.error);
  return data||{};
 }
 async refresh():Promise<void>{
  if(this.loading())return;this.loading.set(true);this.error.set('');
  try{
   const [list,calendar]=await Promise.all([this.api('list'),this.api('calendar')]);
   this.requests.set(list.requests||[]);this.meetings.set(list.meetings||[]);this.notes.set(list.notifications||[]);
   this.slots.set(calendar.slots||[]);
   this.windows.set(this.role==='manager'?(calendar.availability||[]).filter((w:RecordData)=>w.manager_id===this.auth.user()?.id):calendar.availability||[]);
   this.managers.set(calendar.managers||[]);
   this.blocked.set(calendar.blocked||[]);
   this.history.set(list.history||[]);
   if(!this.manager()&&calendar.managers?.length===1)this.manager.set(calendar.managers[0]);
   if(this.role==='support'){
    const currentId=this.auth.user()?.id;
    const conversations=await this.client.from('support_conversations')
      .select('id,customer_first_name,customer_last_name,customer_email,subject,assigned_support_id')
      .eq('assigned_support_id',currentId??'00000000-0000-0000-0000-000000000000')
      .ilike('subject','%consultation%')
      .order('updated_at',{ascending:false}).limit(100);
    if(conversations.error)throw conversations.error;
    this.consultationChats.set((conversations.data??[]).filter(c=>/consultation/i.test(c.subject??'')));
    if(this.forwardedFromChat() && !this.consultationChats().some(c=>c.id===this.conversation())){
      this.error.set('The selected conversation is not assigned to you. Claim it in Support Chat first, then select Forward to Admin.');
      this.forwardedFromChat.set(false);
      this.conversation.set('');
    }
   }
  }catch(e){this.error.set(e instanceof Error?e.message:'Cannot load meetings');}
  finally{this.loading.set(false);}
 }
 async act(action:string,extra:Record<string,unknown>):Promise<void>{
  if(this.loading())return;this.loading.set(true);this.error.set('');this.success.set('');
  try{const result=await this.api(action,extra);this.success.set(result.message||'Saved');this.selected.set(null);this.actionNote.set('');this.confirmed.set(false);this.cancelConfirmed.set(false);
   if(action==='request'){this.conversation.set('');this.forwardedFromChat.set(false);this.reason.set('');this.date.set('');}
  }
  catch(e){this.error.set(e instanceof Error?e.message:'Action failed');}
  finally{this.loading.set(false);}
  if(!this.error())await this.refresh();
 }
 utc(value:string):string{return value?new Date(value+':00+04:00').toISOString():'';}
 local(value:string):string{return new Date(value).toLocaleString('en-GB',{timeZone:'Asia/Tbilisi',dateStyle:'medium',timeStyle:'short'});}
 time(n:number):string{return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
 dayKey(iso:string):string{return new Date(new Date(iso).getTime()+4*3600_000).toISOString().slice(0,10);}
 async blockDay(blocked:boolean):Promise<void>{
  if(!this.blockedDate())return;
  await this.act('block_date',{date:this.blockedDate(),blocked,reason:'Manager unavailable'});
 }
 isBlockedDay(date:string):boolean{return this.blocked().some(b=>b.manager_id===this.auth.user()?.id&&b.blocked_date===date);}
 async reject(id:string):Promise<void>{
  const reason=window.prompt('Reason for rejecting the consultation (at least 10 characters):');
  if(reason&&reason.trim().length>=10)await this.act('reject',{requestId:id,reason:reason.trim()});
 }
 async archiveSelected(filtered=false):Promise<void>{
  const ids=filtered?this.historical().filter(m=>!m.archived_at&&['completed','cancelled'].includes(m.status)).map(m=>m.id):this.selectedArchives();
  if(!ids.length||this.loading())return;
  if(!window.confirm('Archive '+ids.length+' selected meetings? Records remain available in archived history until 90-day retention expires.'))return;
  this.loading.set(true);this.error.set('');
  try{
   for(const meetingId of ids)await this.api('archive',{meetingId});
   this.success.set(ids.length+' meetings archived');
   this.selectedArchives.set([]);
  }catch(e){this.error.set(e instanceof Error?e.message:'Could not archive');}
  finally{this.loading.set(false);}
  await this.refresh();
 }
 selectArchive(id:string,checked:boolean):void{this.selectedArchives.update(ids=>checked?[...new Set([...ids,id])]:ids.filter(x=>x!==id));}
 async archive(m:RecordData,restore=false):Promise<void>{await this.act('archive',{meetingId:m.id,restore});}
 // Self-contained PDF renderer: downloadable PDF, no external script or service.
 exportPDF():void{
  if(this.role!=='manager')return;
  const meetings=this.historical();
  if(!meetings.length){this.error.set('No meetings match the selected history filters');return;}
  const lines:string[]=[
   'ZELEON  |  Consultation History Report',
   'Date range: '+(this.historyFrom()||'All')+' — '+(this.historyTo()||'All'),
   'Status: '+this.historyStatus()+'  |  Generated: '+this.local(new Date().toISOString()),
   'Number of meetings: '+meetings.length, ''
  ];
  for(const m of meetings){
   lines.push('Meeting: '+this.local(m.starts_at)+'  |  '+m.status,
    'Customer: '+(m.customer_name||'Customer')+'  |  '+(m.customer_email||''),
    'Manager: '+m.manager_id+'  |  Support: '+m.support_id,
    'Reason: '+(m.reason||''));
   for(const e of this.history().filter(h=>h.meeting_id===m.id))
    lines.push('Change: '+this.local(e.created_at)+'  |  '+e.to_status+'  |  '+(e.note||''));
   lines.push('');
  }
  // Render the report with the browser's own fonts, preserving Georgian names
  // and notes without external PDF libraries or third-party uploads.
  const canvas=document.createElement('canvas');canvas.width=1190;canvas.height=1684;
  const ctx=canvas.getContext('2d');if(!ctx){this.error.set('PDF renderer unavailable');return;}
  ctx.font='22px Arial, sans-serif';
  const wrapped:string[]=[];
  for(const line of lines){
   let part='';
   for(const word of line.split(' ')){
    const candidate=part?part+' '+word:word;
    if(ctx.measureText(candidate).width>1070&&part){wrapped.push(part);part=word;}
    else part=candidate;
   }
   wrapped.push(part);
  }
  const pageLines:string[][]=[];
  for(let i=0;i<wrapped.length;i+=53)pageLines.push(wrapped.slice(i,i+53));
  const pageImages:Uint8Array[]=[];
  for(const [index,chunk] of pageLines.entries()){
   ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.fillStyle='#172b4d';ctx.font='bold 26px Arial, sans-serif';
   ctx.fillText('ZELEON  /  CONSULTATIONS',55,65);
   ctx.fillStyle='#2c3f5c';ctx.font='22px Arial, sans-serif';
   chunk.forEach((line,i)=>ctx.fillText(line,55,125+i*28));
   ctx.font='18px Arial, sans-serif';
   ctx.fillText('Page '+(index+1)+' of '+pageLines.length,55,1635);
   const raw=atob(canvas.toDataURL('image/jpeg',0.85).split(',')[1]);
   pageImages.push(Uint8Array.from(raw,ch=>ch.charCodeAt(0)));
  }
  const bytes=(value:string)=>new TextEncoder().encode(value);
  const chunks:Uint8Array[]=[];let total=0;const offsets:number[]=[0];
  const push=(data:Uint8Array)=>{chunks.push(data);total+=data.length;};
  const pushText=(value:string)=>push(bytes(value));
  const pagesRef=2;
  pushText('%PDF-1.4\n');
  const beginObj=(id:number)=>{offsets[id]=total;pushText(id+' 0 obj\n');};
  const closeObj=()=>pushText('\nendobj\n');
  beginObj(1);pushText('<< /Type /Catalog /Pages 2 0 R >>');closeObj();
  beginObj(2);pushText('<< /Type /Pages /Count '+pageImages.length+' /Kids ['+pageImages.map((_,i)=>(5+i*3)+' 0 R').join(' ')+'] >>');closeObj();
  for(const [i,image] of pageImages.entries()){
   const imgId=3+i*3,contentId=4+i*3,pageId=5+i*3;
   beginObj(imgId);
   pushText('<< /Type /XObject /Subtype /Image /Width 1190 /Height 1684 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+image.length+' >>\nstream\n');
   push(image);pushText('\nendstream');closeObj();
   const content=bytes('q 595 0 0 842 0 0 cm /Im0 Do Q\n');
   beginObj(contentId);pushText('<< /Length '+content.length+' >>\nstream\n');push(content);pushText('endstream');closeObj();
   beginObj(pageId);
   pushText('<< /Type /Page /Parent '+pagesRef+' 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 '+imgId+' 0 R >> >> /Contents '+contentId+' 0 R >>');
   closeObj();
  }
  const xref=total;const objCount=2+pageImages.length*3;
  pushText('xref\n0 '+(objCount+1)+'\n0000000000 65535 f \n');
  for(let i=1;i<=objCount;i++)pushText(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
  pushText('trailer\n<< /Root 1 0 R /Size '+(objCount+1)+' >>\nstartxref\n'+xref+'\n%%EOF');
  const url=URL.createObjectURL(new Blob(chunks as BlobPart[],{type:'application/pdf'}));
  const link=document.createElement('a');link.href=url;link.download='ZELEON-consultations-'+new Date().toISOString().slice(0,10)+'.pdf';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
 }
 request():void{
  if(!this.confirmed()||!this.consultationChats().some(c=>c.id===this.conversation())||!this.manager()||!this.date()||this.reason().trim().length<10)return;
  void this.act('request',{conversationId:this.conversation().trim(),managerId:this.manager(),start:this.utc(this.date()),duration:this.duration(),reason:this.reason().trim(),customerAgreed:true});
 }
 async openManage(m:RecordData):Promise<void>{
  this.selected.set(m.id);this.actionNote.set('');this.actionDate.set('');this.confirmed.set(false);
  this.rescheduleSlots.set([]);
  if(this.role!=='manager'||!['upcoming','postponed'].includes(m.status))return;
  try{
   const data=await this.api('slots',{managerId:m.manager_id});
   const duration=(new Date(m.ends_at).getTime()-new Date(m.starts_at).getTime())/60000;
   this.rescheduleSlots.set((data.slots||[]).filter((s:{duration:number})=>s.duration===duration));
  }catch(e){this.error.set(e instanceof Error?e.message:'Cannot load free appointment slots');}
 }
 action(m:RecordData,kind:'postpone'|'cancel'|'notify_postponed'|'decline_postponed'):void{
  const data:Record<string,unknown>={meetingId:m.id};
  if(kind==='postpone')data['start']=this.actionDate();
  if(kind==='postpone'||kind==='cancel')data['note']=this.actionNote().trim();
  if(kind==='cancel')data['customerConfirmed']=this.cancelConfirmed();
  if(kind==='notify_postponed')data['customerAgreed']=this.confirmed();
  void this.act(kind,data);
 }
 addWindow():void{
  const min=(v:string)=>{const parts=v.split(':').map(Number);return parts[0]*60+parts[1];};
  const start=min(this.startTime()),end=min(this.endTime());
  if(end<=start||end-start<15||end-start>180){this.error.set('Choose a slot between 15 and 180 minutes');return;}
  if(this.day()<1||this.day()>5){this.error.set('Workdays only');return;}
  if(this.windows().filter(w=>w.manager_id===this.auth.user()?.id&&w.weekday===this.day()).length>=4){this.error.set('Maximum four appointment slots per day');return;}
  if(this.windows().some(w=>w.manager_id===this.auth.user()?.id&&w.weekday===this.day()&&w.start_minute<end&&w.end_minute>start)){this.error.set('This slot overlaps an existing slot');return;}
  this.windows.update(w=>[...w,{manager_id:this.auth.user()?.id,weekday:this.day(),start_minute:start,end_minute:end}]);
 }
 removeWindow(i:number):void{this.windows.update(w=>w.filter((_,idx)=>idx!==i));}
 saveWindows():void{void this.act('availability',{windows:this.windows().filter(w=>w.manager_id===this.auth.user()?.id).map(w=>({weekday:w.weekday,start_minute:w.start_minute,end_minute:w.end_minute}))});}
}
