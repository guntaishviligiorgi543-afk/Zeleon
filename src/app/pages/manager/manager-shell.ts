import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Auth } from '../../services/auth';
import { StaffAccess } from '../../services/staff-access';

interface ManagerNavItem {
  path: string;
  label: string;
  icon: string;
  exact?: boolean;
}

@Component({
  selector: 'app-manager-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './manager-shell.html',
  styleUrl: './manager-shell.css',
})
export class ManagerShell {
  private readonly router = inject(Router);
  readonly auth = inject(Auth);
  readonly staff = inject(StaffAccess);
  readonly workspaceName = this.router.url.startsWith('/admin') ? 'Admin' : this.router.url.startsWith('/support') ? 'Support' : 'Manager';
  readonly menuOpen = signal(false);
  readonly navItems: ManagerNavItem[] = this.workspaceName === 'Admin' ? [
    { path: '/admin', label: 'Products', icon: 'products', exact: true },
    { path: '/admin/staff', label: 'Support Staff', icon: 'staff' },
    { path: '/admin/support', label: 'Conversations', icon: 'support' },
  ] : this.workspaceName === 'Support' ? [
    { path: '/support', label: 'My Conversations', icon: 'support', exact: true },
  ] : [
    { path: '/manager', label: 'Overview', icon: 'overview', exact: true },
    { path: '/manager/products', label: 'Products', icon: 'products' },
    { path: '/manager/staff', label: 'Staff', icon: 'staff' },
    { path: '/manager/support', label: 'Support', icon: 'support' },
    { path: '/manager/orders', label: 'Orders', icon: 'orders' },
    { path: '/manager/analytics', label: 'Analytics', icon: 'analytics' },
    { path: '/manager/settings', label: 'Settings', icon: 'settings' },
  ];

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.menuOpen.set(false));
  }

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }
}
