import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EMAIL_PATTERN } from '../auth-validation';
import { Auth, authErrorMessage } from '../../services/auth';
import { ConfirmationResend } from '../../components/confirmation-resend/confirmation-resend';

const passwordsMatch: ValidatorFn = (form) =>
  form.get('password')?.value === form.get('confirmPassword')?.value ? null : { passwordMismatch: true };

@Component({
  imports: [ReactiveFormsModule, RouterLink, ConfirmationResend],
  selector: 'app-signup',
  styleUrls: ['../auth-form.css', './signup.css'],
  templateUrl: './signup.html',
})
export class Signup {
  readonly submitted = signal(false);
  readonly status = signal('');
  readonly pending = signal(false);
  readonly confirmationSent = signal(false);
  private readonly auth = inject(Auth);
  readonly authUser = this.auth.user;
  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.pattern(EMAIL_PATTERN), Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.pattern(/^[\s\S]{8,128}$/)]],
    confirmPassword: ['', Validators.required],
  }, { validators: passwordsMatch });

  async submit(): Promise<void> {
    if (this.pending()) return;
    this.submitted.set(true);
    this.form.markAllAsTouched();
    this.status.set('');
    if (this.form.invalid) return;
    this.pending.set(true);
    try {
      const { name, email, password } = this.form.getRawValue();
      const data = await this.auth.signUp(email, password, name);
      this.confirmationSent.set(!data.session);
      this.status.set(data.session ? 'Your account is ready. You can open your profile.' : 'Check your email to confirm your account. If you already have an account, try signing in or resetting your password.');
      this.form.controls.password.reset();
      this.form.controls.confirmPassword.reset();
      this.submitted.set(false);
    } catch (error) {
      this.status.set(authErrorMessage(error));
    } finally { this.pending.set(false); }
  }
}
