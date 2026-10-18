import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { Auth, authErrorMessage, profileDestination } from './auth';
import { SUPABASE_CLIENT } from './supabase';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { vi } from 'vitest';

describe('Auth', () => {
  const session = { user: { id: 'user-1', email: 'person@example.com' }, access_token: 'test-token' } as Session;
  let listener: (event: AuthChangeEvent, session: Session | null) => void;
  let sdk: Record<string, ReturnType<typeof vi.fn>>;
  let unsubscribe: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    unsubscribe = vi.fn();
    sdk = {
      onAuthStateChange: vi.fn((callback) => { listener = callback; return { data: { subscription: { unsubscribe } } }; }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: session.user }, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { user: session.user, session: null }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: { user: session.user }, error: null }),
      resend: vi.fn().mockResolvedValue({ error: null }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    };
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: { auth: sdk } }] });
  });

  it('restores a stored session and validates its user before initialization finishes', async () => {
    sdk['getSession'].mockResolvedValue({ data: { session }, error: null });
    const auth = TestBed.inject(Auth);
    expect(auth.initialized()).toBe(false);
    await auth.ready;
    expect(auth.user()?.id).toBe('user-1');
    expect(sdk['getUser']).toHaveBeenCalledOnce();
    expect(auth.initialized()).toBe(true);
    expect(await auth.getSession()).toBe(session);
    expect(await auth.getCurrentUser()).toBe(session.user);
  });

  it('fails closed when a restored user cannot be verified', async () => {
    sdk['getSession'].mockResolvedValue({ data: { session }, error: null });
    sdk['getUser'].mockResolvedValue({ data: { user: null }, error: { code: 'bad_jwt' } });
    const auth = TestBed.inject(Auth);
    await auth.ready;
    expect(auth.user()).toBeNull();
    expect(auth.initializationFailed()).toBe(true);
  });

  it('does not authenticate an unconfirmed signup and uses a same-origin callback', async () => {
    const auth = TestBed.inject(Auth);
    await auth.signUp(' person@example.com ', 'validpassword', ' Person ');
    expect(auth.user()).toBeNull();
    expect(sdk['signUp']).toHaveBeenCalledWith({ email: 'person@example.com', password: 'validpassword', options: {
      data: { full_name: 'Person' }, emailRedirectTo: `${window.location.origin}/auth/callback`,
    } });
  });

  it('signs in, reacts to token refresh and cross-tab logout, and unsubscribes', async () => {
    const auth = TestBed.inject(Auth);
    await auth.signIn('person@example.com', 'validpassword');
    expect(auth.user()?.id).toBe('user-1');
    listener('TOKEN_REFRESHED', session);
    listener('SIGNED_OUT', null);
    expect(auth.user()).toBeNull();
    await auth.signIn('person@example.com', 'validpassword');
    await auth.signOut();
    expect(auth.user()).toBeNull();
    expect(sdk['signOut']).toHaveBeenCalledOnce();
    TestBed.resetTestingModule();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('keeps a session when logout fails and propagates login errors', async () => {
    const auth = TestBed.inject(Auth);
    await auth.signIn('person@example.com', 'validpassword');
    sdk['signOut'].mockResolvedValue({ error: { status: 503 } });
    await expect(auth.signOut()).rejects.toEqual({ status: 503 });
    expect(auth.user()).not.toBeNull();
    sdk['signInWithPassword'].mockResolvedValue({ error: { code: 'invalid_credentials' } });
    await expect(auth.signIn('person@example.com', 'invalid')).rejects.toEqual({ code: 'invalid_credentials' });
  });

  it('exchanges PKCE codes and recognizes recovery only from the SDK auth event', async () => {
    const auth = TestBed.inject(Auth);
    expect(await auth.completeCallback('confirmation-code', 'flow-id')).toBe('confirmation');
    sdk['exchangeCodeForSession'].mockImplementationOnce(async () => {
      listener('PASSWORD_RECOVERY', session);
      return { data: { session }, error: null };
    });
    expect(await auth.completeCallback('recovery-code')).toBe('recovery');
    expect(auth.recovering()).toBe(true);
    await auth.updatePassword('newvalidpassword');
    expect(sdk['updateUser']).toHaveBeenCalledWith({ password: 'newvalidpassword' });
    expect(auth.recovering()).toBe(false);
  });

  it('rejects expired callback codes and forwards recovery/resend redirect settings', async () => {
    const auth = TestBed.inject(Auth);
    sdk['exchangeCodeForSession'].mockResolvedValueOnce({ data: { session: null }, error: { code: 'otp_expired' } });
    await expect(auth.completeCallback('expired')).rejects.toEqual({ code: 'otp_expired' });
    await auth.resetPassword('person@example.com');
    await auth.resendConfirmationEmail('person@example.com');
    expect(sdk['resetPasswordForEmail']).toHaveBeenCalledWith('person@example.com', { redirectTo: `${window.location.origin}/auth/callback` });
    expect(sdk['resend']).toHaveBeenCalledWith({ type: 'signup', email: 'person@example.com', options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
  });

  it('does not subscribe to browser auth during SSR', async () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    const auth = TestBed.inject(Auth);
    await auth.ready;
    expect(sdk['onAuthStateChange']).not.toHaveBeenCalled();
    expect(sdk['getSession']).not.toHaveBeenCalled();
    expect(auth.user()).toBeNull();
  });

  it('uses safe errors and restricts return destinations to Profile', () => {
    expect(authErrorMessage({ status: 429 })).toContain('Too many');
    expect(authErrorMessage({ message: 'registered-email@example.com' })).not.toContain('registered-email');
    for (const target of ['https://evil.test', '//evil.test', '/profile-evil', '/shop', '/profile\\evil']) {
      expect(profileDestination(target)).toBe('/profile');
    }
    expect(profileDestination('/profile/security')).toBe('/profile/security');
  });
});
