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

  async sendReply(): Promise<void> {
    const selected = this.selected();
    const body = this.replyText().trim();
    if (!selected || !this.isSupport || !body || this.sending()) return;
    this.sending.set(true);
    this.error.set('');
    try {
      await this.dashboard.sendSupportReply(selected.id, body);
      this.replyText.set('');
      this.messages.set(await this.dashboard.getSupportMessages(selected.id));
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
