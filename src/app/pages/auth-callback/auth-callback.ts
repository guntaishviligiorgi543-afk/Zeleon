import { afterNextRender, Component, DestroyRef, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';

@Component({
  selector: 'app-auth-callback',
  imports: [RouterLink],
  styleUrl: '../auth-form.css',
  template: `<section class="auth-page"><div class="brand-panel"><h2>Your ZELEON<br />account.</h2></div><div class="form-panel"><h1>{{ failed() ? 'Link unavailable' : 'Email confirmation' }}</h1><p class="form-status" role="status">{{ status() }}</p>@if (verified()) { <p class="account-link"><a routerLink="/profile">Continue to Profile</a></p> } @if (failed()) { <p class="account-link"><a routerLink="/login">Login or resend confirmation</a></p><p class="account-link"><a routerLink="/forgot-password">Request a new recovery email</a></p> }</div></section>`,
})
export class AuthCallback {
  readonly status = signal('Checking your link…');
  readonly failed = signal(false);
  readonly verified = signal(false);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  constructor() { afterNextRender(() => { void this.complete(); }); }

  private async complete(): Promise<void> {
    const view = this.document.defaultView;
    if (!view) return;
    const url = new URL(view.location.href);
    const code = url.searchParams.get('code');
    const flowId = url.searchParams.get('sb_flow_id') ?? undefined;
    const hasError = url.searchParams.has('error') || new URLSearchParams(url.hash.slice(1)).has('error');
    // Remove credentials and provider error details from address/history before rendering feedback.
    view.history.replaceState(view.history.state, '', url.pathname);
    try {
      if (hasError || !code) throw new Error('Invalid link');
      const type = await this.auth.completeCallback(code, flowId);
      if (this.destroyRef.destroyed) return;
      if (type === 'recovery') {
        await this.router.navigateByUrl('/reset-password', { replaceUrl: true });
      } else {
        this.verified.set(true);
        this.status.set('Your email has been verified. Your account is ready.');
      }
    } catch {
      if (this.destroyRef.destroyed) return;
      this.failed.set(true);
      this.status.set('This link is invalid, expired, already used, or was opened in a different browser. Request a new email and open it in the same browser where you started.');
    }
  }
}
