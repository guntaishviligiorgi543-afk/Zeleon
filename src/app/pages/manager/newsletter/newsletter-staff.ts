import { Component, inject, signal } from '@angular/core';
import { SUPABASE_CLIENT } from '../../../services/supabase';
import { StaffAccess } from '../../../services/staff-access';

interface Subscriber { id: string; email: string; status: string; created_at: string; confirmed_at: string | null; unsubscribed_at: string | null; }

@Component({
  selector: 'app-newsletter-staff',
  standalone: true,
  template: `
    <section class="newsletter-workspace">
      <header><h1>Newsletter</h1><p>Manage subscribers and subscription consent.</p></header>
      <button type="button" (click)="load()" [disabled]="busy()">Refresh</button>
      @if (message()) { <p role="status">{{ message() }}</p> }
      @if (staff.role() === 'support') {
        <form (submit)="unsubscribeById($event)">
          <label>Subscriber ID <input name="subscriberId" required placeholder="Subscriber UUID" /></label>
          <button type="submit" [disabled]="busy()">Unsubscribe</button>
        </form>
        <p>Support can unsubscribe a subscriber using their ID, but cannot view the full mailing list or delete records.</p>
      } @else {
        <p>{{ subscribers().length }} subscribers shown (latest 500).</p>
        @if (staff.role() === 'manager') { <button type="button" (click)="exportConsentReport()" [disabled]="busy()">Export consent report (CSV)</button> }
        <div style="overflow-x:auto">
          <table><thead><tr><th>Email</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>
            @for (subscriber of subscribers(); track subscriber.id) {
              <tr><td>{{ subscriber.email }}</td><td>{{ subscriber.status }}</td><td>{{ subscriber.created_at }}</td>
                <td>
                  @if (subscriber.status === 'active' || subscriber.status === 'pending_confirmation') {
                    <button type="button" (click)="manage('unsubscribe', subscriber.id)" [disabled]="busy()">Unsubscribe</button>
                  }
                  <button type="button" (click)="manage('delete', subscriber.id)" [disabled]="busy()">Delete</button>
                  @if (staff.role() === 'manager') {
                    <button type="button" (click)="showConsent(subscriber.id)" [disabled]="busy()">Consent</button>
                  }
                </td>
              </tr>
            }
          </tbody></table>
        </div>
      }
    </section>
  `,
  styles: [`
    .newsletter-workspace { padding: 24px; color: inherit; }
    header { margin-bottom: 24px; }
    button { padding: 9px 14px; margin: 4px; border: 1px solid #8a9ab2; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; }
    button:disabled { opacity: .5; cursor: wait; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { padding: 12px; border-bottom: 1px solid #9aa8b440; text-align: left; }
    input { padding: 10px; margin: 8px; }
  `],
})
export class NewsletterStaff {
  private readonly client = inject(SUPABASE_CLIENT);
  readonly staff = inject(StaffAccess);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly subscribers = signal<Subscriber[]>([]);

  constructor() { if (this.staff.role() !== 'support') void this.load(); }

  private async call(action: string, id?: string): Promise<any> {
    const { data, error } = await this.client.rpc('newsletter_staff_manage', { p_action: action, p_subscriber_id: id ?? null });
    if (error) throw error;
    return data;
  }

  async load(): Promise<void> {
    if (this.staff.role() === 'support') return;
    this.busy.set(true);
    try { const data = await this.call('list'); this.subscribers.set(data.subscribers ?? []); this.message.set('Subscriber list refreshed.'); }
    catch (error) { this.message.set(error instanceof Error ? error.message : 'Unable to load subscribers.'); }
    finally { this.busy.set(false); }
  }

  async manage(action: 'unsubscribe' | 'delete', id: string): Promise<void> {
    if (action === 'delete' && !confirm('Permanently delete this subscriber record?')) return;
    this.busy.set(true);
    try { await this.call(action, id); this.message.set(action === 'delete' ? 'Subscriber deleted.' : 'Subscriber unsubscribed.'); if (this.staff.role() !== 'support') await this.load(); }
    catch (error) { this.message.set(error instanceof Error ? error.message : 'Action failed.'); }
    finally { this.busy.set(false); }
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

  exportConsentReport(): void {
    this.message.set('Consent PDF export requires the protected server-side report endpoint; it is not enabled yet.');
  }
}
