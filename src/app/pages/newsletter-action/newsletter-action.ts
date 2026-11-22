import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

type State = 'checking' | 'pending' | 'confirmed' | 'expired' | 'invalid' | 'success' | 'error';

@Component({
  selector: 'app-newsletter-action',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './newsletter-action.html',
  styleUrl: './newsletter-action.css',
})
export class NewsletterAction implements OnInit {
  private readonly route = inject(ActivatedRoute);
  readonly isConfirm = this.route.snapshot.data['action'] === 'confirm';
  readonly busy = signal(false);
  readonly state = signal<State>('checking');
  readonly message = signal('');
  private readonly endpoint = 'https://nunxmgltzvknnmkdvjsw.supabase.co/functions/v1/newsletter-management';

  private get token(): string { return this.route.snapshot.queryParamMap.get('token') ?? ''; }

  private async request(action: string): Promise<{ status?: string; message?: string; error?: string }> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: this.token }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to complete your request.');
    return data;
  }

  async ngOnInit(): Promise<void> {
    if (!/^[0-9a-f]{64}$/.test(this.token)) {
      this.state.set('invalid'); return;
    }
    if (!this.isConfirm) { this.state.set('pending'); return; }
    try {
      const data = await this.request('status');
      const status = data.status;
      this.state.set(status === 'confirmed' ? 'confirmed' : status === 'pending' ? 'pending' : status === 'expired' ? 'expired' : 'invalid');
    } catch {
      this.message.set('We could not check this link. Please try again.');
      this.state.set('error');
    }
  }

  async submit(): Promise<void> {
    if (this.busy() || !/^[0-9a-f]{64}$/.test(this.token)) return;
    this.busy.set(true);
    this.message.set('');
    try {
      const data = await this.request(this.isConfirm ? 'confirm' : 'unsubscribe');
      if (data.status === 'already_confirmed') this.state.set('confirmed');
      else {
        this.message.set(data.message ?? (this.isConfirm ? 'Subscription confirmed.' : 'Subscription cancelled.'));
        this.state.set('success');
      }
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Please try again.');
      this.state.set('error');
    } finally { this.busy.set(false); }
  }

  async retry(): Promise<void> {
    this.message.set('');
    if (this.isConfirm) { this.state.set('checking'); await this.ngOnInit(); }
    else this.state.set('pending');
  }
}
