import { DOCUMENT } from '@angular/common';
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
  host: { '[class.workspace-dark]': 'darkTheme()' },
})
export class ManagerShell {
  private readonly document = inject(DOCUMENT);
  readonly darkTheme = signal(this.readTheme());

  private readTheme(): boolean {
    try { return this.document.defaultView?.localStorage.getItem('zeleon-workspace-theme') === 'dark'; }
    catch { return false; }
  }

  toggleTheme(): void {
    this.darkTheme.update(value => !value);
    try { this.document.defaultView?.localStorage.setItem('zeleon-workspace-theme', this.darkTheme() ? 'dark' : 'light'); }
    catch { /* The toggle remains usable when browser storage is unavailable. */ }
  }
  private readonly router = inject(Router);
  readonly auth = inject(Auth);
  readonly staff = inject(StaffAccess);
  readonly workspaceName = this.router.url.startsWith('/admin') ? 'Admin' : this.router.url.startsWith('/support') ? 'Support' : 'Manager';
  readonly menuOpen = signal(false);
  readonly navItems: ManagerNavItem[] = this.workspaceName === 'Admin' ? [
    { path: '/admin', label: 'Products', icon: 'products', exact: true },
    { path: '/admin/users', label: 'Users', icon: 'users' },
    { path: '/admin/staff', label: 'Support Staff', icon: 'staff' },
    { path: '/admin/support', label: 'Conversations', icon: 'support' },
  ] : this.workspaceName === 'Support' ? [
    { path: '/support', label: 'My Conversations', icon: 'support', exact: true },
  ] : [
    { path: '/manager', label: 'Overview', icon: 'overview', exact: true },
    { path: '/manager/products', label: 'Products', icon: 'products' },
    { path: '/manager/users', label: 'Users', icon: 'users' },
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
