import { Component, computed, inject, signal } from '@angular/core';
import { SUPABASE_CLIENT } from '../../../services/supabase';
import { StaffAccess } from '../../../services/staff-access';

interface Subscriber {
  id: string;
  email: string;
  status: string;
  created_at: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
}
type SubscriberTab = 'active' | 'pending_confirmation' | 'unsubscribed';

@Component({
  selector: 'app-newsletter-staff',
  standalone: true,
  template: `
    <section data-aos="fade" data-aos-duration="450" data-aos-offset="0" data-aos-once="true" data-aos-mirror="false" class="page newsletter-workspace">
      <header>
        <h1>Newsletter</h1>
        <p>Manage subscribers and subscription consent.</p>
      </header>
      <button type="button" (click)="load()" [disabled]="busy()">Refresh</button>
      @if (message()) { <p role="status">{{ message() }}</p> }
      @if (staff.role() === 'support') {
        <form (submit)="unsubscribeById($event)">
          <label>Subscriber ID <input name="subscriberId" required placeholder="Subscriber UUID" /></label>
          <button type="submit" [disabled]="busy()">Unsubscribe</button>
        </form>
        <p>Support can unsubscribe a subscriber using their ID, but cannot view the full mailing list or delete records.</p>
      } @else {
        <p class="explanation">Only <strong>Active Subscribers</strong> have confirmed their email and are eligible to receive newsletters. Pending requests are not subscriptions.</p>
        <nav class="subscriber-tabs" aria-label="Newsletter subscriber status">
          <button type="button" [class.selected]="tab() === 'active'"
            [attr.aria-current]="tab() === 'active' ? 'page' : null" (click)="tab.set('active')">
            Active Subscribers <span>{{ activeSubscribers().length }}</span>
          </button>
          <button type="button" [class.selected]="tab() === 'pending_confirmation'"
            [attr.aria-current]="tab() === 'pending_confirmation' ? 'page' : null" (click)="tab.set('pending_confirmation')">
            Pending Confirmation <span>{{ pendingSubscribers().length }}</span>
          </button>
          <button type="button" [class.selected]="tab() === 'unsubscribed'"
            [attr.aria-current]="tab() === 'unsubscribed' ? 'page' : null" (click)="tab.set('unsubscribed')">
            Unsubscribed <span>{{ unsubscribedSubscribers().length }}</span>
          </button>
        </nav>
        <p class="list-info">{{ visibleSubscribers().length }} {{ tab() === 'active' ? 'confirmed subscribers' : tab() === 'pending_confirmation' ? 'pending requests' : 'inactive subscribers' }} shown (latest 500 records across all statuses).</p>
        @if (staff.role() === 'manager') {
          <button type="button" (click)="exportConsentReport()" [disabled]="busy()">Export consent report (PDF)</button>
        }
        <div class="table-wrap">
          <table>
            <thead><tr><th>Email</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>
              @for (subscriber of visibleSubscribers(); track subscriber.id) {
                <tr>
                  <td>{{ subscriber.email }}</td>
                  <td><span class="status-badge" [class.is-active]="subscriber.status === 'active'">{{ subscriber.status === 'pending_confirmation' ? 'Awaiting email confirmation' : subscriber.status === 'active' ? 'Confirmed' : 'Unsubscribed' }}</span></td>
                  <td>{{ subscriber.created_at }}</td>
                  <td class="actions">
                    @if (subscriber.status === 'active' || subscriber.status === 'pending_confirmation') {
                      <button type="button" (click)="manage('unsubscribe', subscriber.id)" [disabled]="busy()">Unsubscribe</button>
                    }
                    <button type="button" (click)="manage('delete', subscriber.id)" [disabled]="busy()">Delete</button>
                    @if (staff.role() === 'manager') {
                      <button type="button" (click)="showConsent(subscriber.id)" [disabled]="busy()">Consent</button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="empty-state">
                  {{ tab() === 'active' ? 'No confirmed subscribers in this list.' : tab() === 'pending_confirmation' ? 'No pending confirmation requests in this list.' : 'No unsubscribed addresses in this list.' }}
                </td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
  styleUrls: ['../manager-page.css'],
  styles: [`
    .newsletter-workspace { padding:24px; color:inherit; min-width:0; }
    header { margin-bottom:24px; }
    header h1 { margin-bottom:8px; }
    header p,.explanation,.list-info { line-height:1.55; }
    .explanation { margin:20px 0 16px; color:var(--workspace-muted,#65728a); font-size:.88rem; }
    .explanation strong { color:var(--workspace-text,#24334e); }
    button { padding:9px 14px; margin:4px; border:1px solid var(--workspace-line,#8a9ab2); border-radius:8px; background:var(--workspace-surface,transparent); color:inherit; cursor:pointer; font:inherit; }
    button:disabled { opacity:.5; cursor:wait; }
    .subscriber-tabs { display:flex; flex-wrap:wrap; gap:8px; margin:16px 0; }
    .subscriber-tabs button { display:inline-flex; align-items:center; gap:10px; min-height:44px; margin:0; padding:9px 15px; }
    .subscriber-tabs button.selected { border-color:#2868ff; background:#2868ff; color:white; }
    .subscriber-tabs span { padding:2px 8px; border-radius:12px; background:#778ab233; font-size:.8rem; }
    .list-info { font-size:.8rem; color:var(--workspace-muted,#65728a); }
    .table-wrap { overflow-x:auto; max-width:100%; }
    table { width:100%; border-collapse:collapse; margin-top:16px; }
    th,td { padding:12px; border-bottom:1px solid #9aa8b440; text-align:left; vertical-align:middle; }
    .status-badge { display:inline-block; padding:5px 9px; border-radius:18px; background:var(--workspace-subtle,#edf2f8); white-space:nowrap; font-size:.75rem; }
    .status-badge.is-active { background:var(--workspace-success-bg,#e7f7ef); color:var(--workspace-success-text,#14704a); }
    td.actions { white-space:nowrap; }
    .empty-state { text-align:center; padding:28px; color:var(--workspace-muted,#65728a); }
    input { padding:10px; margin:8px; }
    @media(max-width:600px) { .newsletter-workspace { padding:12px; } td.actions { white-space:normal; } }
  `],
})
export class NewsletterStaff {
  private readonly client = inject(SUPABASE_CLIENT);
  readonly staff = inject(StaffAccess);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly subscribers = signal<Subscriber[]>([]);
  readonly tab = signal<SubscriberTab>('active');
  readonly activeSubscribers = computed(() => this.subscribers().filter(s => s.status === 'active' && s.confirmed_at !== null));
  readonly pendingSubscribers = computed(() => this.subscribers().filter(s => s.status === 'pending_confirmation'));
  readonly unsubscribedSubscribers = computed(() => this.subscribers().filter(s => s.status === 'unsubscribed' || (s.status === 'active' && s.confirmed_at === null)));
  readonly visibleSubscribers = computed(() => {
    switch (this.tab()) {
      case 'active': return this.activeSubscribers();
      case 'pending_confirmation': return this.pendingSubscribers();
      case 'unsubscribed': return this.unsubscribedSubscribers();
    }
  });

  constructor() { if (this.staff.role() !== 'support') void this.load(); }

  private async call(action: string, id?: string): Promise<any> {
    const { data, error } = await this.client.rpc('newsletter_staff_manage', { p_action: action, p_subscriber_id: id ?? null });
    if (error) throw error;
    return data;
  }

  async load(): Promise<void> {
    if (this.staff.role() === 'support') return;
    this.busy.set(true);
    try {
      const data = await this.call('list');
      this.subscribers.set(Array.isArray(data?.subscribers) ? data.subscribers : []);
      this.message.set('Subscriber list refreshed.');
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Unable to load subscribers.');
    } finally { this.busy.set(false); }
  }

  async manage(action: 'unsubscribe' | 'delete', id: string): Promise<void> {
    if (action === 'delete' && !confirm('Permanently delete this subscriber record?')) return;
    this.busy.set(true);
    try {
      await this.call(action, id);
      if (this.staff.role() !== 'support') {
        // Refresh without resetting the selected status tab.
        const data = await this.call('list');
        this.subscribers.set(Array.isArray(data?.subscribers) ? data.subscribers : []);
      }
      this.message.set(action === 'delete' ? 'Subscriber deleted.' : 'Subscriber unsubscribed.');
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Action failed.');
    } finally { this.busy.set(false); }
  }

  async unsubscribeById(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const id = (new FormData(form).get('subscriberId') ?? '').toString().trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) { this.message.set('Enter a valid subscriber UUID.'); return; }
    await this.manage('unsubscribe', id);
  }

  async showConsent(id: string): Promise<void> {
    this.busy.set(true);
    try { const data = await this.call('consent', id); this.message.set(JSON.stringify(data, null, 2)); }
    catch (error) { this.message.set(error instanceof Error ? error.message : 'Unable to verify consent.'); }
    finally { this.busy.set(false); }
  }

  async exportConsentReport(): Promise<void> {
    if (this.staff.role() !== 'manager' || this.busy()) return;
    this.busy.set(true);
    this.message.set('');
    try {
      // Generate the PDF on the server: no subscriber data is loaded into the browser
      // just to export a report, and only verified Managers may call this endpoint.
      const { data: session, error: sessionError } = await this.client.auth.getSession();
      if (sessionError || !session.session?.access_token) throw new Error('Please sign in again before exporting.');
      const response = await fetch(
        'https://nunxmgltzvknnmkdvjsw.supabase.co/functions/v1/newsletter-consent-report',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + session.session.access_token,
            'Content-Type': 'application/json',
          },
          body: '{}',
        },
      );
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.error || 'Unable to generate PDF report.');
      }
      const blob = await response.blob();
      if (blob.type !== 'application/pdf' || blob.size < 100) throw new Error('Invalid PDF response.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'zeleon-newsletter-consent-' + new Date().toISOString().slice(0, 10) + '.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.message.set('Consent PDF report downloaded.');
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Unable to export consent PDF.');
    } finally {
      this.busy.set(false);
    }
  }
}
