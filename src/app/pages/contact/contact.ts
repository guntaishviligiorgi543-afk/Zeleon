import { afterNextRender, Component, inject, signal } from '@angular/core';
import { SUPABASE_CLIENT } from '../../services/supabase';
import { Auth } from '../../services/auth';

@Component({
  imports: [],
  selector: 'app-contact',
  styleUrl: './contact.css',
  templateUrl: './contact.html',
})
export class Contact {
  readonly auth = inject(Auth);
  private readonly supabase = inject(SUPABASE_CLIENT);
  readonly contactPending = signal(false);
  readonly contactFeedback = signal('');
  readonly contactSuccess = signal(false);
  constructor() { afterNextRender(() => { void this.auth.ready; }); }
  async submitContact(event: Event): Promise<void> {
    event.preventDefault();
    if (this.contactPending()) return;
    const form=event.target as HTMLFormElement;
    const input=(name:string)=>form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
    const email=input('email')?.value.trim().toLowerCase()||'';
    const firstName=input('name')?.value.trim()||'';
    const lastName=input('lastName')?.value.trim()||'';
    const message=input('message')?.value.trim()||'';
    if (!form.reportValidity() || !firstName || !lastName || message.length<10) {
      this.contactSuccess.set(false);
      this.contactFeedback.set('Complete all fields and enter a message of at least 10 characters.');
      return;
    }
    this.contactPending.set(true);
    this.contactFeedback.set('');
    this.contactSuccess.set(false);
    try {
      await this.auth.ready;
      const {data:{session},error:sessionError}=await this.supabase.auth.getSession();
      if (sessionError) throw new Error('Unable to check your account. Please sign in again.');
      if (session) {
        const {data:{user},error:userError}=await this.supabase.auth.getUser();
        if(userError||!user?.email)throw new Error('Your session has expired. Please sign in again.');
        if (email!==user.email.trim().toLowerCase())throw new Error('Use the email address registered to your ZELEON account.');
      }
      const response=await fetch('https://nunxmgltzvknnmkdvjsw.supabase.co/functions/v1/contact-inbox',{
        method:'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.access_token}:{})},
        body:JSON.stringify({action:'submit',firstName,lastName,email,message,website:input('website')?.value||''}),
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Could not send your message.');
      this.contactFeedback.set('Your message has been delivered to ZELEON administrators. A reply will be sent to your email.');
      this.contactSuccess.set(true);
      form.reset();
    }catch(e){this.contactFeedback.set(e instanceof Error?e.message:'Could not send your message.');}
    finally{this.contactPending.set(false);}
  }
  readonly openFaqs = signal<ReadonlySet<number>>(new Set());
  readonly sharedFaqs = signal<ReadonlySet<number>>(new Set());
  readonly shareError = signal('');

  async shareFaq(index: number): Promise<void> {
    this.shareError.set('');
    if (typeof window === 'undefined' || !window.navigator.clipboard?.writeText) {
      this.shareError.set('Link copying is unavailable in this browser.');
      return;
    }
    try {
      await window.navigator.clipboard.writeText(window.location.href);
      this.sharedFaqs.update((current) => new Set([...current, index]));
    } catch {
      this.shareError.set('Could not copy the link. Please try again.');
    }
  }

  toggleFaq(index: number): void {
    this.openFaqs.update((current) => current.has(index) ? new Set<number>() : new Set([index]));
  }
}
