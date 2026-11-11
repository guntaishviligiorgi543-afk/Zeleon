import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StaffAccess } from '../../../services/staff-access';
import {
  ManagerDashboard,
  StaffDirectoryEntry,
  SupportConversation,
  SupportMessage,
  SupportRatingEntry,
} from '../../../services/manager-dashboard';

@Component({
  selector: 'app-manager-support',
  imports: [DatePipe, FormsModule],
  templateUrl: './manager-support.html',
  styleUrls: ['../manager-page.css', './manager-support.css'],
})
export class ManagerSupport implements OnInit {
  private readonly dashboard = inject(ManagerDashboard);
  readonly access = inject(StaffAccess);
  readonly isSupport = this.access.role() === 'support';
  readonly section = signal<'conversations' | 'ratings'>('conversations');
  readonly ratings = signal<SupportRatingEntry[]>([]);
  readonly averageRating = computed(() => this.ratings().length ? (this.ratings().reduce((sum, row) => sum + row.rating, 0) / this.ratings().length).toFixed(1) : '—');
  readonly replyText = signal('');
  readonly escalationReason = signal('');
  readonly escalationTarget = signal<'admin' | 'manager'>('admin');
  readonly escalationOpen = signal(false);
  readonly sending = signal(false);
  readonly conversations = signal<SupportConversation[]>([]);
  readonly supportStaff = signal<StaffDirectoryEntry[]>([]);
  readonly filter = signal<'all' | SupportConversation['status']>('all');
  readonly loading = signal(true);
  readonly pendingId = signal<string | null>(null);
  readonly claiming = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly selected = signal<SupportConversation | null>(null);
  readonly messages = signal<SupportMessage[]>([]);
  readonly messagesLoading = signal(false);
  readonly filtered = computed(() =>
    this.filter() === 'all'
      ? this.conversations()
      : this.conversations().filter((conversation) => conversation.status === this.filter()),
  );
  readonly escalatedCount = computed(() => this.conversations().filter(c => c.status === 'escalated').length);
  readonly unresolvedCount = computed(
    () => this.conversations().filter((conversation) => conversation.status !== 'resolved').length,
  );

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [conversations, staff, ratings] = await Promise.all([
        this.dashboard.getSupportConversations(),
        this.isSupport ? Promise.resolve([] as StaffDirectoryEntry[]) : this.dashboard.getStaffDirectory(),
        this.dashboard.getSupportRatings(),
      ]);
      this.conversations.set(conversations);
      this.ratings.set(ratings);
      this.supportStaff.set(
        staff.filter((entry) => entry.role === 'support' && entry.status === 'active'),
      );
    } catch {
      this.error.set(
        'Support conversations could not be loaded. Verify the Manager session and try again.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  async assign(conversation: SupportConversation, value: string): Promise<void> {
    if (this.isSupport) return;
    await this.update(
      conversation,
      { assigned_support_id: value || null },
      'Conversation assignment updated.',
    );
  }

  async changeStatus(conversation: SupportConversation, value: string): Promise<void> {
    const allowed: SupportConversation['status'][] = [
      'open',
      'waiting_customer',
      'resolved',
      'escalated',
    ];
    if (!allowed.includes(value as SupportConversation['status'])) return;
    if (value === 'escalated' && conversation.status !== 'escalated') {
      this.selected.set(conversation);
      this.escalationReason.set('');
      this.escalationTarget.set('admin');
      this.escalationOpen.set(true);
      return;
    }
    await this.update(
      conversation,
      { status: value as SupportConversation['status'] },
      'Conversation status updated.',
    );
    if (value === 'resolved' && conversation.status !== 'resolved' && this.conversations().some(item => item.id === conversation.id && item.status === 'resolved')) {
      const result = await this.dashboard.notifySupportResolved(conversation.id);
      this.success.set(result === 'sent'
        ? 'Conversation resolved. Resolution email notification requested.'
        : 'Conversation resolved, but the customer email notification failed.');
    }
  }

  async escalateThread(): Promise<void> {
    const conversation = this.selected();
    const reason = this.escalationReason().trim();
    if (!conversation || reason.length < 10 || reason.length > 2000 || this.pendingId()) return;
    if (this.isSupport && !conversation.assigned_support_id) {
      try {
        const claimed = await this.dashboard.claimSupportConversation(conversation.id);
        if (!claimed) throw new Error('This request was already claimed by another agent.');
        await this.load();
      } catch (e) {
        this.error.set(e instanceof Error ? e.message : 'Claim this request before escalating.');
        return;
      }
    }
    const target = this.escalationTarget();
    const saved = await this.update(conversation, { status: 'escalated', escalation_reason: reason, escalation_target: target, escalated_at: new Date().toISOString() }, `Request escalated to ${target === 'admin' ? 'Admin' : 'Manager'} queue.`);
    if (!saved) return;
    const updated = this.conversations().find(item => item.id === conversation.id);
    if (updated?.status === 'escalated') {
      this.selected.set(updated);
      this.escalationOpen.set(false);
      const notification = await this.dashboard.notifySupportEscalated(conversation.id);
      this.success.set(notification === 'sent'
        ? `Request escalated to ${target}. Staff email notification requested.`
        : `Request escalated to ${target}, but staff email notification failed. The request remains available in the dashboard.`);
    }
  }

  async resumeThread(): Promise<void> {
    const conversation = this.selected();
    if (!conversation || conversation.status !== 'escalated') return;
    await this.changeStatus(conversation, 'open');
    const updated = this.conversations().find(item => item.id === conversation.id);
    if (updated?.status === 'open') this.selected.set(updated);
  }

  async resolveThread(): Promise<void> {
    const conversation = this.selected();
    if (!conversation || conversation.status === 'resolved' || this.pendingId()) return;
    await this.changeStatus(conversation, 'resolved');
    const updated = this.conversations().find(item => item.id === conversation.id);
    if (updated?.status === 'resolved') this.selected.set(updated);
  }

  async viewThread(conversation: SupportConversation): Promise<void> {
    this.selected.set(conversation);
    this.escalationOpen.set(false);
    this.replyText.set('');
    this.messages.set([]);
    this.messagesLoading.set(true);
    this.error.set('');
    try {
      this.messages.set(await this.dashboard.getSupportMessages(conversation.id));
    } catch {
      this.error.set('The protected conversation messages could not be loaded.');
    } finally {
      this.messagesLoading.set(false);
    }
  }

  async claim(conversation: SupportConversation): Promise<void> {
    if (!this.isSupport || conversation.assigned_support_id || this.claiming()) return;
    this.claiming.set(true);
    this.error.set('');
    try {
      const claimed = await this.dashboard.claimSupportConversation(conversation.id);
      if (!claimed) throw new Error('Another agent has already claimed this request.');
      await this.load();
      const updated = this.conversations().find(item => item.id === conversation.id);
      if (updated) await this.viewThread(updated);
      this.success.set('Request assigned to you. You can now reply.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not claim this request.');
    } finally { this.claiming.set(false); }
  }

  async sendReply(): Promise<void> {
    const selected = this.selected();
    const body = this.replyText().trim();
    if (!selected || !this.isSupport || !body || this.sending()) return;
    this.sending.set(true);
    this.error.set('');
    try {
      if (!selected.assigned_support_id) {
        const claimed = await this.dashboard.claimSupportConversation(selected.id);
        if (!claimed) throw new Error('This request was claimed by another agent.');
      }
      const result = await this.dashboard.sendSupportReply(selected.id, body);
      this.success.set('Reply sent. Email digest will be delivered if the customer is away from the chat.');
      this.replyText.set('');
      this.messages.set(await this.dashboard.getSupportMessages(selected.id));
      await this.load();
    } catch {
      this.error.set('Reply could not be sent. Verify assignment and conversation status.');
    } finally { this.sending.set(false); }
  }

  closeThread(): void {
    this.selected.set(null);
    this.escalationOpen.set(false);
    this.messages.set([]);
  }

  private async update(
    conversation: SupportConversation,
    changes: { assigned_support_id?: string | null; status?: SupportConversation['status']; escalation_reason?: string | null; escalation_target?: 'admin' | 'manager' | null; escalated_at?: string | null },
    message: string,
  ): Promise<boolean> {
    this.pendingId.set(conversation.id);
    this.error.set('');
    this.success.set('');
    try {
      await this.dashboard.updateConversation(conversation.id, changes);
      await this.load();
      const updated = this.conversations().find(item => item.id === conversation.id);
      if (!updated || (changes.status && updated.status !== changes.status)) throw new Error('The server did not confirm the status update. Check your staff permissions.');
      this.selected.update(current => current?.id === updated.id ? updated : current);
      this.success.set(message);
      return true;
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'The conversation could not be updated.');
      return false;
    } finally {
      this.pendingId.set(null);
    }
  }
}
