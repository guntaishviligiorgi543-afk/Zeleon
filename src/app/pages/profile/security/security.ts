import { Component, inject, signal } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Auth, authErrorMessage } from '../../../services/auth';
import { Cart } from '../../../services/cart';
import { PasswordToggle } from '../../../directives/password-toggle.directive';

type SecurityAction = 'overview' | 'email' | 'password';
type FeedbackDialog = { kind: 'success' | 'error'; title: string; message: string };

@Component({ imports: [FormsModule, ReactiveFormsModule, PasswordToggle], selector: 'app-security', styleUrl: './security.css', templateUrl: './security.html' })
export class Security {
  readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly cart = inject(Cart);
  readonly action = signal<SecurityAction>('overview');
  readonly pending = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly deleteOpen = signal(false);
  readonly feedbackDialog = signal<FeedbackDialog | null>(null);
  readonly preferredName = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(80)] });
  readonly newEmail = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email, Validators.maxLength(254)] });
  readonly code = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{8}$/)] });
  readonly currentPassword = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  readonly newPassword = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[\s\S]{8,128}$/)] });
  readonly confirmPassword = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  readonly emailCodeSent = signal(false);

  constructor() {
    void this.loadName();
    if (this.route.snapshot.queryParamMap.get('delete') === '1') this.deleteOpen.set(true);
  }
  private async loadName(): Promise<void> { try { await this.auth.loadPreferredName(); this.preferredName.setValue(this.auth.preferredName()); } catch { this.error.set('Preferred names are not available until the database migration is applied.'); } }
  start(action: SecurityAction): void { this.action.set(action); this.message.set(''); this.error.set(''); this.feedbackDialog.set(null); this.emailCodeSent.set(false); }
  closeFeedbackDialog(): void { this.feedbackDialog.set(null); }
  private showSuccess(message: string): void { this.feedbackDialog.set({ kind: 'success', title: 'Completed', message }); }
  private showError(message: string): void { this.feedbackDialog.set({ kind: 'error', title: 'Could not complete', message }); }
  cancel(): void { this.start('overview'); this.clearPasswords(); this.code.reset(); }
  async saveName(): Promise<void> {
    if (this.pending() || this.preferredName.invalid) return;
    this.pending.set(true); this.error.set(''); this.message.set('');
    try { await this.auth.savePreferredName(this.preferredName.value); this.message.set('Preferred name saved.'); this.showSuccess('Your preferred name was saved successfully.'); }
    catch { const reason = 'The preferred-name database migration may not be applied, or the request was rejected. Apply the migration and try again.'; this.error.set(reason); this.showError(reason); }
    finally { this.pending.set(false); }
  }
  async requestEmail(): Promise<void> {
    if (this.pending()) return;
    this.newEmail.markAsTouched(); if (this.newEmail.invalid) { this.showError('Enter a valid email address before requesting a change.'); return; }
    this.pending.set(true); this.error.set(''); this.message.set('');
    try { await this.auth.requestEmailChange(this.newEmail.value); this.emailCodeSent.set(true); this.message.set('Check the new address for a verification code. If your project requires confirmation of both addresses, check the current address too.'); }
    catch (error) { const reason = authErrorMessage(error); this.error.set(reason); this.showError(`The verification code could not be sent. ${reason}`); }
    finally { this.pending.set(false); }
  }
  onEmailCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const code = input.value.replace(/\D/g, '').slice(0, 8);
    if (input.value !== code) input.value = code;
    this.code.setValue(code);
    this.error.set('');
  }
  async verifyEmail(): Promise<void> {
    if (this.pending()) return;
    this.code.markAsTouched(); if (this.code.invalid) { this.showError('Enter the complete 8-digit verification code.'); return; }
    this.pending.set(true); this.error.set('');
    try { await this.auth.verifyEmailChangeOtp(this.newEmail.value, this.code.value); this.cancel(); this.message.set('Email address updated successfully.'); this.showSuccess('Your email address was updated successfully.'); }
    catch (error) { const reason = authErrorMessage(error); this.error.set(reason); this.showError(`The email address was not updated. ${reason}`); }
    finally { this.pending.set(false); }
  }
  async changePassword(): Promise<void> {
    if (this.pending()) return;
    this.currentPassword.markAsTouched(); this.newPassword.markAsTouched(); this.confirmPassword.markAsTouched();
    if (this.currentPassword.invalid || this.newPassword.invalid || this.confirmPassword.invalid || this.newPassword.value !== this.confirmPassword.value) { const reason = 'Enter a valid new password and make sure both new password fields match.'; this.error.set(reason); this.showError(reason); return; }
    this.pending.set(true); this.error.set(''); this.message.set('');
    try { await this.auth.changePasswordWithReauthentication(this.currentPassword.value, this.newPassword.value); this.clearPasswords(); this.action.set('overview'); this.message.set('Password changed successfully.'); this.showSuccess('Your password was changed successfully.'); }
    catch (error) { const reason = authErrorMessage(error); this.error.set(reason); this.showError(`The password was not changed. ${reason}`); }
    finally { this.pending.set(false); }
  }
  cancelDelete(): void { if (!this.pending()) this.deleteOpen.set(false); }
  openDelete(): void {
    this.currentPassword.reset();
    this.error.set('');
    this.deleteOpen.set(true);
  }
  async confirmDelete(): Promise<void> {
    if (this.pending()) return;
    this.currentPassword.markAsTouched();
    if (this.currentPassword.invalid) {
      const reason = 'Enter your current password to confirm account deletion, or reset it first.';
      this.error.set(reason);
      this.showError(reason);
      return;
    }
    this.pending.set(true); this.error.set('');
    try {
      await this.auth.deleteAccount(this.currentPassword.value);
      this.currentPassword.reset();
      this.cart.clear();
      this.deleteOpen.set(false);
      await this.router.navigateByUrl('/');
    }
    catch { const reason = 'The account is still active. The delete-account Edge Function may be unavailable, or Supabase rejected the request. Deploy the function and try again.'; this.error.set(reason); this.showError(`Account deletion failed. ${reason}`); }
    finally { this.pending.set(false); }
  }
  resetPasswordForDeletion(): void {
    if (this.pending()) return;
    this.deleteOpen.set(false);
    void this.router.navigate(['/forgot-password'], { queryParams: { returnToDelete: '1' } });
  }
  private clearPasswords(): void { this.currentPassword.reset(); this.newPassword.reset(); this.confirmPassword.reset(); }
}
