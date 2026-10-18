import { computed, DestroyRef, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Session } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './supabase';

export function authErrorMessage(error: unknown): string {
  const value = error as { code?: string; status?: number } | null;
  if (value?.status === 429 || value?.code === 'over_email_send_rate_limit' || value?.code === 'over_request_rate_limit') {
    return 'Too many attempts. Please wait a few minutes before trying again.';
  }
  switch (value?.code) {
    case 'invalid_credentials': return 'Unable to sign in. Check your email and password.';
    case 'email_not_confirmed': return 'Please confirm your email before signing in. You can resend the confirmation below.';
    case 'weak_password': return 'Choose a stronger password with at least 8 characters.';
    case 'same_password': return 'Choose a password different from your current password.';
    case 'signup_disabled': return 'Registration is currently unavailable. Please try again later.';
    case 'session_not_found':
    case 'refresh_token_not_found':
    case 'otp_expired': return 'Your link or session has expired. Please request a new email.';
    default: return 'The request could not be completed. Please try again.';
  }
}

export function profileDestination(value: string | null): string {
  return value && /^\/profile(?:\/[^\\\s]*|[?#][^\\\s]*)?$/.test(value) ? value : '/profile';
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly client = inject(SUPABASE_CLIENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);
  private readonly sessionState = signal<Session | null>(null);
  readonly user = computed(() => this.sessionState()?.user ?? null);
  readonly initialized = signal(false);
  readonly recovering = signal(false);
  readonly initializationFailed = signal(false);
  readonly ready: Promise<void>;
  private revision = 0;

  constructor() {
    if (this.browser) {
      const { data } = this.client.auth.onAuthStateChange((event, session) => {
        // Never await another Auth method inside this SDK lock callback.
        this.revision++;
        this.sessionState.set(session);
        if (event === 'PASSWORD_RECOVERY') this.recovering.set(true);
        if (!session) this.recovering.set(false);
      });
      inject(DestroyRef).onDestroy(() => data.subscription.unsubscribe());
      this.ready = this.initialize();
    } else {
      this.initialized.set(true);
      this.ready = Promise.resolve();
    }
  }

  private async initialize(): Promise<void> {
    const revision = this.revision;
    try {
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      if (data.session) {
        const result = await this.client.auth.getUser();
        if (result.error || !result.data.user) throw result.error;
        if (this.revision === revision) this.sessionState.set({ ...data.session, user: result.data.user });
      } else if (this.revision === revision) this.sessionState.set(null);
    } catch {
      this.initializationFailed.set(true);
      this.sessionState.set(null);
    } finally {
      this.initialized.set(true);
    }
  }

  private callbackUrl(): string {
    const origin = this.document.defaultView?.location.origin;
    if (!this.browser || !origin) throw new Error('Authentication requires a browser.');
    return `${origin}/auth/callback`;
  }

  async signUp(email: string, password: string, name: string) {
    await this.ready;
    const { data, error } = await this.client.auth.signUp({ email: email.trim(), password,
      options: { data: { full_name: name.trim() }, emailRedirectTo: this.callbackUrl() } });
    if (error) throw error;
    if (data.session) this.sessionState.set(data.session);
    return data;
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.ready;
    const { data, error } = await this.client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    this.sessionState.set(data.session);
    this.recovering.set(false);
  }

  async signOut(): Promise<void> {
    await this.ready;
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
    this.sessionState.set(null);
    this.recovering.set(false);
  }

  async getCurrentUser() {
    await this.ready;
    const { data, error } = await this.client.auth.getUser();
    if (error) throw error;
    return data.user;
  }

  async getSession() {
    await this.ready;
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async resetPassword(email: string): Promise<void> {
    await this.ready;
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim(), { redirectTo: this.callbackUrl() });
    if (error) throw error;
  }

  async updatePassword(password: string): Promise<void> {
    await this.ready;
    const { data, error } = await this.client.auth.updateUser({ password });
    if (error) throw error;
    this.sessionState.update((session) => session ? { ...session, user: data.user } : null);
    this.recovering.set(false);
  }

  async resendConfirmationEmail(email: string): Promise<void> {
    await this.ready;
    const { error } = await this.client.auth.resend({ type: 'signup', email: email.trim(),
      options: { emailRedirectTo: this.callbackUrl() } });
    if (error) throw error;
  }

  async completeCallback(code: string, flowId?: string): Promise<'recovery' | 'confirmation'> {
    await this.ready;
    this.recovering.set(false);
    const { data, error } = await this.client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (error || !data.session) throw error ?? new Error('Invalid confirmation link');
    const verified = await this.client.auth.getUser();
    if (verified.error || !verified.data.user) throw verified.error ?? new Error('Invalid session');
    this.sessionState.set({ ...data.session, user: verified.data.user });
    return this.recovering() ? 'recovery' : 'confirmation';
  }
}
