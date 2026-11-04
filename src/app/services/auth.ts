import { computed, DestroyRef, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './supabase';

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  phoneNumber: string;
}

interface SignupProfile { firstName: string; lastName: string; phoneNumber: string; preferredName?: string; }

export function authErrorMessage(error: unknown): string {
  const value = error as { code?: string; status?: number } | null;
  if (value?.status === 429 || value?.code === 'over_email_send_rate_limit' || value?.code === 'over_request_rate_limit') {
    return 'Too many attempts. Please wait a few minutes before trying again.';
  }
  switch (value?.code) {
    case 'invalid_credentials': return 'Unable to sign in. Check your email and password.';
    case 'email_not_confirmed': return 'Please verify your email with the code in your inbox before signing in.';
    case 'weak_password': return 'Choose a stronger password with at least 8 characters.';
    case 'same_password': return 'Choose a password different from your current password.';
    case 'signup_disabled': return 'Registration is currently unavailable. Please try again later.';
    case 'session_not_found':
    case 'refresh_token_not_found':
    case 'otp_expired':
    case 'invalid_otp':
    case 'bad_code': return 'That code is invalid or expired. Check it and try again, or request a new code.';
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
  private readonly sessionState = signal<Session | null>(null);
  readonly user = computed(() => this.toAuthUser(this.sessionState()?.user ?? null));
  readonly preferredName = signal('');
  readonly displayName = computed(() => this.preferredName() || [this.user()?.firstName, this.user()?.lastName].filter(Boolean).join(' '));
  readonly isAuthenticated = computed(() => !!this.sessionState()?.user);
  readonly initialized = signal(false);
  readonly recovering = signal(false);
  readonly initializationFailed = signal(false);
  readonly ready: Promise<void>;
  private revision = 0;

  constructor() {
    if (!this.browser) {
      this.initialized.set(true);
      this.ready = Promise.resolve();
      return;
    }
    const { data } = this.client.auth.onAuthStateChange((event: AuthChangeEvent, session) => {
      // Do not await another SDK call inside this auth-state callback.
      this.revision++;
      this.sessionState.set(session);
      // Keep the callback synchronous; SDK calls here can deadlock session initialization.
      if (!session) this.preferredName.set('');
      if (event === 'PASSWORD_RECOVERY') this.recovering.set(true);
      if (!session) this.recovering.set(false);
    });
    inject(DestroyRef).onDestroy(() => data.subscription.unsubscribe());
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    const revision = this.revision;
    try {
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      if (data.session) {
        // Verify a persisted session with Supabase before exposing it to the app.
        const verified = await this.client.auth.getUser();
        if (verified.error || !verified.data.user) throw verified.error ?? new Error('Invalid session');
        if (this.revision === revision) this.sessionState.set({ ...data.session, user: verified.data.user });
      } else if (this.revision === revision) this.sessionState.set(null);
    } catch {
      this.initializationFailed.set(true);
      this.sessionState.set(null);
    } finally {
      this.initialized.set(true);
    }
    if (this.user()) await this.importSignupPreferredName();
  }

  private async importSignupPreferredName(): Promise<void> {
    const initialName = this.sessionState()?.user.user_metadata?.['preferred_name'];
    if (typeof initialName !== 'string' || !initialName.trim()) return;
    try {
      await this.loadPreferredName();
      // Import only when the dedicated record is absent; never overwrite a later setting.
      if (!this.preferredName()) await this.savePreferredName(initialName);
    } catch {
      // The database migration may not be deployed yet; retain metadata for a future session.
    }
  }

  async signUp(email: string, password: string, profile: SignupProfile): Promise<{ hasSession: boolean }> {
    await this.ready;
    const { data, error } = await this.client.auth.signUp({
      email: email.trim(), password,
      options: {
        data: {
          first_name: profile.firstName.trim(),
          last_name: profile.lastName.trim(),
          phone_number: profile.phoneNumber.trim(),
          preferred_name: profile.preferredName?.trim() ?? '',
        },
      },
    });
    if (error) throw error;
    if (!data.user) throw new Error('The authentication service did not return an account.');
    this.sessionState.set(data.session);
    this.preferredName.set(profile.preferredName?.trim() ?? '');
    this.recovering.set(false);
    return { hasSession: !!data.session };
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.ready;
    const { data, error } = await this.client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    if (!data.session || !data.user) throw new Error('The authentication service did not return a session.');
    this.sessionState.set({ ...data.session, user: data.user });
    this.recovering.set(false);
  }

  async signOut(): Promise<void> {
    await this.ready;
    try {
      const { error } = await this.client.auth.signOut({ scope: 'local' });
      if (error) throw error;
    } finally {
      this.sessionState.set(null);
      this.preferredName.set('');
      this.recovering.set(false);
    }
  }

  async getCurrentUser(): Promise<User | null> {
    await this.ready;
    const { data, error } = await this.client.auth.getUser();
    if (error) throw error;
    return data.user;
  }

  async resetPassword(email: string): Promise<void> {
    await this.ready;
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim());
    if (error) throw error;
  }

  async verifyEmailOtp(email: string, token: string, type: 'email' | 'recovery'): Promise<void> {
    await this.ready;
    const { data, error } = await this.client.auth.verifyOtp({ email: email.trim(), token, type });
    if (error) throw error;
    if (!data.user || !data.session) throw new Error('The verification did not return an authenticated session.');
    this.sessionState.set({ ...data.session, user: data.user });
    this.recovering.set(type === 'recovery');
  }

  async requestEmailChange(email: string): Promise<void> {
    await this.ready;
    const { error } = await this.client.auth.updateUser({ email: email.trim() });
    if (error) throw error;
  }

  async verifyEmailChangeOtp(email: string, token: string): Promise<void> {
    await this.ready;
    const { data, error } = await this.client.auth.verifyOtp({ email: email.trim(), token, type: 'email_change' });
    if (error) throw error;
    if (!data.user || !data.session) throw new Error('Email verification did not return an authenticated session.');
    this.sessionState.set({ ...data.session, user: data.user });
  }

  async changePasswordWithReauthentication(currentPassword: string, newPassword: string): Promise<void> {
    await this.ready;
    const email = this.user()?.email;
    if (!email) throw new Error('The authenticated account does not have an email address.');
    const { data, error } = await this.client.auth.signInWithPassword({ email, password: currentPassword });
    if (error) throw error;
    if (!data.session || !data.user) throw new Error('Password verification did not return an authenticated session.');
    this.sessionState.set({ ...data.session, user: data.user });
    await this.updatePassword(newPassword);
  }

  async savePreferredName(preferredName: string): Promise<void> {
    await this.ready;
    const user = this.user();
    if (!user) throw new Error('Sign in to update your preferred name.');
    const value = preferredName.trim();
    const { error } = await this.client.from('user_preferred_names').upsert({
      user_id: user.id, preferred_name: value || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw error;
    this.preferredName.set(value);
  }

  async loadPreferredName(): Promise<void> {
    await this.ready;
    const user = this.user();
    if (!user) { this.preferredName.set(''); return; }
    const { data, error } = await this.client.from('user_preferred_names').select('preferred_name').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    this.preferredName.set(typeof data?.preferred_name === 'string' ? data.preferred_name : '');
  }

  async deleteAccount(): Promise<void> {
    await this.ready;
    const { error } = await this.client.functions.invoke('delete-account');
    if (error) throw error;
    const { data: { user } } = await this.client.auth.getUser();
    if (user) throw new Error('The account deletion was not confirmed.');
    // A successful admin deletion invalidates the current token; clear local state explicitly.
    await this.client.auth.signOut({ scope: 'local' });
    this.sessionState.set(null);
    this.preferredName.set('');
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
    const { error } = await this.client.auth.resend({
      type: 'signup', email: email.trim(),
    });
    if (error) throw error;
  }

  async completeCallback(code: string, flowId?: string): Promise<'recovery' | 'confirmation'> {
    await this.ready;
    this.recovering.set(false);
    const { data, error } = await this.client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (error || !data.session) throw error ?? new Error('Invalid authentication link');
    const verified = await this.client.auth.getUser();
    if (verified.error || !verified.data.user) throw verified.error ?? new Error('Invalid session');
    this.sessionState.set({ ...data.session, user: verified.data.user });
    return this.recovering() ? 'recovery' : 'confirmation';
  }

  private toAuthUser(user: User | null): AuthUser | null {
    if (!user) return null;
    const metadata = user.user_metadata ?? {};
    return {
      id: user.id,
      email: user.email ?? null,
      firstName: typeof metadata['first_name'] === 'string' ? metadata['first_name'] : '',
      lastName: typeof metadata['last_name'] === 'string' ? metadata['last_name'] : '',
      phoneNumber: typeof metadata['phone_number'] === 'string' ? metadata['phone_number'] : '',
    };
  }
}
