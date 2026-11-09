import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ManagerDashboard, ManagerSnapshot } from '../../../services/manager-dashboard';

@Component({
  selector: 'app-manager-overview',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, RouterLink],
  templateUrl: './manager-overview.html',
  styleUrls: ['../manager-page.css', './manager-overview.css'],
})
export class ManagerOverview implements OnInit {
  private readonly dashboard = inject(ManagerDashboard);
  readonly snapshot = signal<ManagerSnapshot | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly maxRevenue = computed(() =>
    Math.max(1, ...(this.snapshot()?.salesSeries.map((point) => point.revenue) ?? [1])),
  );

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.snapshot.set(await this.dashboard.getSnapshot());
    } catch {
      this.error.set(
        'Dashboard data could not be loaded. Verify the Manager session and try again.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
