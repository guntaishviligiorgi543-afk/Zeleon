import { afterNextRender, effect, inject, Injectable, Injector, signal } from '@angular/core';
import { Auth } from './auth';
import { SUPABASE_CLIENT } from './supabase';
import { Analytics } from './analytics';

export const LEGAL_VERSION = '2026-11-23';
const PENDING_KEY = 'zeleon.signup.legal.pending';
type PendingApproval = { at: number; analytics: boolean; version: string };
@Injectable({ providedIn: 'root' })
export class LegalConsents {
  private readonly auth = inject(Auth);
  private readonly db = inject(SUPABASE_CLIENT);
  private readonly injector = inject(Injector);
  readonly analytics = inject(Analytics);
  readonly required = signal(false);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly termsChecked = signal(false);
  readonly privacyChecked = signal(false);
  readonly analyticsChecked = signal(false);
  private generation = 0;

  constructor() {
    afterNextRender(() => {
      effect(() => {
        const userId = this.auth.user()?.id ?? null;
        const initialized = this.auth.initialized();
        if (!initialized) return;
        const generation = ++this.generation;
        this.required.set(false);
        this.loading.set(!!userId);
        if (!userId) return;
        void this.check(userId, generation);
      }, { injector: this.injector });
    });
  }

  private async check(userId: string, generation: number): Promise<void> {
    try {
      const { data, error } = await this.db.from('user_consents')
        .select('terms_version,privacy_version,analytics_consent').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      if (generation !== this.generation) return;
      if (data?.terms_version === LEGAL_VERSION && data?.privacy_version === LEGAL_VERSION) {
        this.required.set(false);
        // Preserve saved browser choice. Browser consent is device-specific.
        return;
      }
      const pending = this.takePending();
      if (pending) {
        this.analytics.setConsent(pending.analytics ? 'accepted' : 'rejected');
        const { error: rpcError } = await this.db.rpc('record_my_legal_consents', {
          p_terms: true, p_privacy: true, p_analytics: pending.analytics,
          p_terms_version: LEGAL_VERSION, p_privacy_version: LEGAL_VERSION,
        });
        if (rpcError) throw rpcError;
        if (generation !== this.generation) return;
        this.required.set(false);
        return;
      }
      this.analyticsChecked.set(this.analytics.consent() === 'accepted');
      this.required.set(true);
    } catch {
      if (generation === this.generation) {
        this.required.set(true);
        this.error.set('We could not verify your legal acknowledgments. Please review and save them to continue.');
      }
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }

  static stageSignup(analytics: boolean): void {
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ at: Date.now(), analytics, version: LEGAL_VERSION }));
    } catch { /* After sign-in the gate collects consent again if unavailable. */ }
  }
  static clearSignup(): void { try { sessionStorage.removeItem(PENDING_KEY); } catch { /* ignore */ } }
  private takePending(): PendingApproval | null {
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      if (!raw) return null;
      sessionStorage.removeItem(PENDING_KEY);
      const value = JSON.parse(raw) as PendingApproval;
      return value.version === LEGAL_VERSION && typeof value.analytics === 'boolean' &&
        Number.isFinite(value.at) && Date.now() - value.at >= 0 && Date.now() - value.at < 30 * 60_000 ? value : null;
    } catch { return null; }
  }

  async accept(): Promise<void> {
    if (!this.termsChecked() || !this.privacyChecked() || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    const selected = this.analyticsChecked();
    try {
      const { error } = await this.db.rpc('record_my_legal_consents', {
        p_terms: true, p_privacy: true, p_analytics: selected,
        p_terms_version: LEGAL_VERSION, p_privacy_version: LEGAL_VERSION,
      });
      if (error) throw error;
      this.analytics.setConsent(selected ? 'accepted' : 'rejected');
      this.required.set(false);
    } catch {
      this.error.set('Could not save your acknowledgment. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }
}