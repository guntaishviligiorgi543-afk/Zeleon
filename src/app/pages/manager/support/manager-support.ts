import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StaffAccess } from '../../../services/staff-access';
import {
  ManagerDashboard,
  StaffDirectoryEntry,
  SupportConversation,
  SupportMessage,
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
  readonly replyText = signal('');
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
      const [conversations, staff] = await Promise.all([
        this.dashboard.getSupportConversations(),
        this.isSupport ? Promise.resolve([] as StaffDirectoryEntry[]) : this.dashboard.getStaffDirectory(),
      ]);
      this.conversations.set(conversations);
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

  async resolveThread(): Promise<void> {
    const conversation = this.selected();
    if (!conversation || conversation.status === 'resolved' || this.pendingId()) return;
    await this.changeStatus(conversation, 'resolved');
    const updated = this.conversations().find(item => item.id === conversation.id);
    if (updated?.status === 'resolved') this.selected.set(updated);
  }

  async viewThread(conversation: SupportConversation): Promise<void> {
    this.selected.set(conversation);
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
      this.success.set(result.emailNotification === 'sent' ? 'Reply sent and customer email notification requested.' : 'Reply sent, but customer email notification could not be delivered.');
      this.replyText.set('');
      this.messages.set(await this.dashboard.getSupportMessages(selected.id));
      await this.load();
    } catch {
      this.error.set('Reply could not be sent. Verify assignment and conversation status.');
    } finally { this.sending.set(false); }
  }

  closeThread(): void {
    this.selected.set(null);
    this.messages.set([]);
  }

  private async update(
    conversation: SupportConversation,
    changes: { assigned_support_id?: string | null; status?: SupportConversation['status'] },
    message: string,
  ): Promise<void> {
    this.pendingId.set(conversation.id);
    this.error.set('');
    this.success.set('');
    try {
      await this.dashboard.updateConversation(conversation.id, changes);
      await this.load();
      this.success.set(message);
    } catch {
      this.error.set(
        'The conversation could not be updated. Only active Support employees can be assigned.',
      );
    } finally {
      this.pendingId.set(null);
    }
  }
}
