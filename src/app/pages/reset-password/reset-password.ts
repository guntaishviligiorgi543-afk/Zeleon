import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { inject, signal } from '@angular/core';
import { Auth, authErrorMessage } from '../../services/auth';
import { PasswordToggle } from '../../directives/password-toggle.directive';

@Component({
  selector: 'app-reset-password',
  imports: [RouterLink, ReactiveFormsModule, PasswordToggle],
  styleUrl: '../auth-form.css',
  templateUrl: './reset-password.html',
})
export class ResetPassword {
  readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
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
      if (!this.auth.recovering() || !this.auth.user()) throw { code: 'session_not_found' };
      await this.auth.updatePassword(this.form.controls.password.value);
      try { await this.auth.signOut(); } catch { /* Password update succeeded; local auth state is cleared in signOut's finally block. */ }
      this.done.set(true);
      this.form.reset();
      this.status.set('Your password has been updated successfully.');
      const returnToDelete = this.route.snapshot.queryParamMap.get('returnToDelete') === '1';
      if (returnToDelete) {
        await this.router.navigate(['/login'], { queryParams: { returnUrl: '/profile/security?delete=1' } });
      } else {
        await this.router.navigateByUrl('/login');
      }
    } catch (error) {
      this.status.set(authErrorMessage(error));
    } finally { this.pending.set(false); }
  }
}
