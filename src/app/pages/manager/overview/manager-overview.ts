import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ManagerDashboard, ManagerSnapshot, ManagerProduct } from '../../../services/manager-dashboard';

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
  readonly lowStock = signal<ManagerProduct[]>([]);
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
      const [snapshot, products] = await Promise.all([this.dashboard.getSnapshot(), this.dashboard.getProducts()]);
      this.snapshot.set(snapshot);
      this.lowStock.set(products.filter(p => p.is_active && (p.inventory?.quantity ?? 0) <= (p.inventory?.low_stock_threshold ?? 10)));
    } catch {
      this.error.set(
        'Dashboard data could not be loaded. Verify the Manager session and try again.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
