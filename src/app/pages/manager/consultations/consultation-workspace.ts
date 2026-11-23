import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { SUPABASE_CLIENT } from '../../../services/supabase';
import { StaffAccess } from '../../../services/staff-access';
import { Auth } from '../../../services/auth';

type RecordData = Record<string, any>;
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
 readonly windows=signal<RecordData[]>([]);
 readonly managers=signal<string[]>([]);
 readonly notes=signal<RecordData[]>([]);
 readonly selected=signal<string|null>(null);
 readonly filter=signal('all');
 readonly shown=computed(()=>this.filter()==='all'?this.meetings():this.meetings().filter(m=>m.status===this.filter()));
 readonly loading=signal(false);
 readonly error=signal('');
 readonly success=signal('');
 readonly conversation=signal('');
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
 ngOnInit():void{this.conversation.set(this.route.snapshot.queryParamMap.get('conversation')||'');void this.refresh();}
 private async api(action:string,extra:Record<string,unknown>={}):Promise<RecordData>{
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
   this.slots.set(calendar.slots||[]);this.windows.set(calendar.availability||[]);this.managers.set(calendar.managers||[]);
   if(!this.manager()&&calendar.managers?.length===1)this.manager.set(calendar.managers[0]);
  }catch(e){this.error.set(e instanceof Error?e.message:'Cannot load meetings');}
  finally{this.loading.set(false);}
 }
 async act(action:string,extra:Record<string,unknown>):Promise<void>{
  if(this.loading())return;this.loading.set(true);this.error.set('');this.success.set('');
  try{const result=await this.api(action,extra);this.success.set(result.message||'Saved');this.selected.set(null);this.actionNote.set('');this.confirmed.set(false);}
  catch(e){this.error.set(e instanceof Error?e.message:'Action failed');}
  finally{this.loading.set(false);}
  if(!this.error())await this.refresh();
 }
 utc(value:string):string{return value?new Date(value+':00+04:00').toISOString():'';}
 local(value:string):string{return new Date(value).toLocaleString('en-GB',{timeZone:'Asia/Tbilisi',dateStyle:'medium',timeStyle:'short'});}
 time(n:number):string{return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
 request():void{
  if(!this.confirmed()||!this.conversation()||!this.manager()||!this.date()||this.reason().trim().length<10)return;
  void this.act('request',{conversationId:this.conversation().trim(),managerId:this.manager(),start:this.utc(this.date()),duration:this.duration(),reason:this.reason().trim(),customerAgreed:true});
 }
 action(m:RecordData,kind:'postpone'|'not_held'|'cancel'|'notify_postponed'):void{
  const data:Record<string,unknown>={meetingId:m.id};
  if(kind==='postpone')data['start']=this.utc(this.actionDate());
  if(kind==='postpone'||kind==='not_held'||kind==='cancel')data['note']=this.actionNote().trim();
  if(kind==='cancel')data['customerConfirmed']=this.confirmed();
  if(kind==='notify_postponed')data['customerAgreed']=this.confirmed();
  void this.act(kind,data);
 }
 addWindow():void{
  const min=(v:string)=>{const parts=v.split(':').map(Number);return parts[0]*60+parts[1];};
  const start=min(this.startTime()),end=min(this.endTime());
  if(end<=start){this.error.set('End must be after start');return;}
  this.windows.update(w=>[...w,{manager_id:this.auth.user()?.id,weekday:this.day(),start_minute:start,end_minute:end}]);
 }
 removeWindow(i:number):void{this.windows.update(w=>w.filter((_,idx)=>idx!==i));}
 saveWindows():void{void this.act('availability',{windows:this.windows().filter(w=>w.manager_id===this.auth.user()?.id).map(w=>({weekday:w.weekday,start_minute:w.start_minute,end_minute:w.end_minute}))});}
}
