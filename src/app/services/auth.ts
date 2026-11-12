import { computed, DestroyRef, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './supabase';

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  phoneNumber: string;
}

interface SignupProfile { firstName: string; lastName: string; preferredName?: string; }

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
    case 'email_exists':
    case 'user_already_exists': return 'That email address cannot be used. Try a different address.';
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
  private readonly document = inject(DOCUMENT);
  private callbackExchange: { key: string; promise: Promise<'recovery' | 'confirmation'> } | null = null;
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
    const userId = this.user()?.id;
    const initialName = this.sessionState()?.user.user_metadata?.['preferred_name'];
    if (!userId || typeof initialName !== 'string' || !initialName.trim()) return;
    try {
      // Initialization cannot call methods that await this.ready: that is the
      // promise currently executing. Preserve any existing preference record.
      const { data, error } = await this.client.from('user_preferred_names')
        .select('preferred_name').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      if (data) {
        if (this.user()?.id === userId) this.preferredName.set(data.preferred_name ?? '');
        return;
      }
      const imported = await this.client.from('user_preferred_names').upsert({
        user_id: userId, preferred_name: initialName.trim(), updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id', ignoreDuplicates: true });
      if (imported.error) throw imported.error;
      if (this.user()?.id === userId) this.preferredName.set(initialName.trim());
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
          preferred_name: profile.preferredName?.trim() ?? '',
        },
      },
    });
    if (error) throw error;
    if (!data.user) throw new Error('The authentication service did not return an account.');
    this.sessionState.set(data.session);
    this.preferredName.set(profile.preferredName?.trim() ?? '');
    this.recovering.set(false);
    if (data.session && (data.user.email_confirmed_at || data.user.confirmed_at)) await this.requestWelcomeEmail();
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

  async signInWithGoogle(returnUrl: string | null = null): Promise<void> {
    await this.ready;
    if (!this.browser) return;
    const view = this.document.defaultView;
    if (!view) throw new Error('Google sign-in requires a browser.');
    // Store only a validated local destination; leave callback URLs exact so
    // existing Supabase allowlist entries work in production and on any dev port.
    try { view.sessionStorage.setItem('zeleon.oauth.destination', JSON.stringify({ path: profileDestination(returnUrl), startedAt: Date.now() })); } catch { /* Default to Profile when session storage is unavailable. */ }
    const redirectTo = new URL('/auth/callback', view.location.origin).toString();
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error || !data.url) {
      this.consumeGoogleDestination();
      throw error ?? new Error('Google sign-in did not return a redirect URL.');
    }
  }

  consumeGoogleDestination(): string {
    try {
      const storage = this.document.defaultView?.sessionStorage;
      const raw = storage?.getItem('zeleon.oauth.destination');
      storage?.removeItem('zeleon.oauth.destination');
      if (raw) {
        const value = JSON.parse(raw);
        if (typeof value.startedAt === 'number' && Date.now() - value.startedAt >= 0 && Date.now() - value.startedAt < 15 * 60_000) return profileDestination(typeof value.path === 'string' ? value.path : null);
      }
    } catch { /* Untrusted or unavailable browser storage must not block login. */ }
    return '/profile';
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
    if (type === 'email') await this.requestWelcomeEmail();
  }

  async requestEmailChange(email: string): Promise<void> {
    await this.ready;
    const { error } = await this.client.auth.updateUser({ email: email.trim() });
    if (error) throw error;
  }

  async verifyEmailChangeOtp(email: string, token: string): Promise<void> {
    await this.ready;
    const requestedEmail = email.trim();
    const currentUser = await this.client.auth.getUser();
    if (currentUser.error) throw currentUser.error;
    if (!currentUser.data.user) throw new Error('The authenticated account could not be confirmed.');
    const { data, error } = await this.client.auth.verifyOtp({ email: requestedEmail, token, type: 'email_change' });
    if (error) throw error;
    if (!data.user || !data.session) throw new Error('Email verification did not return an authenticated session.');
    if (data.user.id !== currentUser.data.user.id || data.user.email !== requestedEmail) {
      throw new Error('Email verification did not update the authenticated account.');
    }
    const refreshed = await this.client.auth.getUser();
    if (refreshed.error) throw refreshed.error;
    if (!refreshed.data.user || refreshed.data.user.id !== currentUser.data.user.id || refreshed.data.user.email !== requestedEmail) {
      throw new Error('The updated email could not be confirmed.');
    }
    this.sessionState.set({ ...data.session, user: refreshed.data.user });
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

  async deleteAccount(currentPassword: string): Promise<void> {
    await this.ready;
    const email = this.user()?.email;
    if (!email) throw new Error('The authenticated account does not have an email address.');
    const { data: session, error: reauthenticationError } = await this.client.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (reauthenticationError) throw reauthenticationError;
    if (!session.user || !session.session || session.user.id !== this.user()?.id) {
      throw new Error('Password verification did not return the authenticated account.');
    }
    this.sessionState.set({ ...session.session, user: session.user });
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
    const before = await this.client.auth.getUser();
    if (before.error) throw before.error;
    if (!before.data.user) throw new Error('The authenticated account could not be confirmed.');
    const { data, error } = await this.client.auth.updateUser({ password });
    if (error) throw error;
    if (!data.user || data.user.id !== before.data.user.id || data.user.email !== before.data.user.email) {
      throw new Error('The password update was not confirmed for the authenticated account.');
    }
    const after = await this.client.auth.getUser();
    if (after.error) throw after.error;
    if (!after.data.user || after.data.user.id !== before.data.user.id || after.data.user.email !== before.data.user.email) {
      throw new Error('The password update session could not be confirmed.');
    }
    this.sessionState.update((session) => session ? { ...session, user: after.data.user } : null);
    this.recovering.set(false);
  }

  private async requestWelcomeEmail(): Promise<void> {
    try {
      const { error } = await this.client.functions.invoke('send-welcome-email');
      if (error) console.error('Welcome email could not be requested:', error.message);
    } catch (error) {
      console.error('Welcome email request failed:', error);
    }
  }

  async resendConfirmationEmail(email: string): Promise<void> {
    await this.ready;
    const { error } = await this.client.auth.resend({
      type: 'signup', email: email.trim(),
    });
    if (error) throw error;
  }

  completeCallback(code: string, flowId?: string): Promise<'recovery' | 'confirmation'> {
    const key = JSON.stringify([code, flowId]);
    if (this.callbackExchange?.key === key) return this.callbackExchange.promise;
    const promise = this.exchangeCallback(code, flowId);
    this.callbackExchange = { key, promise };
    return promise;
  }

  private async exchangeCallback(code: string, flowId?: string): Promise<'recovery' | 'confirmation'> {
    await this.ready;
    this.recovering.set(false);
    const { data, error } = await this.client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (error || !data.session) throw error ?? new Error('Invalid authentication link');
    const verified = await this.client.auth.getUser();
    if (verified.error || !verified.data.user || verified.data.user.id !== data.session.user.id) throw verified.error ?? new Error('Invalid session');
    this.sessionState.set({ ...data.session, user: verified.data.user });
    return this.recovering() ? 'recovery' : 'confirmation';
  }

  private toAuthUser(user: User | null): AuthUser | null {
    if (!user) return null;
    const metadata = user.user_metadata ?? {};
    return {
      id: user.id,
      email: user.email ?? null,
      firstName: typeof metadata['first_name'] === 'string' ? metadata['first_name'] : typeof metadata['given_name'] === 'string' ? metadata['given_name'] : typeof metadata['full_name'] === 'string' ? metadata['full_name'] : '',
      lastName: typeof metadata['last_name'] === 'string' ? metadata['last_name'] : typeof metadata['given_name'] === 'string' && typeof metadata['family_name'] === 'string' ? metadata['family_name'] : '',
      phoneNumber: typeof metadata['phone_number'] === 'string' ? metadata['phone_number'] : '',
    };
  }
}
