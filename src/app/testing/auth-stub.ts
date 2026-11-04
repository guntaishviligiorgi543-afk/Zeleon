import { computed, signal } from '@angular/core';
import { vi } from 'vitest';

export function createAuthStub() {
  const user = signal<any>(null);
  const recovering = signal(false);
  return {
    user, isAuthenticated: computed(() => !!user()), initialized: signal(true), recovering,
    initializationFailed: signal(false), ready: Promise.resolve(),
    signUp: vi.fn().mockImplementation(async () => {
      user.set({ id: 'user-1', email: 'person@example.com' });
      return { hasSession: true };
    }),
    signIn: vi.fn().mockImplementation(async () => { user.set({ id: 'user-1' }); }),
    signOut: vi.fn().mockImplementation(async () => { user.set(null); }),
    resetPassword: vi.fn().mockResolvedValue(undefined), updatePassword: vi.fn().mockResolvedValue(undefined),
    resendConfirmationEmail: vi.fn().mockResolvedValue(undefined),
    verifyEmailOtp: vi.fn().mockImplementation(async (_email: string, _token: string, type: 'email' | 'recovery') => {
      user.set({ id: 'user-1', email: 'person@example.com' });
      recovering.set(type === 'recovery');
    }),
    completeCallback: vi.fn().mockResolvedValue('confirmation'),
  };
}
