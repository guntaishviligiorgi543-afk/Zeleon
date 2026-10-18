import { signal } from '@angular/core';
import { User } from '@supabase/supabase-js';
import { vi } from 'vitest';

export function createAuthStub() {
  return {
    user: signal<User | null>(null), initialized: signal(true), recovering: signal(false),
    initializationFailed: signal(false), ready: Promise.resolve(),
    signUp: vi.fn().mockResolvedValue({ user: { id: 'user-1' }, session: null }),
    signIn: vi.fn().mockResolvedValue(undefined), signOut: vi.fn().mockResolvedValue(undefined),
    resetPassword: vi.fn().mockResolvedValue(undefined), updatePassword: vi.fn().mockResolvedValue(undefined),
    resendConfirmationEmail: vi.fn().mockResolvedValue(undefined),
    completeCallback: vi.fn().mockResolvedValue('confirmation'),
  };
}
