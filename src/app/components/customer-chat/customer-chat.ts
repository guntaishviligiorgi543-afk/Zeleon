import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';
import { SUPABASE_CLIENT } from '../../services/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

type Conversation = { id: string; subject: string | null; status: string; updated_at: string };
type Message = { id: string; conversation_id: string; sender_type: string; body: string; created_at: string };

@Component({
  selector: 'app-customer-chat',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './customer-chat.html',
  styleUrl: './customer-chat.css',
})
export class CustomerChat {
  readonly auth = inject(Auth);
  private readonly client = inject(SUPABASE_CLIENT);
  readonly opened = signal(false);
  readonly busy = signal(false);
  readonly sending = signal(false);
  readonly error = signal('');
  readonly conversations = signal<Conversation[]>([]);
  readonly active = signal<Conversation | null>(null);
  readonly messages = signal<Message[]>([]);
  readonly unread = signal(false);
  private channel: RealtimeChannel | null = null;
  private userId: string | null = null;
  private requestId = 0;
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    const { data: authSubscription } = this.client.auth.onAuthStateChange((_event, session) => {
      const next = session?.user?.id ?? null;
      if (next !== this.userId) {
        this.userId = next;
        this.disconnect();
        this.conversations.set([]);
        this.active.set(null);
        this.messages.set([]);
        if (this.opened() && next) queueMicrotask(() => void this.load());
      }
    });
    this.destroyRef.onDestroy(() => { authSubscription.subscription.unsubscribe(); this.disconnect(); });
  }

  toggle(): void {
    this.opened.update(value => !value);
    if (this.opened()) { this.unread.set(false); void this.load(); }
  }

  async load(): Promise<void> {
    await this.auth.ready;
    if (!this.auth.isAuthenticated()) return;
    const id = ++this.requestId;
    this.busy.set(true);
    this.error.set('');
    try {
      const { data, error } = await this.client.from('support_conversations')
        .select('id,subject,status,updated_at').order('updated_at', { ascending: false }).limit(30);
      if (error) throw error;
      if (id !== this.requestId) return;
      this.conversations.set((data ?? []) as Conversation[]);
      const current = this.active();
      const chosen = (data ?? []).find(c => c.id === current?.id) ?? data?.[0] ?? null;
      if (chosen) await this.select(chosen as Conversation);
      else { this.active.set(null); this.messages.set([]); this.disconnect(); }
    } catch (e) { if (id === this.requestId) this.error.set(this.message(e)); }
    finally { this.busy.set(false); }
  }

  async select(conversation: Conversation): Promise<void> {
    this.disconnect();
    this.active.set(conversation);
    this.messages.set([]);
    const id = ++this.requestId;
    const { data, error } = await this.client.from('support_messages')
      .select('id,conversation_id,sender_type,body,created_at')
      .eq('conversation_id', conversation.id).order('created_at', { ascending: true }).limit(200);
    if (id !== this.requestId) return;
    if (error) { this.error.set(this.message(error)); return; }
    this.messages.set((data ?? []) as Message[]);
    this.channel = this.client.channel('customer-chat-' + conversation.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: 'conversation_id=eq.' + conversation.id }, payload => {
        const message = payload.new as Message;
        if (this.active()?.id !== message.conversation_id) return;
        this.messages.update(rows => rows.some(row => row.id === message.id) ? rows : [...rows, message]);
        if (!this.opened() && message.sender_type !== 'customer') this.unread.set(true);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_conversations', filter: 'id=eq.' + conversation.id }, payload => {
        const updated = payload.new as Conversation;
        this.active.update(old => old?.id === updated.id ? { ...old, ...updated } : old);
        this.conversations.update(rows => rows.map(row => row.id === updated.id ? { ...row, ...updated } : row));
      }).subscribe();
  }

  async create(subjectInput: HTMLInputElement, messageInput: HTMLTextAreaElement): Promise<void> {
    const subject = subjectInput.value.trim();
    const body = messageInput.value.trim();
    if (!subject || !body || this.sending()) return;
    this.sending.set(true); this.error.set('');
    try {
      const user = await this.auth.getCurrentUser();
      if (!user?.email) throw new Error('Sign in to contact support.');
      const { data: conversation, error } = await this.client.from('support_conversations').insert({
        customer_user_id: user.id,
        customer_first_name: String(user.user_metadata?.['first_name'] ?? 'Customer').slice(0, 100),
        customer_last_name: String(user.user_metadata?.['last_name'] ?? '').slice(0, 100),
        customer_email: user.email,
        subject: subject.slice(0, 150),
      }).select('id,subject,status,updated_at').single();
      if (error) throw error;
      const { error: messageError } = await this.client.from('support_messages').insert({
        conversation_id: conversation.id, sender_type: 'customer', sender_user_id: user.id, body,
      });
      if (messageError) throw messageError;
      subjectInput.value = ''; messageInput.value = '';
      await this.load();
      await this.select(conversation as Conversation);
    } catch (e) { this.error.set(this.message(e)); }
    finally { this.sending.set(false); }
  }

  async send(input: HTMLTextAreaElement): Promise<void> {
    const body = input.value.trim();
    const conversation = this.active();
    if (!body || !conversation || conversation.status === 'resolved' || this.sending()) return;
    this.sending.set(true); this.error.set('');
    try {
      const user = await this.auth.getCurrentUser();
      if (!user) throw new Error('Please sign in again.');
      const { data, error } = await this.client.from('support_messages').insert({
        conversation_id: conversation.id, sender_type: 'customer', sender_user_id: user.id, body,
      }).select('id,conversation_id,sender_type,body,created_at').single();
      if (error) throw error;
      this.messages.update(rows => rows.some(row => row.id === data.id) ? rows : [...rows, data as Message]);
      input.value = '';
    } catch (e) { this.error.set(this.message(e)); }
    finally { this.sending.set(false); }
  }

  back(): void { this.disconnect(); this.active.set(null); this.messages.set([]); }
  private disconnect(): void {
    this.requestId++;
    if (this.channel) { void this.client.removeChannel(this.channel); this.channel = null; }
  }
  private message(e: unknown): string { return e instanceof Error ? e.message : 'Something went wrong. Please try again.'; }
}
