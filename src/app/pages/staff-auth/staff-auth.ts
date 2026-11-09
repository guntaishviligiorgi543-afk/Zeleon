import { Component, inject, signal } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { StaffAccess } from '../../services/staff-access';

@Component({
  selector: 'app-staff-auth',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule],
  templateUrl: './staff-auth.html',
  styleUrl: './staff-auth.css',
})
export class StaffAuth {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly staff = inject(StaffAccess);
  readonly pending = signal(false);
  readonly error = signal('');
  readonly currentPassword = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8), Validators.maxLength(128)] });
  readonly code = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{6}$/)] });

  get passwordError(): string {
    if (!this.currentPassword.invalid || !(this.currentPassword.dirty || this.currentPassword.touched)) return '';
    return this.currentPassword.hasError('required')
      ? 'Enter your current ZELEON password.'
      : 'Your password must contain 8–128 characters.';
  }

  get codeError(): string {
    if (!this.code.invalid || !(this.code.dirty || this.code.touched)) return '';
    if (this.code.hasError('required')) return 'Enter the code from your authenticator app.';
    return /\D/.test(this.code.value) ? 'Use numbers only (0–9).' : 'Enter all 6 digits from your authenticator app.';
  }

  async submit(): Promise<void> {
    this.currentPassword.markAsTouched();
    this.code.markAsTouched();
    if (this.currentPassword.invalid || this.code.invalid || this.pending()) return;
    this.pending.set(true);
    this.error.set('');
    try {
      await this.staff.verifySecondaryAuthentication(this.currentPassword.value, this.code.value);
      await this.router.navigateByUrl(this.returnUrl());
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Staff authentication failed. Try again.');
    } finally {
      this.currentPassword.reset();
      this.code.reset();
      this.pending.set(false);
    }
  }

  cancel(): void {
    void this.router.navigateByUrl('/profile');
  }

  private returnUrl(): string {
    const value = this.route.snapshot.queryParamMap.get('returnUrl');
    return value && /^\/(manager|admin|support)(?:[/?#]|$)/.test(value) ? value : '/profile';
  }
}
