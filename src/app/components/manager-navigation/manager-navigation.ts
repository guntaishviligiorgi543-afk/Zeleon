import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  PendingTasks,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';
import { SUPABASE_CLIENT } from '../../services/supabase';

@Component({
  selector: 'app-manager-navigation',
  imports: [RouterLink],
  templateUrl: './manager-navigation.html',
  styleUrl: './manager-navigation.css',
})
export class ManagerNavigation {
  private readonly auth = inject(Auth);
  private readonly client = inject(SUPABASE_CLIENT);
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly pendingTasks = inject(PendingTasks);
  private readonly router = inject(Router);
  private readonly verifiedManagerId = signal<string | null>(null);
  private readonly insideManager = signal(this.router.url.startsWith('/manager'));
  private requestVersion = 0;

  readonly visible = computed(
    () =>
      this.auth.initialized() &&
      this.auth.isAuthenticated() &&
      !this.insideManager() &&
      this.verifiedManagerId() !== null &&
      this.verifiedManagerId() === this.auth.user()?.id,
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    effect(() => {
      const userId =
        this.auth.initialized() && this.auth.isAuthenticated() ? this.auth.user()?.id : null;
      this.verifiedManagerId.set(null);
      this.requestVersion++;
      if (this.browser && userId) this.pendingTasks.run(() => this.refresh(userId));
    });
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.insideManager.set(event.urlAfterRedirects.startsWith('/manager'));
        this.recheck();
      }
    });
    if (this.browser) {
      const onVisible = () => {
        if (this.document.visibilityState === 'visible') this.recheck();
      };
      this.document.addEventListener('visibilitychange', onVisible);
      this.document.defaultView?.addEventListener('focus', onVisible);
      // Keep a visible shortcut current after suspension, without touching or
      // extending the staff grant. The route guard always verifies again.
      const timer = setInterval(() => {
        if (this.visible() && this.document.visibilityState === 'visible') this.recheck();
      }, 60_000);
      destroyRef.onDestroy(() => {
        clearInterval(timer);
        this.document.removeEventListener('visibilitychange', onVisible);
        this.document.defaultView?.removeEventListener('focus', onVisible);
      });
    }
    destroyRef.onDestroy(() => {
      this.requestVersion++;
    });
  }

  private recheck(): void {
    const userId = this.auth.user()?.id;
    if (this.browser && this.auth.initialized() && this.auth.isAuthenticated() && userId) {
      this.pendingTasks.run(() => this.refresh(userId));
    }
  }

  private async refresh(expectedUserId: string): Promise<void> {
    const version = ++this.requestVersion;
    try {
      // Same RLS-protected assignment source as StaffAccess.load(). This lookup
      // only controls navigation visibility; it grants no workspace privileges.
      const {
        data: { user },
        error: userError,
      } = await this.client.auth.getUser();
      if (userError || user?.id !== expectedUserId) throw new Error('Session not verified');
      const { data, error } = await this.client
        .from('staff_roles')
        .select('user_id, role, status')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (version !== this.requestVersion || this.auth.user()?.id !== expectedUserId) return;
      this.verifiedManagerId.set(
        data?.user_id === expectedUserId && data.role === 'manager' && data.status === 'active'
          ? expectedUserId
          : null,
      );
    } catch {
      if (version === this.requestVersion) this.verifiedManagerId.set(null);
    }
  }
}
