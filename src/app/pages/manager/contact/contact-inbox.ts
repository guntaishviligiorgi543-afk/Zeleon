import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { SUPABASE_CLIENT } from '../../../services/supabase';

interface Inquiry {
 id:string;first_name:string;last_name:string;email:string;message:string;
 status:'open'|'sending'|'replied';reply_body:string|null;created_at:string;replied_at:string|null;
}
@Component({selector:'app-contact-inbox',imports:[DatePipe],templateUrl:'./contact-inbox.html',styleUrls:['../manager-page.css','./contact-inbox.css']})
export class ContactInbox implements OnInit {
 private readonly client=inject(SUPABASE_CLIENT);
 readonly inquiries=signal<Inquiry[]>([]);
 readonly selected=signal<Inquiry|null>(null);
 readonly reply=signal('');
 readonly loading=signal(false);
 readonly sending=signal(false);
 readonly error=signal('');
 readonly success=signal('');
 readonly openCount=computed(()=>this.inquiries().filter(x=>x.status==='open').length);
 ngOnInit():void{void this.refresh();}
 private async call(action:string,more:Record<string,unknown>={}):Promise<any>{
  const {data,error}=await this.client.functions.invoke('contact-inbox',{body:{action,...more}});
  if(error){
   let message='Could not reach the contact inbox.';
   try{const details=await error.context?.json();if(typeof details?.error==='string')message=details.error;}catch{}
   throw new Error(message);
  }
  if(data?.error)throw new Error(data.error);
  return data;
 }
 async refresh():Promise<void>{
  if(this.loading())return;
  this.loading.set(true);this.error.set('');
  try{
   const result=await this.call('list');
   this.inquiries.set(Array.isArray(result.inquiries)?result.inquiries:[]);
   if(this.selected()){this.selected.set(this.inquiries().find(x=>x.id===this.selected()?.id)??null);}
  }catch(e){this.error.set(e instanceof Error?e.message:'Unable to load messages.');}
  finally{this.loading.set(false);}
 }
 select(item:Inquiry):void{this.selected.set(item);this.reply.set('');this.success.set('');this.error.set('');}
 async send():Promise<void>{
  const item=this.selected(),body=this.reply().trim();
  if(!item||item.status!=='open'||body.length<10||body.length>4000||this.sending())return;
  this.sending.set(true);this.error.set('');this.success.set('');
  try{
   const result=await this.call('reply',{id:item.id,reply:body});
   this.success.set(result.message||'Reply sent.');
   this.reply.set('');
   await this.refresh();
  }catch(e){this.error.set(e instanceof Error?e.message:'Unable to send reply.');}
  finally{this.sending.set(false);}
 }
}
