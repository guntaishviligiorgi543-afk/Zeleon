import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ManagerDashboard, ManagerOrder } from '../../../services/manager-dashboard';

@Component({
  selector: 'app-manager-orders',
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './manager-orders.html',
  styleUrls: ['../manager-page.css', './manager-orders.css'],
})
export class ManagerOrders implements OnInit {
  private readonly dashboard = inject(ManagerDashboard);
  readonly orders = signal<ManagerOrder[]>([]);
  readonly query = signal('');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly expanded = signal<string | null>(null);
  readonly filtered = computed(() => {
    const term = this.query().trim().toLowerCase();
    return term
      ? this.orders().filter((order) =>
          `${order.order_number} ${order.customer_email} ${order.customer_first_name ?? ''} ${order.customer_last_name ?? ''}`
            .toLowerCase()
            .includes(term),
        )
      : this.orders();
  });
  ngOnInit(): void {
    void this.load();
  }
  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.orders.set(await this.dashboard.getOrders());
    } catch {
      this.error.set('Orders could not be loaded. Verify the Manager session and try again.');
    } finally {
      this.loading.set(false);
    }
  }
}
