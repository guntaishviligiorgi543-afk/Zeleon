import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SUPABASE_CLIENT } from '../../../services/supabase';
import { StaffAccess } from '../../../services/staff-access';
import { Auth } from '../../../services/auth';

type Customer = {
  id: string;
  email: string;
  created_at: string;
  status: 'active' | 'suspended' | 'deactivated';
};
type Request = {
  id: string;
  target_user_id: string;
  requested_by: string;
  action: 'suspend' | 'deactivate';
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  manager_reply: string | null;
  created_at: string;
};
@Component({
  selector: 'app-manager-users',
  imports: [DatePipe, FormsModule],
  templateUrl: './manager-users.html',
  styleUrls: ['../manager-page.css', './manager-users.css'],
})
export class ManagerUsers implements OnInit {
  private readonly client = inject(SUPABASE_CLIENT);
  readonly access = inject(StaffAccess);
  readonly auth = inject(Auth);
  readonly isManager = this.access.role() === 'manager';
  readonly users = signal<Customer[]>([]);
  readonly requests = signal<Request[]>([]);
  readonly search = signal('');
  readonly reason = signal<Record<string, string>>({});
  readonly reasonCategory = signal<Record<string, string>>({});
  readonly reasonOptions = [
    { value: 'abusive_support', label: 'Abusive or offensive communication toward Support' },
    { value: 'suspected_payment_fraud', label: 'Suspected payment falsification or fraudulent activity' },
  ] as const;
  setReasonCategory(id: string, value: string) {
    this.reasonCategory.update((x) => ({ ...x, [id]: value }));
  }
  readonly decision = signal<Record<string, string>>({});
  readonly busy = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly filtered = computed(() =>
    this.users().filter((u) => u.email?.toLowerCase().includes(this.search().toLowerCase())),
  );
  ngOnInit() {
    void this.load();
  }
  private async call(action: string, extra: Record<string, unknown> = {}) {
    const { data, error } = await this.client.functions.invoke('customer-account-management', {
      body: { action, ...extra },
    });
    if (error) {
      let message = 'Request failed. Refresh your staff session and try again.';
      try {
        const body = await error.context?.json();
        if (typeof body?.error === 'string') message = body.error;
      } catch {}
      throw new Error(message);
    }
    if (!data || data.error) throw new Error(data?.error || 'Account service returned no data.');
    return data;
  }
  async load() {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const data = await this.call('list');
      this.users.set(data.users ?? []);
      this.requests.set(data.requests ?? []);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not load users');
    } finally {
      this.loading.set(false);
    }
  }
  setReason(id: string, value: string) {
    this.reason.update((x) => ({ ...x, [id]: value }));
  }
  setDecision(id: string, value: string) {
    this.decision.update((x) => ({ ...x, [id]: value }));
  }
  email(id: string) {
    return this.users().find((u) => u.id === id)?.email ?? id;
  }
  async perform(action: string, extra: Record<string, unknown>, message: string) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    try {
      const result = await this.call(action, extra);
      this.success.set(
        message +
          (result.emailSent
            ? ' Email notification requested.'
            : ' Email delivery was not confirmed.'),
      );
      await this.load();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      this.busy.set(false);
    }
  }
  request(u: Customer, kind: 'suspend' | 'deactivate') {
    if (this.access.role() !== 'admin' || u.status !== 'active') return;
    const category = this.reasonCategory()[u.id];
    const detail = (this.reason()[u.id] ?? '').trim();
    if (!category) {
      this.error.set('Select a reason category.');
      return;
    }
    if (detail.length < 10 || detail.length > 1700) {
      this.error.set('Provide supporting details of 10 to 1700 characters.');
      return;
    }
    const label = this.reasonOptions.find((option) => option.value === category)?.label;
    if (!label) {
      this.error.set('Invalid reason category.');
      return;
    }
    const reason = label + ' — ' + detail;
    void this.perform(
      'request',
      { targetUserId: u.id, kind, reason },
      'Manager approval requested.',
    );
  }
  canExecute(r: Request) {
    return (
      this.access.role() === 'admin' &&
      r.status === 'approved' &&
      r.requested_by === this.auth.user()?.id
    );
  }
  decide(r: Request, decision: 'approved' | 'rejected') {
    if (!this.isManager || r.status !== 'pending') return;
    const reply = (this.decision()[r.id] ?? '').trim();
    if (reply.length < 10 || reply.length > 2000) {
      this.error.set('Provide a decision explanation of 10 to 2000 characters.');
      return;
    }
    void this.perform('decide', { requestId: r.id, decision, reply }, 'Decision saved.');
  }
  execute(r: Request) {
    if (
      !this.canExecute(r) ||
      !confirm('Execute the approved ' + r.action + ' for ' + this.email(r.target_user_id) + '?')
    )
      return;
    void this.perform('execute', { requestId: r.id }, 'Account action completed.');
  }
}
