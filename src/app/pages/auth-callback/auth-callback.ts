import { afterNextRender, Component, DestroyRef, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';

@Component({
  selector: 'app-auth-callback',
  imports: [RouterLink],
  styleUrl: '../auth-form.css',
  styles: `.callback-loading { display: grid; min-height: 60vh; margin: 0; padding: 150px 24px 64px; place-content: center; color: #fff; font: 500 14px 'Montserrat', sans-serif; }`,
  template: `@if (verified() || failed()) {
    <section class="auth-page"><div class="brand-panel"><h2>Your ZELEON<br />account.</h2></div><div class="form-panel"><h1>{{ failed() ? 'Sign-in unavailable' : 'Email confirmed' }}</h1><p class="form-status" role="status">{{ status() }}</p>@if (verified()) { <p class="account-link"><a routerLink="/profile">Continue to Profile</a></p> } @if (failed()) { <p class="account-link"><a routerLink="/login">Return to Login</a></p><p class="account-link"><a routerLink="/forgot-password">Request a new recovery email</a></p> }</div></section>
  } @else {
    <p class="callback-loading" role="status" aria-live="polite">Signing you in…</p>
  }`,
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
    const isGoogle = url.searchParams.has('code') && !flowId;
    const destination = this.auth.consumeGoogleDestination();
    const hash = new URLSearchParams(url.hash.slice(1));
    const cancelled = (url.searchParams.get('error') ?? hash.get('error')) === 'access_denied';
    const hasError = url.searchParams.has('error') || new URLSearchParams(url.hash.slice(1)).has('error');
    // Remove credentials and provider error details from address/history before rendering feedback.
    view.history.replaceState(view.history.state, '', url.pathname);
    try {
      if (hasError || !code) throw new Error('Invalid link');
      const type = await this.auth.completeCallback(code, flowId);
      if (this.destroyRef.destroyed) return;
      if (type === 'recovery') {
        await this.router.navigateByUrl('/reset-password', { replaceUrl: true });
      } else if (isGoogle) {
        await this.router.navigateByUrl(destination, { replaceUrl: true });
      } else {
        this.verified.set(true);
        this.status.set('Your email has been verified. Your account is ready.');
      }
    } catch {
      if (this.destroyRef.destroyed) return;
      this.failed.set(true);
      this.status.set(cancelled ? 'Google sign-in was cancelled. Return to Login to try again or use your email and password.' : 'Sign-in could not be completed. The link may be expired, already used, or opened in a different browser. Start sign-in again, or request a new email and open it in the same browser.');
    }
  }
}
