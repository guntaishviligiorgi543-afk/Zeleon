import { Component } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DestroyRef, signal, inject } from '@angular/core';
import { Auth, authErrorMessage } from '../../services/auth';
import { EMAIL_PATTERN } from '../auth-validation';

@Component({
  imports: [FormsModule, RouterLink, ReactiveFormsModule],
  selector: 'app-forgot-password',
  styleUrls: ['../auth-form.css', './forgot-password.css'],
  templateUrl: './forgot-password.html',
})
export class ForgotPassword {
  readonly submitted = signal(false);
  readonly pending = signal(false);
  readonly otpRequested = signal(false);
  readonly code = signal('');
  readonly codeInvalid = signal(false);
  readonly verifyPending = signal(false);
  readonly resendPending = signal(false);
  readonly resendCooldown = signal(0);
  readonly status = signal('');
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private cooldownTimer?: ReturnType<typeof setInterval>;
  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.pattern(EMAIL_PATTERN), Validators.maxLength(254)]],
  });

  constructor() { this.destroyRef.onDestroy(() => clearInterval(this.cooldownTimer)); }

  async submit(): Promise<void> {
    if (this.pending()) return;
    this.submitted.set(true);
    this.form.markAllAsTouched();
    this.status.set('');
    if (this.form.invalid) return;
    this.pending.set(true);
    try {
      await this.auth.resetPassword(this.form.controls.email.value);
      this.otpRequested.set(true);
      this.code.set('');
      this.status.set('If an account exists for this email, a recovery code has been sent.');
      this.startResendCooldown();
    } catch (error) {
      this.status.set(authErrorMessage(error));
    } finally { this.pending.set(false); }
  }

  onCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const code = input.value.replace(/\D/g, '').slice(0, 8);
    if (input.value !== code) input.value = code;
    this.code.set(code);
    this.status.set('');
    this.codeInvalid.set(false);
  }

  async verifyCode(): Promise<void> {
    if (this.verifyPending()) return;
    const code = this.code();
    if (!/^\d{8}$/.test(code)) {
      this.status.set('Enter the 8-digit code from your email.');
      this.codeInvalid.set(true);
      return;
    }
    this.verifyPending.set(true);
    this.status.set('');
    this.codeInvalid.set(false);
    try {
      await this.auth.verifyEmailOtp(this.form.controls.email.value, code, 'recovery');
      await this.router.navigateByUrl('/reset-password');
    } catch (error) {
      this.status.set(authErrorMessage(error));
      this.codeInvalid.set(true);
    } finally { this.verifyPending.set(false); }
  }

  async resendCode(): Promise<void> {
    if (this.resendPending() || this.resendCooldown() > 0) return;
    this.resendPending.set(true);
    this.status.set('');
    try {
      await this.auth.resetPassword(this.form.controls.email.value);
      this.status.set('If another code is available, check your inbox and spam folder.');
    } catch (error) {
      this.status.set(authErrorMessage(error));
    } finally {
      this.resendPending.set(false);
      this.startResendCooldown();
    }
  }

  private startResendCooldown(): void {
    clearInterval(this.cooldownTimer);
    this.resendCooldown.set(60);
    this.cooldownTimer = setInterval(() => {
      const remaining = this.resendCooldown() - 1;
      this.resendCooldown.set(Math.max(remaining, 0));
      if (remaining <= 0) {
        clearInterval(this.cooldownTimer);
        this.cooldownTimer = undefined;
      }
    }, 1000);
  }
}
