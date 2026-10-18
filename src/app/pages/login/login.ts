import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMAIL_PATTERN } from '../auth-validation';
import { Auth, authErrorMessage, profileDestination } from '../../services/auth';
import { ConfirmationResend } from '../../components/confirmation-resend/confirmation-resend';

@Component({
  imports: [ReactiveFormsModule, RouterLink, ConfirmationResend],
  selector: 'app-login',
  styleUrls: ['../auth-form.css', './login.css'],
  templateUrl: './login.html',
})
export class Login {
  readonly submitted = signal(false);
  readonly status = signal('');
  readonly pending = signal(false);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.pattern(EMAIL_PATTERN), Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.pattern(/^[\s\S]{8,128}$/)]],
  });

  async submit(): Promise<void> {
    if (this.pending()) return;
    this.submitted.set(true);
    this.form.markAllAsTouched();
    this.status.set('');
    if (this.form.invalid) return;
    this.pending.set(true);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.signIn(email, password);
      this.form.controls.password.reset();
      await this.router.navigateByUrl(profileDestination(this.route.snapshot.queryParamMap.get('returnUrl')));
    } catch (error) {
      this.status.set(authErrorMessage(error));
    } finally { this.pending.set(false); }
  }
}
