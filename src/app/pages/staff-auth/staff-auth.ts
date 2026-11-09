import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { StaffAccess } from '../../services/staff-access';
import { SUPABASE_CLIENT } from '../../services/supabase';

@Component({
  selector: 'app-staff-auth',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule],
  templateUrl: './staff-auth.html',
  styleUrl: './staff-auth.css',
})
export class StaffAuth implements OnInit, OnDestroy {
  private readonly client = inject(SUPABASE_CLIENT);
  readonly enrollmentNeeded = signal(false);
  readonly enrollmentFactorId = signal<string | null>(null);
  readonly qrUrl = signal<string | null>(null);
  private qrObjectUrl: string | null = null;

  ngOnInit(): void { void this.checkEnrollment(); }
  ngOnDestroy(): void { this.clearQr(); }

  private clearQr(): void {
    if (this.qrObjectUrl) URL.revokeObjectURL(this.qrObjectUrl);
    this.qrObjectUrl = null;
    this.qrUrl.set(null);
  }

  async checkEnrollment(): Promise<void> {
    try {
      const assignment = await this.staff.load();
      if (assignment?.status !== 'active') return;
      const { data, error } = await this.client.auth.mfa.listFactors();
      if (error) throw error;
      this.enrollmentNeeded.set(!data.totp.some(f => f.status === 'verified'));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to check authenticator enrollment.');
    }
  }

  async startEnrollment(): Promise<void> {
    if (this.pending()) return;
    this.pending.set(true);
    this.error.set('');
    try {
      const assignment = await this.staff.load();
      if (assignment?.status !== 'active') throw new Error('An active staff assignment is required.');
      const { data: existing, error: listError } = await this.client.auth.mfa.listFactors();
      if (listError) throw listError;
      if (existing.totp.some(f => f.status === 'verified')) {
        this.enrollmentNeeded.set(false);
        return;
      }
      // Remove stale, unverified factors to avoid exhausting the enrollment limit.
      for (const factor of existing.totp.filter(f => f.status !== 'verified')) {
        const { error } = await this.client.auth.mfa.unenroll({ factorId: factor.id });
        if (error) throw error;
      }
      const { data, error } = await this.client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'ZELEON Staff' });
      if (error) throw error;
      if (!data?.totp?.qr_code) throw new Error('QR code could not be generated.');
      this.clearQr();
      this.enrollmentFactorId.set(data.id);
      const svg = data.totp.qr_code;
      if (!/^\s*<svg[\s>]/i.test(svg)) throw new Error('Unexpected QR code format.');
      this.qrObjectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      this.qrUrl.set(this.qrObjectUrl);
      this.code.reset();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not start authenticator setup.');
    } finally { this.pending.set(false); }
  }

  async confirmEnrollment(): Promise<void> {
    this.code.markAsTouched();
    const factorId = this.enrollmentFactorId();
    if (this.pending() || this.code.invalid || !factorId) return;
    this.pending.set(true);
    this.error.set('');
    try {
      const { error } = await this.client.auth.mfa.challengeAndVerify({ factorId, code: this.code.value });
      if (error) throw error;
      this.enrollmentFactorId.set(null);
      this.clearQr();
      this.enrollmentNeeded.set(false);
      this.code.reset();
      // Enrollment confirms the factor; a fresh password + TOTP is still required for staff access.
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Authenticator verification failed.');
    } finally { this.pending.set(false); }
  }

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
    if (this.enrollmentNeeded()) return;
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
