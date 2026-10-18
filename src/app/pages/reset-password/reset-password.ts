import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Auth, authErrorMessage } from '../../services/auth';

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink],
  styleUrl: '../auth-form.css',
  templateUrl: './reset-password.html',
})
export class ResetPassword {
  readonly auth = inject(Auth);
  readonly pending = signal(false);
  readonly submitted = signal(false);
  readonly done = signal(false);
  readonly status = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({
    password: ['', [Validators.required, Validators.pattern(/^[\s\S]{8,128}$/)]],
    confirmPassword: ['', Validators.required],
  }, { validators: (form) => form.get('password')?.value === form.get('confirmPassword')?.value ? null : { passwordMismatch: true } });

  async submit(): Promise<void> {
    if (this.pending() || this.done()) return;
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.pending.set(true);
    this.status.set('');
    try {
      await this.auth.ready;
      if (!this.auth.user()) throw { code: 'session_not_found' };
      await this.auth.updatePassword(this.form.controls.password.value);
      this.done.set(true);
      this.form.reset();
      this.status.set('Your password has been updated successfully.');
    } catch (error) {
      this.status.set(authErrorMessage(error));
    } finally { this.pending.set(false); }
  }
}
