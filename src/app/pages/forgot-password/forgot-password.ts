import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EMAIL_PATTERN } from '../auth-validation';
import { Auth, authErrorMessage } from '../../services/auth';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  selector: 'app-forgot-password',
  styleUrls: ['../auth-form.css', './forgot-password.css'],
  templateUrl: './forgot-password.html',
})
export class ForgotPassword {
  readonly submitted = signal(false);
  readonly status = signal('');
  readonly pending = signal(false);
  private readonly auth = inject(Auth);
  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.pattern(EMAIL_PATTERN), Validators.maxLength(254)]],
  });

  async submit(): Promise<void> {
    if (this.pending()) return;
    this.submitted.set(true);
    this.form.markAllAsTouched();
    this.status.set('');
    if (this.form.invalid) return;
    this.pending.set(true);
    try {
      await this.auth.resetPassword(this.form.controls.email.value);
      this.status.set('If an account exists for this email, a password recovery link will arrive shortly. Check your inbox and spam folder.');
    } catch (error) {
      this.status.set(authErrorMessage(error));
    } finally { this.pending.set(false); }
  }
}
