import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth, authErrorMessage } from '../../../services/auth';
import { Cart } from '../../../services/cart';
import { PasswordToggle } from '../../../directives/password-toggle.directive';

type SecurityAction = 'overview' | 'email' | 'password';

@Component({ imports: [ReactiveFormsModule, PasswordToggle], selector: 'app-security', styleUrl: './security.css', templateUrl: './security.html' })
export class Security {
  readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly cart = inject(Cart);
  readonly action = signal<SecurityAction>('overview');
  readonly pending = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly deleteOpen = signal(false);
  readonly preferredName = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(80)] });
  readonly newEmail = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email, Validators.maxLength(254)] });
  readonly code = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{6}$/)] });
  readonly currentPassword = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  readonly newPassword = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[\s\S]{8,128}$/)] });
  readonly confirmPassword = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  readonly emailCodeSent = signal(false);

  constructor() { void this.loadName(); }
  private async loadName(): Promise<void> { try { await this.auth.loadPreferredName(); this.preferredName.setValue(this.auth.preferredName()); } catch { this.error.set('Preferred names are not available until the database migration is applied.'); } }
  start(action: SecurityAction): void { this.action.set(action); this.message.set(''); this.error.set(''); this.emailCodeSent.set(false); }
  cancel(): void { this.start('overview'); this.clearPasswords(); this.code.reset(); }
  async saveName(): Promise<void> {
    if (this.pending() || this.preferredName.invalid) return;
    this.pending.set(true); this.error.set(''); this.message.set('');
    try { await this.auth.savePreferredName(this.preferredName.value); this.message.set('Preferred name saved.'); }
    catch { this.error.set('Preferred name could not be saved. Apply the user_preferred_names migration and try again.'); }
    finally { this.pending.set(false); }
  }
  async requestEmail(): Promise<void> {
    if (this.pending()) return;
    this.newEmail.markAsTouched(); if (this.newEmail.invalid) return;
    this.pending.set(true); this.error.set(''); this.message.set('');
    try { await this.auth.requestEmailChange(this.newEmail.value); this.emailCodeSent.set(true); this.message.set('Check the new address for a verification code. If your project requires confirmation of both addresses, check the current address too.'); }
    catch (error) { this.error.set(authErrorMessage(error)); }
    finally { this.pending.set(false); }
  }
  async verifyEmail(): Promise<void> {
    if (this.pending()) return;
    this.code.markAsTouched(); if (this.code.invalid) return;
    this.pending.set(true); this.error.set('');
    try { await this.auth.verifyEmailChangeOtp(this.newEmail.value, this.code.value); this.message.set('Email address updated successfully.'); this.cancel(); this.message.set('Email address updated successfully.'); }
    catch (error) { this.error.set(authErrorMessage(error)); }
    finally { this.pending.set(false); }
  }
  async changePassword(): Promise<void> {
    if (this.pending()) return;
    this.currentPassword.markAsTouched(); this.newPassword.markAsTouched(); this.confirmPassword.markAsTouched();
    if (this.currentPassword.invalid || this.newPassword.invalid || this.confirmPassword.invalid || this.newPassword.value !== this.confirmPassword.value) { this.error.set('Enter a valid new password and make sure both new password fields match.'); return; }
    this.pending.set(true); this.error.set(''); this.message.set('');
    try { await this.auth.changePasswordWithReauthentication(this.currentPassword.value, this.newPassword.value); this.clearPasswords(); this.action.set('overview'); this.message.set('Password changed successfully.'); }
    catch (error) { this.error.set(authErrorMessage(error)); }
    finally { this.pending.set(false); }
  }
  cancelDelete(): void { if (!this.pending()) this.deleteOpen.set(false); }
  async confirmDelete(): Promise<void> {
    if (this.pending()) return;
    this.pending.set(true); this.error.set('');
    try {
      await this.auth.deleteAccount();
      this.cart.clear();
      this.deleteOpen.set(false);
      await this.router.navigateByUrl('/');
    }
    catch { this.error.set('Account deletion failed. The account is still active. Check that the delete-account Edge Function is deployed.'); }
    finally { this.pending.set(false); }
  }
  private clearPasswords(): void { this.currentPassword.reset(); this.newPassword.reset(); this.confirmPassword.reset(); }
}
