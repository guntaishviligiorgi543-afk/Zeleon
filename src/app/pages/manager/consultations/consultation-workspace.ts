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
 readonly actionNote=signal('');
 readonly actionDate=signal('');
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
  try{const result=await this.api(action,extra);this.success.set(result.message||'Saved');this.selected.set(null);this.actionNote.set('');this.confirmed.set(false);
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
 async archiveSelected():Promise<void>{
  const ids=this.selectedArchives();
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
  const filtered=this.historical();
  const lines=['ZELEON - Consultation History Report',
   'Period: '+(this.historyFrom()||'All')+' to '+(this.historyTo()||'All'),
   'Status: '+this.historyStatus(),'Exported: '+new Date().toISOString(),'',
   ...filtered.flatMap(m=>[
    'Date: '+this.local(m.starts_at)+' | Status: '+m.status,
    'Customer: '+(m.customer_name||'Customer')+' | '+(m.customer_email||''),
    'Manager: '+m.manager_id+' | Support: '+m.support_id,
    'Reason: '+(m.reason||''),
    ...this.history().filter(h=>h.meeting_id===m.id).map(h=>'History: '+h.to_status+' / '+this.local(h.created_at)+' / '+(h.note||'')),
    ''
   ])];
  if(!filtered.length){this.error.set('No meetings match the selected history filters');return;}
  const safe=(v:string)=>v.normalize('NFKD').replace(/[^\\x20-\\x7e]/g,'?').replace(/[()\\\\]/g, (char)=>'\\\\'+char);
  const pages:string[][]=[];for(let i=0;i<lines.length;i+=48)pages.push(lines.slice(i,i+48));
  const objects:string[]=[];const add=(s:string)=>{objects.push(s);return objects.length;};
  const catalog=add('');const pagesRoot=add('');const font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds:number[]=[];
  for(const pageLines of pages){
   const content='BT /F1 10 Tf 45 790 Td 14 TL '+pageLines.map((line,i)=>(i?'T* ':'')+'('+safe(line.slice(0,115))+') Tj').join(' ')+' ET';
   const stream=add('<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream');
   const page=add('<< /Type /Page /Parent '+pagesRoot+' 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 '+font+' 0 R >> >> /Contents '+stream+' 0 R >>');pageIds.push(page);
  }
  objects[catalog-1]='<< /Type /Catalog /Pages '+pagesRoot+' 0 R >>';
  objects[pagesRoot-1]='<< /Type /Pages /Kids ['+pageIds.map(id=>id+' 0 R').join(' ')+'] /Count '+pageIds.length+' >>';
  let pdf='%PDF-1.4\n';const offsets=[0];
  objects.forEach((obj,i)=>{offsets.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+obj+'\nendobj\n';});
  const xref=pdf.length;pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
  for(const offset of offsets.slice(1))pdf+=String(offset).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<< /Size '+(objects.length+1)+' /Root '+catalog+' 0 R >>\nstartxref\n'+xref+'\n%%EOF';
  const url=URL.createObjectURL(new Blob([pdf],{type:'application/pdf'}));
  const a=document.createElement('a');a.href=url;a.download='ZELEON-consultations-'+new Date().toISOString().slice(0,10)+'.pdf';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
 }
 request():void{
  if(!this.confirmed()||!this.consultationChats().some(c=>c.id===this.conversation())||!this.manager()||!this.date()||this.reason().trim().length<10)return;
  void this.act('request',{conversationId:this.conversation().trim(),managerId:this.manager(),start:this.utc(this.date()),duration:this.duration(),reason:this.reason().trim(),customerAgreed:true});
 }
 action(m:RecordData,kind:'postpone'|'cancel'|'notify_postponed'|'decline_postponed'):void{
  const data:Record<string,unknown>={meetingId:m.id};
  if(kind==='postpone')data['start']=this.utc(this.actionDate());
  if(kind==='postpone'||kind==='cancel')data['note']=this.actionNote().trim();
  if(kind==='cancel')data['customerConfirmed']=this.confirmed();
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
