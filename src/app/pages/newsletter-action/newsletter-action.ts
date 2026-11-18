import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-newsletter-action',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section style="max-width:560px;margin:80px auto;padding:30px;text-align:center">
      <h1>{{ isConfirm ? 'Confirm Newsletter' : 'Unsubscribe from Newsletter' }}</h1>
      <p role="status">{{ message() }}</p>
      @if (!completed()) {
        <button type="button" (click)="submit()" [disabled]="busy()">
          {{ busy() ? 'Processing…' : (isConfirm ? 'Confirm subscription' : 'Confirm unsubscribe') }}
        </button>
      }
      <p><a routerLink="/">Return to ZELEON</a></p>
    </section>
  `,
})
export class NewsletterAction {
  private readonly route = inject(ActivatedRoute);
  readonly isConfirm = this.route.snapshot.data['action'] === 'confirm';
  readonly busy = signal(false);
  readonly completed = signal(false);
  readonly message = signal('Please confirm your choice.');
  async submit(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token || !/^[0-9a-f]{64}$/.test(token)) {
      this.message.set('This link is invalid or incomplete.');
      return;
    }
    this.busy.set(true);
    try {
      const response = await fetch('https://nunxmgltzvknnmkdvjsw.supabase.co/functions/v1/newsletter-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: this.isConfirm ? 'confirm' : 'unsubscribe', token }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to complete request.');
      this.message.set(data.message || 'Request completed.');
      this.completed.set(true);
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Please try again later.');
    } finally {
      this.busy.set(false);
    }
  }
}
