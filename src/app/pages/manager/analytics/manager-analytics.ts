import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ManagerDashboard, ManagerSnapshot } from '../../../services/manager-dashboard';

@Component({
  selector: 'app-manager-analytics',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, FormsModule],
  templateUrl: './manager-analytics.html',
  styleUrls: ['../manager-page.css', './manager-analytics.css'],
})
export class ManagerAnalytics implements OnInit {
  private readonly dashboard = inject(ManagerDashboard);
  readonly days = signal(30);
  readonly snapshot = signal<ManagerSnapshot | null>(null);
  readonly loading = signal(true);
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly maxRevenue = computed(() =>
    Math.max(1, ...(this.snapshot()?.salesSeries.map((point) => point.revenue) ?? [1])),
  );
  readonly averageOrder = computed(() => {
    const data = this.snapshot();
    return data && data.totalOrders ? data.revenue / data.totalOrders : 0;
  });

  ngOnInit(): void {
    void this.load();
  }
  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.snapshot.set(await this.dashboard.getSnapshot(this.days()));
    } catch {
      this.error.set('Analytics could not be loaded. Verify the Manager session and try again.');
    } finally {
      this.loading.set(false);
    }
  }
  async exportPdf(): Promise<void> {
    this.exporting.set(true);
    this.error.set('');
    try {
      const blob = await this.dashboard.exportPdf(this.days());
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `zeleon-manager-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      this.error.set('The protected PDF report could not be generated.');
    } finally {
      this.exporting.set(false);
    }
  }
}
