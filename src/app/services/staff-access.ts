import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { SUPABASE_CLIENT } from './supabase';
import { Auth } from './auth';

export type StaffRole = 'manager' | 'admin' | 'support';
export type StaffStatus = 'active' | 'suspended' | 'on_leave';

export interface StaffAssignment {
  user_id: string;
  role: StaffRole;
  status: StaffStatus;
}

const STAFF_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class StaffAccess {
  private readonly client = inject(SUPABASE_CLIENT);
  private readonly auth = inject(Auth);
  private readonly destroyRef = inject(DestroyRef);
  private readonly assignmentState = signal<StaffAssignment | null>(null);
  private readonly assuranceLevel = signal<'aal1' | 'aal2' | null>(null);
  private readonly serverGrant = signal(false);
  private lastTouch = 0;
  private touching = false;
  private loadInFlight: Promise<StaffAssignment | null> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private activityHandler = (): void => this.touch();

  readonly assignment = computed(() => this.assignmentState());
  readonly role = computed(() => this.assignmentState()?.role ?? null);
  readonly status = computed(() => this.assignmentState()?.status ?? null);
  readonly isVerified = computed(
    () => this.status() === 'active' && this.assuranceLevel() === 'aal2' && this.serverGrant(),
  );

  constructor() {
    this.destroyRef.onDestroy(() => this.stopWorkspaceSession());
  }

  load(): Promise<StaffAssignment | null> {
    if (this.loadInFlight) return this.loadInFlight;
    const pending = this.loadAssignment();
    this.loadInFlight = pending;
    void pending.finally(() => {
      if (this.loadInFlight === pending) this.loadInFlight = null;
    }).catch(() => {});
    return pending;
  }

  private async loadAssignment(): Promise<StaffAssignment | null> {
    await this.auth.ready;
    const user = await this.auth.getCurrentUser();
    if (!user) {
      this.clear();
      return null;
    }

    const [{ data, error }, assurance] = await Promise.all([
      this.client
        .from('staff_roles')
        .select('user_id, role, status')
        .eq('user_id', user.id)
        .maybeSingle(),
      this.client.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (error) throw error;
    if (assurance.error) throw assurance.error;
    const assignment = data as StaffAssignment | null;
    this.assignmentState.set(assignment);
    this.assuranceLevel.set(
      assurance.data.currentLevel === 'aal2'
        ? 'aal2'
        : assurance.data.currentLevel === 'aal1'
          ? 'aal1'
          : null,
    );
    this.serverGrant.set(false);
    if (assignment?.status === 'active' && this.assuranceLevel() === 'aal2') {
      const grant = await this.client.rpc('staff_session');
      if (grant.error) throw grant.error;
      this.serverGrant.set(grant.data === true);
      if (this.serverGrant()) this.startWorkspaceSession();
    }
    return assignment;
  }

  async verifySecondaryAuthentication(currentPassword: string, code: string): Promise<void> {
    await this.auth.ready;
    const assignment = await this.load();
    if (assignment?.status !== 'active') throw new Error('Active staff access is required.');
    const email = this.auth.user()?.email;
    if (!email) throw new Error('An email address is required for staff authentication.');
    const { data: passwordData, error: passwordError } = await this.client.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (passwordError) throw passwordError;
    if (!passwordData.user || !passwordData.session)
      throw new Error('Password verification did not return a session.');

    const { data: factors, error: factorsError } = await this.client.auth.mfa.listFactors();
    if (factorsError) throw factorsError;
    const factor = factors.totp.find((candidate) => candidate.status === 'verified');
    if (!factor)
      throw new Error('Enroll a verified authenticator app before entering a staff workspace.');
    const { error: verifyError } = await this.client.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code,
    });
    if (verifyError) {
      if (verifyError.message.toLowerCase().includes('invalid') || verifyError.message.toLowerCase().includes('expired'))
        throw new Error('Authenticator code was rejected. Wait for the next 6-digit code and verify your device clock is automatic.');
      throw verifyError;
    }

    const grant = await this.client.rpc('staff_open_session');
    if (grant.error) throw new Error('MFA verified, but the protected staff session could not be opened. Please retry.');

    await this.load();
    if (!this.isVerified())
      throw new Error('Staff authentication did not reach the required assurance level.');
    this.startWorkspaceSession();
  }

  canAccess(role: StaffRole): boolean {
    return this.isVerified() && this.role() === role;
  }

  clear(): void {
    this.stopWorkspaceSession();
    this.assignmentState.set(null);
    this.assuranceLevel.set(null);
    this.serverGrant.set(false);
  }

  async lock(): Promise<void> {
    try {
      await this.client.rpc('staff_session', { p_revoke: true });
    } finally {
      this.clear();
    }
  }

  private startWorkspaceSession(): void {
    if (typeof window === 'undefined') return;
    this.stopWorkspaceSession();
    for (const event of ['pointerdown', 'keydown', 'touchstart'])
      window.addEventListener(event, this.activityHandler, { passive: true });
    this.touch();
  }

  private touch(): void {
    if (!this.isVerified() || typeof window === 'undefined') return;
    if (this.idleTimer) window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      this.clear();
      void this.client.rpc('staff_session', { p_revoke: true }).then(() => {});
    }, STAFF_IDLE_TIMEOUT_MS);
    if (
      /^\/(manager|admin|support)(?:\/|$)/.test(window.location.pathname) &&
      !this.touching &&
      Date.now() - this.lastTouch > 30_000
    ) {
      this.touching = true;
      this.lastTouch = Date.now();
      void Promise.resolve(this.client.rpc('staff_session', { p_touch: true }))
        .then(({ data, error }) => {
          if (error || data !== true) this.clear();
        })
        .catch(() => this.clear())
        .finally(() => {
          this.touching = false;
        });
    }
  }

  private stopWorkspaceSession(): void {
    if (typeof window !== 'undefined') {
      for (const event of ['pointerdown', 'keydown', 'touchstart'])
        window.removeEventListener(event, this.activityHandler);
      if (this.idleTimer) window.clearTimeout(this.idleTimer);
    }
    this.idleTimer = null;
  }
}
