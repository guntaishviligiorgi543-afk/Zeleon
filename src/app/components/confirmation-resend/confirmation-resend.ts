import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { Auth, authErrorMessage } from '../../services/auth';
import { EMAIL_PATTERN } from '../../pages/auth-validation';

@Component({
  selector: 'app-confirmation-resend',
  template: `<button type="button" [disabled]="busy() || coolingDown()" (click)="resend()">{{ coolingDown() ? 'Please wait before resending' : 'Resend confirmation email' }}</button><p role="status">{{ status() }}</p>`,
  styles: `:host { display: block; } button { padding: 0; border: 0; background: transparent; color: inherit; font: inherit; font-size: 13px; text-decoration: underline; cursor: pointer; } button:disabled { opacity: .5; cursor: wait; } button:focus-visible { outline: 2px solid currentColor; outline-offset: 4px; } p { font-size: 13px; line-height: 1.6; } p:empty { display: none; }`,
})
export class ConfirmationResend {
  readonly email = input('');
  readonly busy = signal(false);
  readonly coolingDown = signal(false);
  readonly status = signal('');
  private readonly auth = inject(Auth);
  private readonly destroyRef = inject(DestroyRef);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() { this.destroyRef.onDestroy(() => clearTimeout(this.timer)); }

  async resend(): Promise<void> {
    if (this.busy() || this.coolingDown()) return;
    if (!EMAIL_PATTERN.test(this.email().trim())) {
      this.status.set('Enter a valid email address in the email field first.');
      return;
    }
    this.busy.set(true);
    this.status.set('');
    try {
      await this.auth.resendConfirmationEmail(this.email());
      if (!this.destroyRef.destroyed) this.status.set('If confirmation is needed, a new email will arrive shortly. Check your inbox and spam folder.');
    } catch (error) {
      if (!this.destroyRef.destroyed) this.status.set(authErrorMessage(error));
    } finally {
      if (!this.destroyRef.destroyed) {
        this.busy.set(false);
        this.coolingDown.set(true);
        this.timer = setTimeout(() => this.coolingDown.set(false), 60_000);
      }
    }
  }
}
