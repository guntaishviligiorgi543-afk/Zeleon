import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth, authErrorMessage } from '../../services/auth';
import { PasswordToggle } from '../../directives/password-toggle.directive';

const passwordsMatch: ValidatorFn = (form) =>
  form.get('password')?.value === form.get('confirmPassword')?.value ? null : { passwordMismatch: true };

@Component({
  imports: [FormsModule, ReactiveFormsModule, RouterLink, PasswordToggle],
  selector: 'app-signup',
  styleUrls: ['../auth-form.css', './signup.css'],
  templateUrl: './signup.html',
})
export class Signup {
  readonly submitted = signal(false);
  readonly status = signal('');
  readonly pending = signal(false);
  readonly result = signal<{ success: boolean; title: string; message: string } | null>(null);
  readonly resultAction = viewChild<ElementRef<HTMLButtonElement>>('resultAction');
  readonly verificationOpen = signal(false);
  readonly verificationEmail = signal('');
  readonly verificationCode = signal('');
  readonly verificationStatus = signal('');
  readonly verificationInvalid = signal(false);
  readonly verificationPending = signal(false);
  readonly resendPending = signal(false);
  readonly resendCooldown = signal(0);
  readonly otpInput = viewChild<ElementRef<HTMLInputElement>>('otpInput');
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private previousFocus: HTMLElement | null = null;
  private previousOverflow = '';
  private cooldownTimer?: ReturnType<typeof setInterval>;
  readonly form = inject(FormBuilder).nonNullable.group({
    firstName: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(80)]],
    lastName: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(80)]],
    preferredName: ['', [Validators.pattern(/\S/), Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.pattern(/^[\s\S]{8,128}$/)]],
    confirmPassword: ['', Validators.required],
  }, { validators: passwordsMatch });

  constructor() {
    this.destroyRef.onDestroy(() => {
      clearInterval(this.cooldownTimer);
      this.closeResult(false);
      this.closeVerification(false);
    });
  }

  async googleSignIn(): Promise<void> {
    if (this.pending()) return;
    this.pending.set(true);
    this.status.set('');
    try {
      const returnUrl = this.router.parseUrl(this.router.url).queryParams['returnUrl'];
      await this.auth.signInWithGoogle(typeof returnUrl === 'string' ? returnUrl : null);
    } catch (error) {
      this.status.set(authErrorMessage(error));
      this.pending.set(false);
    }
  }

  @HostListener('window:pageshow', ['$event'])
  restoreAfterBackNavigation(event: PageTransitionEvent): void {
    if (event.persisted) this.pending.set(false);
  }

  async submit(): Promise<void> {
    if (this.pending()) return;
    this.submitted.set(true);
    this.form.markAllAsTouched();
    this.status.set('');
    if (this.form.invalid) return;
    this.pending.set(true);
    try {
      const { firstName, lastName, preferredName, email, password } = this.form.getRawValue();
      const registration = await this.auth.signUp(email, password, { firstName, lastName, preferredName });
      this.form.controls.password.reset();
      this.form.controls.confirmPassword.reset();
      this.submitted.set(false);
      if (registration.hasSession) {
        this.showResult({ success: true, title: 'Registration Successful', message: 'Your account has been created successfully.' });
      } else {
        this.openVerification(email.trim());
      }
    } catch (error) {
      this.showResult({ success: false, title: 'Registration Failed', message: this.registrationError(error) });
    } finally { this.pending.set(false); }
  }

  async goHome(): Promise<void> {
    this.closeResult(false);
    await this.router.navigateByUrl('/');
  }

  onVerificationInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const code = input.value.replace(/\D/g, '').slice(0, 8);
    if (input.value !== code) input.value = code;
    this.verificationCode.set(code);
    this.verificationStatus.set('');
    this.verificationInvalid.set(false);
  }

  async verifyEmail(): Promise<void> {
    if (this.verificationPending()) return;
    const code = this.verificationCode();
    if (!/^\d{8}$/.test(code)) {
      this.verificationStatus.set('Enter the 8-digit code from your email.');
      this.verificationInvalid.set(true);
      return;
    }
    this.verificationPending.set(true);
    this.verificationStatus.set('');
    this.verificationInvalid.set(false);
    try {
      await this.auth.verifyEmailOtp(this.verificationEmail(), code, 'email');
      this.closeVerification(false);
      await this.router.navigateByUrl('/');
    } catch (error) {
      this.verificationStatus.set(authErrorMessage(error));
      this.verificationInvalid.set(true);
    } finally { this.verificationPending.set(false); }
  }

  async resendCode(): Promise<void> {
    if (this.resendPending() || this.resendCooldown() > 0) return;
    this.resendPending.set(true);
    this.verificationStatus.set('');
    this.verificationInvalid.set(false);
    try {
      await this.auth.resendConfirmationEmail(this.verificationEmail());
      this.verificationStatus.set('If another code is available, check your inbox and spam folder.');
    } catch (error) {
      this.verificationStatus.set(authErrorMessage(error));
    } finally {
      this.resendPending.set(false);
      this.startResendCooldown();
    }
  }

  cancelVerification(): void {
    if (this.verificationPending() || this.resendPending()) return;
    this.closeVerification();
  }

  closeResult(restoreFocus = true): void {
    if (!this.result()) return;
    this.result.set(null);
    this.document.body.style.overflow = this.previousOverflow;
    if (restoreFocus) this.previousFocus?.focus();
    this.previousFocus = null;
  }

  @HostListener('document:keydown.escape', ['$event'])
  dismissOnEscape(event: Event): void {
    if (this.verificationOpen()) {
      event.preventDefault();
      return;
    }
    if (!this.result()) return;
    event.preventDefault();
    this.closeResult();
  }

  private showResult(result: { success: boolean; title: string; message: string }): void {
    if (!this.result() && !this.verificationOpen()) {
      this.previousFocus = this.document.activeElement instanceof HTMLElement ? this.document.activeElement : null;
      this.previousOverflow = this.document.body.style.overflow;
    }
    this.document.body.style.overflow = 'hidden';
    this.result.set(result);
    queueMicrotask(() => this.resultAction()?.nativeElement.focus());
  }

  private openVerification(email: string): void {
    if (!this.result() && !this.verificationOpen()) {
      this.previousFocus = this.document.activeElement instanceof HTMLElement ? this.document.activeElement : null;
      this.previousOverflow = this.document.body.style.overflow;
    }
    this.document.body.style.overflow = 'hidden';
    this.verificationEmail.set(email);
    this.verificationCode.set('');
    this.verificationStatus.set('');
    this.verificationInvalid.set(false);
    this.verificationOpen.set(true);
    this.startResendCooldown();
    queueMicrotask(() => this.otpInput()?.nativeElement.focus());
  }

  private closeVerification(restoreFocus = true): void {
    if (!this.verificationOpen()) return;
    this.verificationOpen.set(false);
    clearInterval(this.cooldownTimer);
    this.cooldownTimer = undefined;
    this.resendCooldown.set(0);
    this.document.body.style.overflow = this.previousOverflow;
    if (restoreFocus) this.previousFocus?.focus();
    this.previousFocus = null;
  }

  private startResendCooldown(): void {
    clearInterval(this.cooldownTimer);
    this.resendCooldown.set(60);
    this.cooldownTimer = setInterval(() => {
      const remaining = this.resendCooldown() - 1;
      this.resendCooldown.set(Math.max(remaining, 0));
      if (remaining <= 0) {
        clearInterval(this.cooldownTimer);
        this.cooldownTimer = undefined;
      }
    }, 1000);
  }

  private registrationError(error: unknown): string {
    return authErrorMessage(error);
  }
}
