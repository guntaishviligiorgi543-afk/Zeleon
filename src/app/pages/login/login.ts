import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth, authErrorMessage, profileDestination } from '../../services/auth';
import { EMAIL_PATTERN } from '../auth-validation';
import { PasswordToggle } from '../../directives/password-toggle.directive';

@Component({
  imports: [ReactiveFormsModule, RouterLink, PasswordToggle],
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
      const returnUrl = this.router.parseUrl(this.router.url).queryParams['returnUrl'];
      const supportChat = this.router.parseUrl(this.router.url).queryParams['supportChat'];
      if (typeof supportChat === 'string' && /^[0-9a-f-]{36}$/i.test(supportChat)) {
        await this.router.navigate(['/'], { queryParams: { supportChat } });
      } else if (typeof returnUrl === 'string' && /^\/rate-support\/[0-9a-f-]{36}(?:\?stars=[1-5])?$/i.test(returnUrl)) {
        await this.router.navigateByUrl(returnUrl);
      } else {
        await this.router.navigateByUrl(typeof returnUrl === 'string' ? profileDestination(returnUrl) : '/');
      }
    } catch (error) {
      this.status.set(authErrorMessage(error));
    } finally { this.pending.set(false); }
  }
}
