import { Component, EventEmitter, Input, OnInit, Output, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SUPABASE_CLIENT } from '../../../services/supabase';

type Slot = { start: string; end: string; duration: number };
@Component({
 selector: 'app-quick-consultation',
 standalone: true,
 imports: [FormsModule],
 templateUrl: './quick-consultation.html',
 styleUrls: ['./quick-consultation.css'],
})
export class QuickConsultation implements OnInit {
 @Input({ required: true }) conversationId = '';
 @Input() customerName = '';
 @Input() customerEmail = '';
 @Input() subject = '';
 @Output() close = new EventEmitter<void>();
 private readonly client = inject(SUPABASE_CLIENT);
 readonly managers = signal<string[]>([]);
 readonly managerId = signal('');
 readonly slots = signal<Slot[]>([]);
 readonly chosen = signal('');
 readonly reason = signal('');
 readonly agreed = signal(false);
 readonly loading = signal(false);
 readonly success = signal('');
 readonly error = signal('');
 readonly chosenSlot = computed(() => this.slots().find(s => s.start === this.chosen()) ?? null);
 async ngOnInit(): Promise<void> {
  this.reason.set(this.subject.length >= 10 ? this.subject : 'Customer requested a consultation');
  await this.loadManagers();
 }
 private async api(action: string, rest: Record<string, unknown> = {}): Promise<any> {
  const { data, error } = await this.client.functions.invoke('consultation-management', { body: { action, ...rest } });
  if (error) {
   let reason = 'Consultation service unavailable';
   try { const j = await error.context?.json(); reason = j?.error || reason; } catch {}
   throw new Error(reason);
  }
  if (data?.error) throw new Error(data.error);
  return data;
 }
 async loadManagers(): Promise<void> {
  this.loading.set(true);this.error.set('');
  try {
   const calendar = await this.api('calendar');
   this.managers.set(calendar.managers || []);
   if (calendar.managers?.length === 1) { this.managerId.set(calendar.managers[0]); await this.loadSlots(); }
  } catch(e) { this.error.set(e instanceof Error ? e.message : 'Could not load managers'); }
  finally { this.loading.set(false); }
 }
 async chooseManager(id: string): Promise<void> { this.managerId.set(id);this.chosen.set('');await this.loadSlots(); }
 async loadSlots(): Promise<void> {
  if (!this.managerId()) { this.slots.set([]); return; }
  this.loading.set(true);this.error.set('');
  try { const result = await this.api('slots', { managerId: this.managerId() });this.slots.set(result.slots || []); }
  catch(e) { this.error.set(e instanceof Error ? e.message : 'Could not load free slots'); }
  finally { this.loading.set(false); }
 }
 local(iso: string): string { return new Date(iso).toLocaleString('en-GB', { timeZone:'Asia/Tbilisi', weekday:'short',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit' }); }
 async submit(): Promise<void> {
  const slot = this.chosenSlot();
  if (!this.conversationId || !slot || !this.managerId() || !this.agreed() || this.reason().trim().length < 10 || this.loading()) return;
  this.loading.set(true);this.error.set('');
  try {
   await this.api('request', { conversationId:this.conversationId,managerId:this.managerId(),start:slot.start,duration:slot.duration,reason:this.reason().trim(),customerAgreed:true });
   this.success.set('Sent to Admin for approval. No meeting is booked until Admin approves.');
   this.chosen.set('');this.agreed.set(false);this.slots.set([]);
  } catch(e) { this.error.set(e instanceof Error ? e.message : 'Could not forward consultation'); }
  finally { this.loading.set(false); }
 }
}
