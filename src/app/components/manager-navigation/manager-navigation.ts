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
  private readonly verifiedAssignment = signal<{ userId: string; role: 'manager' | 'admin' | 'support' } | null>(null);
  private readonly insideWorkspace = signal(/^\/(manager|admin|support)(\/|$)/.test(this.router.url));
  readonly destination = computed(() => '/' + (this.verifiedAssignment()?.role ?? 'manager'));
  readonly label = computed(() => { const role = this.verifiedAssignment()?.role; return role ? role.charAt(0).toUpperCase() + role.slice(1) + ' Dashboard' : 'Staff Dashboard'; });
  private requestVersion = 0;

  readonly visible = computed(
    () =>
      this.auth.initialized() &&
      this.auth.isAuthenticated() &&
      !this.insideWorkspace() &&
      this.verifiedAssignment()?.userId === this.auth.user()?.id,
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    effect(() => {
      const userId =
        this.auth.initialized() && this.auth.isAuthenticated() ? this.auth.user()?.id : null;
      this.verifiedAssignment.set(null);
      this.requestVersion++;
      if (this.browser && userId) this.pendingTasks.run(() => this.refresh(userId));
    });
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.insideWorkspace.set(/^\/(manager|admin|support)(\/|$)/.test(event.urlAfterRedirects));
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
      this.verifiedAssignment.set(
        data?.user_id === expectedUserId &&
        ['manager', 'admin', 'support'].includes(data.role) && data.status === 'active'
          ? { userId: expectedUserId, role: data.role as 'manager' | 'admin' | 'support' }
          : null,
      );
    } catch {
      if (version === this.requestVersion) this.verifiedAssignment.set(null);
    }
  }
}
