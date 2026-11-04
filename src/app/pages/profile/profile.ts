import { Component, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Cart } from '../../services/cart';
import { Auth } from '../../services/auth';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-profile',
  styleUrl: './profile.css',
  templateUrl: './profile.html',
})
export class Profile {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  readonly cart = inject(Cart);
  readonly logoutBusy = signal(false);
  readonly logoutError = signal('');
  readonly sections = [
    { path: '/profile/info', label: 'Profile' },
    { path: '/profile/security', label: 'Security' },
    { path: '/profile/shop-info', label: 'Shop Info' },
  ];
  get selectedSection(): string { return this.sections.find((section) => this.router.url.startsWith(section.path))?.label ?? 'Profile'; }

  constructor() {
    effect(() => {
      if (this.auth.initialized() && !this.auth.user()) {
        void this.router.navigate(['/login'], { queryParams: { returnUrl: '/profile' }, replaceUrl: true });
      }
    });
  }

  async logout(): Promise<void> {
    if (this.logoutBusy()) return;
    this.logoutBusy.set(true);
    this.logoutError.set('');
    try { await this.auth.signOut(); await this.router.navigateByUrl('/'); }
    catch { this.logoutError.set('You have been signed out locally. Please sign in again if needed.'); await this.router.navigateByUrl('/'); }
    finally { this.logoutBusy.set(false); }
  }
}
