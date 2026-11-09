import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  ManagerDashboard,
  StaffDirectoryEntry,
  StaffManagementError,
} from '../../../services/manager-dashboard';
import { StaffStatus } from '../../../services/staff-access';

@Component({
  selector: 'app-manager-staff',
  imports: [DatePipe, ReactiveFormsModule],
  templateUrl: './manager-staff.html',
  styleUrls: ['../manager-page.css', './manager-staff.css'],
})
export class ManagerStaff implements OnInit {
  private readonly dashboard = inject(ManagerDashboard);
  readonly staff = signal<StaffDirectoryEntry[]>([]);
  readonly loading = signal(true);
  readonly pendingId = signal<string | null>(null);
  readonly error = signal('');
  readonly success = signal('');
  readonly assignOpen = signal(false);
  readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    role: new FormControl<'admin' | 'support'>('support', { nonNullable: true }),
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.staff.set(await this.dashboard.getStaffDirectory());
    } catch {
      this.error.set(
        'The staff directory could not be loaded. Verify the Manager session and try again.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  async assign(): Promise<void> {
    if (this.pendingId()) return;
    this.success.set('');
    this.form.controls.email.setValue(this.form.controls.email.value.trim().toLowerCase());
    this.form.markAllAsTouched();
    if (this.form.invalid || this.pendingId()) return;
    this.pendingId.set('new');
    this.error.set('');
    this.success.set('');
    try {
      const result = await this.dashboard.manageStaff({ action: 'assign', ...this.form.getRawValue() });
      await this.load();
      this.assignOpen.set(false);
      this.form.reset({ email: '', role: 'support' });
      this.success.set(result.notificationSent ? 'Staff role assigned. A welcome email was sent.' : 'Staff role assigned, but the notification email could not be sent.');
    } catch (error) {
      this.error.set(
        error instanceof StaffManagementError
          ? error.message
          : 'The staff service could not be reached. Check your connection and try again.',
      );
    } finally {
      this.pendingId.set(null);
    }
  }

  async removeRole(entry: StaffDirectoryEntry): Promise<void> {
    if (this.pendingId() || entry.role === 'manager') return;
    if (!confirm(`Permanently remove ${entry.role} access for ${entry.email}? Their customer account will remain active.`)) return;
    this.pendingId.set(entry.user_id);
    this.error.set('');
    this.success.set('');
    try {
      const result = await this.dashboard.manageStaff({action:'remove',targetUserId:entry.user_id});
      await this.load();
      this.success.set(result.notificationSent ? 'Staff role removed. Notification email sent.' : 'Staff role removed, but the notification email could not be sent.');
    } catch (error) {
      this.error.set(error instanceof StaffManagementError ? error.message : 'Unable to remove staff access. Please try again.');
    } finally { this.pendingId.set(null); }
  }

  async setStatus(entry: StaffDirectoryEntry, status: StaffStatus): Promise<void> {
    if (this.pendingId()) return;
    const verb =
      status === 'suspended' ? 'Suspend' : status === 'active' ? 'Reactivate' : 'Place on leave';
    if (!confirm(`${verb} ${entry.email}?`)) return;
    this.pendingId.set(entry.user_id);
    this.error.set('');
    this.success.set('');
    try {
      const result = await this.dashboard.manageStaff({
        action: 'set_status',
        targetUserId: entry.user_id,
        status,
      });
      await this.load();
      this.success.set(result.notificationSent ? `Staff status changed to ${status.replace('_', ' ')}. Notification email sent.` : `Staff status changed to ${status.replace('_', ' ')}, but the notification email could not be sent.`);
    } catch {
      this.error.set(
        'The staff status could not be changed. Manager accounts and your own assignment are protected.',
      );
    } finally {
      this.pendingId.set(null);
    }
  }
}
