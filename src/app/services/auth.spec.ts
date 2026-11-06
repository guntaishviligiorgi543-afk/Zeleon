import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { Auth, authErrorMessage, profileDestination } from './auth';
import { SUPABASE_CLIENT } from './supabase';
import { vi } from 'vitest';

const user = {
  id: 'user-1', email: 'person@example.com', user_metadata: {
    first_name: 'Nino', last_name: 'Example', phone_number: '+995555123456',
  },
};

describe('Auth', () => {
  let supabase: any;

  beforeEach(() => {
    supabase = {
      auth: {
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
        signUp: vi.fn().mockResolvedValue({ data: { user, session: { user } }, error: null }),
        signInWithPassword: vi.fn().mockResolvedValue({ data: { user, session: { user } }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
        resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
        updateUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
        resend: vi.fn().mockResolvedValue({ error: null }),
        verifyOtp: vi.fn().mockResolvedValue({ data: { user, session: { user } }, error: null }),
        exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session: { user } }, error: null }),
      },
      from: vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: null }),
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })),
      })),
      functions: { invoke: vi.fn().mockResolvedValue({ error: null }) },
    };
    TestBed.configureTestingModule({ providers: [
      { provide: SUPABASE_CLIENT, useValue: supabase },
      { provide: PLATFORM_ID, useValue: 'browser' },
    ] });
  });

  it('registers with email, password and display metadata', async () => {
    const auth = TestBed.inject(Auth);
    await auth.ready;
    await expect(auth.signUp(' person@example.com ', 'test-password', {
      firstName: ' Nino ', lastName: ' Example ',
    })).resolves.toEqual({ hasSession: true });
    expect(supabase.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'person@example.com', password: 'test-password',
      options: expect.objectContaining({ data: {
        first_name: 'Nino', last_name: 'Example', preferred_name: '',
      } }),
    }));
    expect(auth.user()?.email).toBe('person@example.com');
  });

  it('requires a returned Supabase session for password sign-in', async () => {
    const auth = TestBed.inject(Auth);
    await auth.signIn('person@example.com', 'test-password');
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'person@example.com', password: 'test-password' });
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.user()?.firstName).toBe('Nino');
    supabase.auth.signInWithPassword.mockResolvedValueOnce({ data: { user, session: null }, error: null });
    await expect(auth.signIn('person@example.com', 'test-password')).rejects.toThrow('did not return a session');
  });

  it('requests password recovery and changes only through Supabase confirmation', async () => {
    const auth = TestBed.inject(Auth);
    await auth.resetPassword('person@example.com');
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('person@example.com');
    await auth.verifyEmailOtp('person@example.com', '12345678', 'recovery');
    await auth.updatePassword('new-test-password');
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'new-test-password' });
    expect(supabase.auth.getUser).toHaveBeenCalled();
    expect(auth.user()?.id).toBe('user-1');
    expect(auth.user()?.email).toBe('person@example.com');
  });

  it('does not report success when Supabase rejects the password update', async () => {
    const auth = TestBed.inject(Auth);
    supabase.auth.updateUser.mockResolvedValueOnce({ data: { user: null }, error: { code: 'weak_password' } });
    await expect(auth.updatePassword('short')).rejects.toEqual({ code: 'weak_password' });
    expect(auth.recovering()).toBe(false);
  });

  it('rejects a password update returned for a different user', async () => {
    const auth = TestBed.inject(Auth);
    supabase.auth.updateUser.mockResolvedValueOnce({
      data: { user: { ...user, id: 'different-user' } },
      error: null,
    });
    await expect(auth.updatePassword('new-test-password')).rejects.toThrow('authenticated account');
  });

  it('passes the unchanged new password to a subsequent login', async () => {
    const auth = TestBed.inject(Auth);
    await auth.signIn('person@example.com', 'new-test-password');
    expect(supabase.auth.signInWithPassword).toHaveBeenLastCalledWith({
      email: 'person@example.com',
      password: 'new-test-password',
    });
  });

  it('verifies email and recovery codes with the matching OTP types', async () => {
    const auth = TestBed.inject(Auth);
    await auth.verifyEmailOtp(' person@example.com ', '123456', 'email');
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ email: 'person@example.com', token: '123456', type: 'email' });
    expect(auth.isAuthenticated()).toBe(true);
    await auth.verifyEmailOtp('person@example.com', '654321', 'recovery');
    expect(supabase.auth.verifyOtp).toHaveBeenLastCalledWith({ email: 'person@example.com', token: '654321', type: 'recovery' });
    expect(auth.recovering()).toBe(true);
    supabase.auth.verifyOtp.mockResolvedValueOnce({ data: { user, session: null }, error: null });
    await expect(auth.verifyEmailOtp('person@example.com', '000000', 'email')).rejects.toThrow('did not return an authenticated session');
  });

  it('requests and verifies email changes using the email_change OTP type', async () => {
    const auth = TestBed.inject(Auth);
    const updatedUser = { ...user, email: 'new@example.com' };
    supabase.auth.verifyOtp.mockResolvedValueOnce({ data: { user: updatedUser, session: { user: updatedUser } }, error: null });
    supabase.auth.getUser
      .mockResolvedValueOnce({ data: { user }, error: null })
      .mockResolvedValueOnce({ data: { user: updatedUser }, error: null });
    await auth.requestEmailChange('new@example.com');
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ email: 'new@example.com' });
    await auth.verifyEmailChangeOtp('new@example.com', '12345678');
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ email: 'new@example.com', token: '12345678', type: 'email_change' });
  });

  it('synchronizes the authenticated user after an email change', async () => {
    const auth = TestBed.inject(Auth);
    const updatedUser = { ...user, email: 'new@example.com' };
    supabase.auth.verifyOtp.mockResolvedValueOnce({ data: { user: updatedUser, session: { user: updatedUser } }, error: null });
    supabase.auth.getUser
      .mockResolvedValueOnce({ data: { user }, error: null })
      .mockResolvedValueOnce({ data: { user: updatedUser }, error: null });
    await auth.verifyEmailChangeOtp(' new@example.com ', '12345678');
    expect(supabase.auth.verifyOtp).toHaveBeenLastCalledWith({
      email: 'new@example.com', token: '12345678', type: 'email_change',
    });
    expect(auth.user()?.email).toBe('new@example.com');
  });

  it('rejects an email change when Supabase reports an invalid or expired code', async () => {
    const auth = TestBed.inject(Auth);
    supabase.auth.verifyOtp.mockResolvedValueOnce({ data: { user: null, session: null }, error: { code: 'otp_expired' } });
    await expect(auth.verifyEmailChangeOtp('new@example.com', '12345678')).rejects.toEqual({ code: 'otp_expired' });
  });

  it('reauthenticates with current email before updating password', async () => {
    const auth = TestBed.inject(Auth);
    await auth.signIn('person@example.com', 'old-password');
    await auth.changePasswordWithReauthentication('old-password', 'new-password');
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'person@example.com', password: 'old-password' });
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'new-password' });
  });

  it('reauthenticates before deleting the authenticated account', async () => {
    const auth = TestBed.inject(Auth);
    await auth.signIn('person@example.com', 'current-password');
    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await auth.deleteAccount('current-password');
    expect(supabase.auth.signInWithPassword).toHaveBeenLastCalledWith({
      email: 'person@example.com', password: 'current-password',
    });
    expect(supabase.functions.invoke).toHaveBeenCalledWith('delete-account');
  });

  it('persists preferred names to the dedicated table', async () => {
    const auth = TestBed.inject(Auth);
    await auth.signIn('person@example.com', 'test-password');
    await auth.savePreferredName(' Nini ');
    expect(supabase.from).toHaveBeenCalledWith('user_preferred_names');
    expect(auth.displayName()).toBe('Nini');
  });

  it('imports the signup preferred name after session initialization, without replacing an existing value', async () => {
    const sessionUser = { ...user, user_metadata: { ...user.user_metadata, preferred_name: 'Nini' } };
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: { user: sessionUser } }, error: null });
    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: sessionUser }, error: null });
    const auth = TestBed.inject(Auth);
    await auth.ready;
    expect(supabase.from).toHaveBeenCalledWith('user_preferred_names');
    expect(auth.displayName()).toBe('Nini');
    expect(supabase.from().upsert).toHaveBeenCalledWith(expect.objectContaining({ preferred_name: 'Nini' }), { onConflict: 'user_id' });
  });

  it('clears app state on local logout even when the provider reports an error', async () => {
    const auth = TestBed.inject(Auth);
    await auth.signIn('person@example.com', 'test-password');
    supabase.auth.signOut.mockResolvedValueOnce({ error: new Error('offline') });
    await expect(auth.signOut()).rejects.toThrow('offline');
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(auth.user()).toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
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
