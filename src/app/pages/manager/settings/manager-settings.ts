import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../../services/auth';
import { StaffAccess } from '../../../services/staff-access';

@Component({
  selector: 'app-manager-settings',
  imports: [RouterLink],
  templateUrl: './manager-settings.html',
  styleUrls: ['../manager-page.css', './manager-settings.css'],
})
export class ManagerSettings {
  readonly auth = inject(Auth);
  readonly staff = inject(StaffAccess);
  private readonly router = inject(Router);
  readonly pending = signal(false);
  readonly error = signal('');

  async refresh(): Promise<void> {
    this.pending.set(true);
    this.error.set('');
    try {
      await this.staff.load();
      if (!this.staff.canAccess('manager'))
        await this.router.navigateByUrl('/staff-auth?returnUrl=%2Fmanager%2Fsettings');
    } catch {
      this.error.set('The protected session could not be refreshed.');
    } finally {
      this.pending.set(false);
    }
  }

  async lock(): Promise<void> {
    this.pending.set(true);
    try {
      await this.staff.lock();
      await this.router.navigate(['/staff-auth'], { queryParams: { returnUrl: '/manager' } });
    } finally {
      this.pending.set(false);
    }
  }
}
